<?php
/**
 * Servidor/router SOLO para QA de Spectra Sign.
 * Reemplaza MySQL por SQLite con fixtures y desactiva el DDL (Cache),
 * permitiendo correr los controladores REALES por HTTP sin BD externa.
 *
 * Uso: php -S 127.0.0.1:8099 -t <backend> scripts/qa_spectra_sign_server.php
 */

require_once __DIR__ . '/../vendor/autoload.php';
try { (Dotenv\Dotenv::createImmutable(__DIR__ . '/..'))->safeLoad(); } catch (Throwable $e) {}

// Evita que EnvelopeController ejecute DDL MySQL en SQLite
\App\Support\Cache::set('schema_migrated_at', time(), 3600);
\App\Support\Cache::set('spectra_sign_schema_v1', time(), 3600);

/**
 * Database de prueba: inyecta un PDO SQLite.
 */
class QaDatabase extends \App\Database
{
    private PDO $qaPdo;
    public function __construct(PDO $pdo) { $this->qaPdo = $pdo; }
    public function pdo(): PDO { return $this->qaPdo; }
}

$dbFile = __DIR__ . '/../storage/qa_spectra_sign.sqlite';
$fresh = !is_file($dbFile);
$pdo = new PDO('sqlite:' . $dbFile, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->sqliteCreateFunction('NOW', fn() => date('Y-m-d H:i:s'));

$pdo->exec("
CREATE TABLE IF NOT EXISTS currencies (id INTEGER PRIMARY KEY, code TEXT);
CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, legal_name TEXT, tax_id TEXT, address TEXT, representative_name TEXT, default_currency_id INTEGER, status TEXT, country_id INTEGER, created_at TEXT, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, full_name TEXT, email TEXT, password_hash TEXT, status TEXT, platform_role TEXT, national_id TEXT, address TEXT, nationality TEXT, created_at TEXT, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS contract_templates (id TEXT PRIMARY KEY, company_id TEXT, title TEXT, body TEXT, type TEXT, status TEXT, docusign_template_id TEXT, country_id INTEGER, language_code TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS contracts (id TEXT PRIMARY KEY, company_id TEXT, freelancer_id TEXT, user_id TEXT, template_id TEXT, title TEXT, type TEXT, status TEXT, start_date TEXT, end_date TEXT, currency_id INTEGER, rate REAL, payment_frequency TEXT, scope_of_work TEXT, special_clause TEXT, notice_period INTEGER, country TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS docusign_envelopes (id TEXT PRIMARY KEY, contract_id TEXT, amendment_id TEXT, envelope_id TEXT, status TEXT, last_event_at TEXT, created_at TEXT, provider TEXT, sign_token TEXT, signer_name TEXT, signer_email TEXT, signer_id TEXT, signature_data TEXT, signature_svg TEXT, signed_pdf TEXT, signature_ip TEXT, signature_ua TEXT, signed_at TEXT, expires_at TEXT);
CREATE TABLE IF NOT EXISTS contract_amendments (id TEXT PRIMARY KEY, contract_id TEXT, changes_json TEXT, status TEXT, signed_at TEXT, effective_date TEXT, envelope_id TEXT, version TEXT, type TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS onboarding_tasks (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, status TEXT, completed_at TEXT);
");

$pdo->exec("
INSERT OR IGNORE INTO currencies (id, code) VALUES (1, 'USD');
INSERT OR IGNORE INTO companies (id, legal_name, tax_id, address, representative_name, default_currency_id, status, country_id, created_at)
VALUES ('qa-company', 'QA Company SAC', '20123456789', 'Lima', 'QA Rep', 1, 'active', 1, datetime('now'));
INSERT OR IGNORE INTO users (id, full_name, email, status, platform_role, national_id, address, nationality, created_at)
VALUES ('qa-freelancer', 'QA Freelancer', 'qa.freelancer@example.com', 'active', 'freelancer', '99999999', 'Lima', 'PE', datetime('now'));
INSERT OR IGNORE INTO users (id, full_name, email, status, platform_role, created_at)
VALUES ('qa-admin', 'QA Admin', 'qa.admin@example.com', 'active', 'super_admin', datetime('now'));
INSERT OR IGNORE INTO contract_templates (id, company_id, title, body, type, status, created_at)
VALUES ('qa-template', NULL, 'QA Template', '<h2>Contrato de Servicios</h2><p>Entre {{company_name}} y {{employee_name}}.</p><ul><li>Inicio: {{start_date}}</li></ul>', 'fixed', 'active', datetime('now'));
INSERT OR IGNORE INTO contracts (id, company_id, freelancer_id, user_id, template_id, title, type, status, start_date, currency_id, rate, payment_frequency, scope_of_work, notice_period, created_at)
VALUES ('qa-contract', 'qa-company', 'qa-freelancer', 'qa-freelancer', 'qa-template', 'QA Contract', 'fixed', 'draft', date('now'), 1, 1000, 'monthly', 'QA scope of work', 30, datetime('now'));
INSERT OR IGNORE INTO contract_amendments (id, contract_id, changes_json, status, version, type, created_at)
VALUES ('qa-amendment', 'qa-contract', '{\"rate\":{\"old\":1000,\"new\":1500}}', 'draft', 'v2', 'rate', datetime('now'));
");

// Usuario autenticado (super_admin) para endpoints protegidos
$ref = new ReflectionClass(\App\Support\Auth::class);
$prop = $ref->getProperty('user');
$prop->setAccessible(true);
$prop->setValue(null, [
    'id' => 'qa-admin', 'full_name' => 'QA Admin', 'email' => 'qa.admin@example.com',
    'status' => 'active', 'platform_role' => 'super_admin',
]);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if ($path === '/__health') {
    header('Content-Type: application/json');
    echo json_encode(['ok' => true, 'fresh' => $fresh]);
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
$id = $segs[2] ?? null;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$db = new QaDatabase($pdo);

if ($table === 'envelopes') {
    (new \App\Controllers\EnvelopeController($db))->handle($method, $id);
    exit;
}
if ($table === 'sign') {
    (new \App\Controllers\SignatureController($db))->handle($segs, $method);
    exit;
}

http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['message' => 'not found', 'table' => $table]);
