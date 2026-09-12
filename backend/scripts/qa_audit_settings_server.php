<?php
/**
 * Servidor/router SOLO para QA de:
 *   - /dashboard/audit
 *   - /dashboard/settings/countries (+ parámetros fiscales)
 *   - /dashboard/settings/currencies
 *
 * Usa SQLite con fixtures (y un archivo de auditoría aislado) y desactiva el
 * DDL MySQL (Cache) para ejecutar los controladores reales por HTTP.
 *
 * Uso: php -S 127.0.0.1:8096 -t <backend> scripts/qa_audit_settings_server.php
 */

require_once __DIR__ . '/../vendor/autoload.php';
try { (Dotenv\Dotenv::createImmutable(__DIR__ . '/..'))->safeLoad(); } catch (Throwable $e) {}

foreach (['schema_migrated_at', 'fiscal_params_schema_v1'] as $k) {
    \App\Support\Cache::set($k, time(), 3600);
}
\App\Support\Cache::delete('ref:countries');
\App\Support\Cache::delete('ref:currencies');

class QaDatabase extends \App\Database
{
    private PDO $qaPdo;
    public function __construct(PDO $pdo) { $this->qaPdo = $pdo; }
    public function pdo(): PDO { return $this->qaPdo; }
}

$dbFile = __DIR__ . '/../storage/qa_audit_settings.sqlite';
$pdo = new PDO('sqlite:' . $dbFile, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->sqliteCreateFunction('NOW', fn() => date('Y-m-d H:i:s'));

$pdo->exec("
CREATE TABLE IF NOT EXISTS countries (id INTEGER PRIMARY KEY AUTOINCREMENT, iso2 TEXT UNIQUE, name TEXT, currency_code TEXT, region TEXT, is_active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS currencies (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, name TEXT, symbol TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, legal_name TEXT, country_id INTEGER, default_currency_id INTEGER, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS fiscal_parameters (id INTEGER PRIMARY KEY AUTOINCREMENT, country_id INTEGER, name TEXT, code TEXT, percentage REAL, is_active INTEGER DEFAULT 1, description TEXT, type TEXT DEFAULT 'tax', calculation_base TEXT DEFAULT 'gross_fees', payslip_trigger TEXT DEFAULT 'on_payment', applies_to TEXT DEFAULT 'any', valid_from TEXT, valid_to TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, currency_id INTEGER);
CREATE TABLE IF NOT EXISTS payroll_runs (id TEXT PRIMARY KEY, currency_id INTEGER);
CREATE TABLE IF NOT EXISTS contracts (id TEXT PRIMARY KEY, currency_id INTEGER);
CREATE TABLE IF NOT EXISTS wallet_transactions (id TEXT PRIMARY KEY, currency_id INTEGER);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, full_name TEXT, email TEXT, platform_role TEXT, status TEXT);
");

$pdo->exec("
INSERT OR IGNORE INTO countries (id, iso2, name, currency_code, region, is_active) VALUES (1,'PE','Perú','PEN','LATAM',1),(2,'MX','México','MXN','LATAM',1);
INSERT OR IGNORE INTO currencies (id, code, name, symbol) VALUES (1,'USD','Dólar','$'),(2,'PEN','Sol peruano','S/');
INSERT OR IGNORE INTO companies (id, legal_name, country_id, default_currency_id) VALUES ('qa-company','QA Company SAC',1,1);
INSERT OR IGNORE INTO users (id, full_name, email, platform_role, status) VALUES ('qa-audit-user','QA Audit','qa.audit@example.com','security','active');
");

// Archivo de auditoría aislado (fecha futura para no tocar logs reales)
$logDir = __DIR__ . '/../storage/logs';
if (!is_dir($logDir)) @mkdir($logDir, 0777, true);
$auditFile = $logDir . '/audit-2099-01-01.jsonl';
$entries = [
    ['id' => 'a1', 'company_id' => 'qa-company', 'actor_user_id' => 'qa-audit-user', 'action' => 'qa-audit-A1', 'object_type' => 'invoice', 'object_id' => 'inv-1', 'description' => 'd1', 'metadata' => ['k' => 'v1'], 'ip' => '127.0.0.1', 'user_agent' => 'QA', 'created_at' => '2099-01-01 10:00:00'],
    ['id' => 'a2', 'company_id' => 'qa-company', 'actor_user_id' => 'qa-audit-user', 'action' => 'qa-audit-A2', 'object_type' => 'contract', 'object_id' => 'con-1', 'description' => 'd2', 'metadata' => ['k' => 'v2'], 'ip' => '127.0.0.1', 'user_agent' => 'QA', 'created_at' => '2099-01-01 11:00:00'],
    ['id' => 'a3', 'company_id' => 'qa-company', 'actor_user_id' => 'qa-audit-user', 'action' => 'qa-audit-A3', 'object_type' => 'user', 'object_id' => 'usr-1', 'description' => 'd3', 'metadata' => ['k' => 'v3'], 'ip' => '127.0.0.1', 'user_agent' => 'QA', 'created_at' => '2099-01-01 12:00:00'],
    ['id' => 'b1', 'company_id' => 'qa-company', 'actor_user_id' => 'other-user', 'action' => 'qa-audit-OTHER', 'object_type' => 'invoice', 'object_id' => 'inv-9', 'description' => 'other', 'metadata' => [], 'ip' => '127.0.0.1', 'user_agent' => 'QA', 'created_at' => '2099-01-01 09:00:00'],
];
file_put_contents($auditFile, implode("\n", array_map(fn($e) => json_encode($e, JSON_UNESCAPED_UNICODE), $entries)) . "\n");

$ref = new ReflectionClass(\App\Support\Auth::class);
$prop = $ref->getProperty('user');
$prop->setAccessible(true);
$prop->setValue(null, ['id' => 'qa-audit-user', 'full_name' => 'QA Audit', 'email' => 'qa.audit@example.com', 'status' => 'active', 'platform_role' => 'security']);

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

if ($table === 'audit' || $table === 'audit_logs') {
    (new \App\Controllers\AuditController($db))->handle($segs, $method);
    exit;
}
if ($table === 'countries' && ($segs[3] ?? '') === 'fiscal-parameters') {
    (new \App\Controllers\FiscalParameterController($pdo))->handleNested($segs, $method);
    exit;
}
if ($table === 'fiscal-parameters') {
    (new \App\Controllers\FiscalParameterController($pdo))->handleDirect($segs, $method);
    exit;
}
if ($table === 'countries') {
    (new \App\Controllers\CountryController($db))->handle($segs, $method);
    exit;
}
if ($table === 'currencies') {
    (new \App\Controllers\CurrencyController($db))->handle($segs, $method);
    exit;
}

http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['message' => 'not found', 'table' => $table]);
