<?php
/**
 * Servidor/router SOLO para QA de:
 *   - /dashboard/settings/auth
 *   - /dashboard/settings/smtp
 *   - /dashboard/settings/notifications
 *   - /dashboard/compliance (+ tax-forms)
 *   - /dashboard/profile
 *
 * Uso: php -S 127.0.0.1:8095 -t <backend> scripts/qa_settings_compliance_server.php
 */

require_once __DIR__ . '/../vendor/autoload.php';
try { (Dotenv\Dotenv::createImmutable(__DIR__ . '/..'))->safeLoad(); } catch (Throwable $e) {}

\App\Support\Cache::set('schema_migrated_at', time(), 3600);
\App\Support\Cache::set('system_settings_schema_v1', time(), 3600);

// Desactiva SMTP real (evita enviar correos en las pruebas)
$pdo_tmp = null;
unset($_ENV['SMTP_HOST'], $_ENV['SMTP_USER'], $_ENV['SMTP_PASS'], $_ENV['SMTP_FROM_EMAIL']);

class QaDatabase extends \App\Database
{
    private PDO $qaPdo;
    public function __construct(PDO $pdo) { $this->qaPdo = $pdo; }
    public function pdo(): PDO { return $this->qaPdo; }
}

$dbFile = __DIR__ . '/../storage/qa_settings_compliance.sqlite';
$pdo = new PDO('sqlite:' . $dbFile, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->sqliteCreateFunction('NOW', fn() => date('Y-m-d H:i:s'));

$pdo->exec("
CREATE TABLE IF NOT EXISTS system_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT, company_id TEXT, type TEXT DEFAULT 'info', title TEXT, message TEXT, link TEXT, is_read INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS compliance_requirements (id TEXT PRIMARY KEY, country_id INTEGER, document_type TEXT, is_mandatory INTEGER DEFAULT 1, description TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS user_compliance_documents (id TEXT PRIMARY KEY, user_id TEXT, requirement_id TEXT, file_path TEXT, status TEXT DEFAULT 'pending', expiry_date TEXT, rejection_reason TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS tax_forms (id TEXT PRIMARY KEY, user_id TEXT, type TEXT, data TEXT, status TEXT, signed_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, full_name TEXT, email TEXT, platform_role TEXT, status TEXT, global_permissions TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS countries (id INTEGER PRIMARY KEY, iso2 TEXT, name TEXT);
CREATE TABLE IF NOT EXISTS password_resets (email TEXT, token TEXT, created_at TEXT);
");

$pdo->exec("
INSERT OR IGNORE INTO countries (id, iso2, name) VALUES (1,'PE','Perú');
INSERT OR IGNORE INTO users (id, full_name, email, platform_role, status, created_at) VALUES
 ('qa-user','Normal User','normal@example.com','user','active',datetime('now')),
 ('qa-admin','Super Admin','admin@example.com','super_admin','active',datetime('now')),
 ('qa-other','Other User','other@example.com','user','active',datetime('now'));
INSERT OR IGNORE INTO notifications (id, user_id, type, title, message, is_read, created_at) VALUES
 ('n1','qa-user','info','Bienvenido','Hola',0,datetime('now')),
 ('n2','qa-user','success','Pago','Recibido',1,datetime('now')),
 ('n3','qa-other','warning','Otro','No tuyo',0,datetime('now'));
INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES
 ('google_client_id','cid.apps.googleusercontent.com'),
 ('google_client_secret','secret123'),
 ('smtp_host',''),
 ('smtp_user',''),
 ('smtp_pass','pass123'),
 ('system_api_url','https://api.example.com/public');
");

$as = $_GET['__as'] ?? 'user';
if ($as === 'admin') {
    $qaUser = ['id' => 'qa-admin', 'full_name' => 'Super Admin', 'email' => 'admin@example.com', 'status' => 'active', 'platform_role' => 'super_admin'];
} else {
    $qaUser = ['id' => 'qa-user', 'full_name' => 'Normal User', 'email' => 'normal@example.com', 'status' => 'active', 'platform_role' => 'user'];
}
$ref = new ReflectionClass(\App\Support\Auth::class);
$prop = $ref->getProperty('user');
$prop->setAccessible(true);
$prop->setValue(null, $qaUser);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if ($path === '/__health') {
    header('Content-Type: application/json');
    echo json_encode(['ok' => true]);
    exit;
}

$segs = array_values(array_filter(explode('/', trim((string)$path, '/')), fn($s) => $s !== ''));
$api = array_search('api', $segs, true);
if ($api === false) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['message' => 'not found']);
    exit;
}
$segs = array_slice($segs, $api);
$table = strtolower($segs[1] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$db = new QaDatabase($pdo);

if ($table === 'system-settings') {
    $ctrl = new \App\Controllers\SystemSettingsController($db);
    $sub = $segs[2] ?? '';
    if ($sub === 'test-smtp') { $ctrl->testSmtp(); exit; }
    $ctrl->handle($method);
    exit;
}

if ($table === 'notifications') {
    (new \App\Controllers\NotificationController($db))->handle($segs, $method);
    exit;
}

if ($table === 'compliance') {
    if (($segs[2] ?? '') === 'labor-law-alerts') {
        (new \App\Controllers\LaborLawAlertController($db))->handle($segs, $method);
        exit;
    }
    (new \App\Controllers\ComplianceController($db))->handle($segs, $method);
    exit;
}

if ($table === 'tax-forms') {
    $ctrl = new \App\Controllers\TaxFormController($db);
    $user = \App\Support\Auth::user();
    $sub = $segs[2] ?? '';
    if ($method === 'GET' && $sub === 'me') { $ctrl->getMyForm($user['id']); exit; }
    if ($method === 'POST' && !$sub) { $ctrl->submit(); exit; }
    if ($method === 'GET' && !$sub) { $ctrl->index(); exit; }
    if ($method === 'GET' && ($segs[3] ?? '') === 'download') { $ctrl->downloadPdf($segs[2]); exit; }
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['message' => 'tax-forms not found']);
    exit;
}

if ($table === 'users') {
    (new \App\Controllers\UserController($db))->handle($segs, $method);
    exit;
}

http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['message' => 'not found', 'table' => $table]);
