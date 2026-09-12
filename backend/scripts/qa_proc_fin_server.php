<?php
/**
 * Servidor/router SOLO para QA de:
 *   - /dashboard/finance/reconciliation
 *   - /dashboard/procurement/vendors
 *   - /dashboard/procurement/requisitions
 *
 * Usa SQLite con fixtures y desactiva el DDL MySQL (Cache) para ejecutar
 * FinanceController, VendorController y RequisitionController reales por HTTP.
 *
 * Uso: php -S 127.0.0.1:8097 -t <backend> scripts/qa_proc_fin_server.php
 */

require_once __DIR__ . '/../vendor/autoload.php';
try { (Dotenv\Dotenv::createImmutable(__DIR__ . '/..'))->safeLoad(); } catch (Throwable $e) {}

// Evita DDL MySQL en SQLite
foreach (['schema_migrated_at', 'finance_invoices_schema_v1', 'wallet_recon_cols_v1', 'requisition_progress_cols_v1'] as $k) {
    \App\Support\Cache::set($k, time(), 3600);
}

class QaDatabase extends \App\Database
{
    private PDO $qaPdo;
    public function __construct(PDO $pdo) { $this->qaPdo = $pdo; }
    public function pdo(): PDO { return $this->qaPdo; }
}

$dbFile = __DIR__ . '/../storage/qa_proc_fin.sqlite';
$pdo = new PDO('sqlite:' . $dbFile, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

$pdo->sqliteCreateFunction('NOW', fn() => date('Y-m-d H:i:s'));
$pdo->sqliteCreateFunction('SUBSTRING_INDEX', function ($str, $delim, $count) {
    $parts = explode($delim, (string)$str);
    $count = (int)$count;
    if ($count > 0) return implode($delim, array_slice($parts, 0, $count));
    if ($count < 0) return implode($delim, array_slice($parts, $count));
    return implode($delim, $parts);
});
$pdo->sqliteCreateFunction('LOCATE', function ($needle, $haystack) {
    $p = strpos((string)$haystack, (string)$needle);
    return $p === false ? 0 : $p + 1;
});
$pdo->sqliteCreateFunction('SUBSTRING', function ($str, $start, $len = null) {
    $start = max(1, (int)$start);
    return $len === null ? substr((string)$str, $start - 1) : substr((string)$str, $start - 1, (int)$len);
});

$pdo->exec("
CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, legal_name TEXT, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS currencies (id INTEGER PRIMARY KEY, code TEXT, symbol TEXT);
CREATE TABLE IF NOT EXISTS company_settings (company_id TEXT PRIMARY KEY, tax_id TEXT);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, full_name TEXT, email TEXT, platform_role TEXT, status TEXT, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS company_users (id TEXT PRIMARY KEY, user_id TEXT, company_id TEXT, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS user_roles (id TEXT PRIMARY KEY, company_user_id TEXT, role_id TEXT);
CREATE TABLE IF NOT EXISTS wallets (id TEXT PRIMARY KEY, company_id TEXT, currency_id INTEGER, balance REAL, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS wallet_transactions (id TEXT PRIMARY KEY, company_id TEXT, wallet_id TEXT, type TEXT, amount REAL, currency_id INTEGER, reference_type TEXT, reference_id TEXT, description TEXT, status TEXT, created_at TEXT, is_reconciled INTEGER DEFAULT 0, reconciled_at TEXT);
CREATE TABLE IF NOT EXISTS vendors (id TEXT PRIMARY KEY, company_id TEXT, name TEXT, tax_id TEXT, contact_name TEXT, email TEXT, phone TEXT, address TEXT, status TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS requisitions (id TEXT PRIMARY KEY, company_id TEXT, requester_id TEXT, project_id TEXT, vendor_id TEXT, title TEXT, description TEXT, amount REAL, currency_id INTEGER, status TEXT, po_number TEXT, ordered_at TEXT, received_at TEXT, received_by TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS requisition_approvals (id TEXT PRIMARY KEY, requisition_id TEXT, step_number INTEGER, role_required TEXT, status TEXT, reviewed_by_user_id TEXT, reviewed_at TEXT, comments TEXT, created_at TEXT);
");

$pdo->exec("
INSERT OR IGNORE INTO companies (id, legal_name) VALUES ('qa-company','QA Company SAC'),('qa-company2','QA Segundo SAC');
INSERT OR IGNORE INTO currencies (id, code, symbol) VALUES (1,'USD','$'),(2,'PEN','S/');
INSERT OR IGNORE INTO company_settings (company_id, tax_id) VALUES ('qa-company','20123456789');
INSERT OR IGNORE INTO users (id, full_name, email, platform_role, status) VALUES
 ('qa-admin','Ana Admin','ana.admin@example.com','company_admin','active'),
 ('qa-finance','Felipe Finance','felipe.finance@example.com','finance','active'),
 ('qa-freelancer','Juan Perez','juan.perez@example.com','user','active');
INSERT OR IGNORE INTO company_users (id, user_id, company_id) VALUES ('cu-admin','qa-admin','qa-company'),('cu-freelancer','qa-freelancer','qa-company');
INSERT OR IGNORE INTO roles (id, name) VALUES ('role-admin','admin'),('role-ca','company_admin'),('role-fin','finance');
INSERT OR IGNORE INTO user_roles (id, company_user_id, role_id) VALUES ('ur1','cu-admin','role-ca'),('ur2','cu-admin','role-admin'),('ur3','cu-freelancer','role-admin');
INSERT OR IGNORE INTO wallets (id, company_id, currency_id, balance, created_at, updated_at) VALUES ('w1','qa-company',1,1000,datetime('now'),datetime('now'));
INSERT OR IGNORE INTO wallet_transactions (id, company_id, wallet_id, type, amount, currency_id, reference_type, reference_id, description, status, created_at, is_reconciled) VALUES
 ('tx1','qa-company','w1','deposit',1000,1,'manual_adjustment',NULL,'Saldo inicial','completed',datetime('now'),0),
 ('tx2','qa-company','w1','withdrawal',-200,1,'invoice','inv-123','Pago proveedor','completed',datetime('now'),1);
INSERT OR IGNORE INTO vendors (id, company_id, name, tax_id, contact_name, email, phone, address, status, created_at, updated_at) VALUES
 ('v1','qa-company','Proveedor Uno','20111111111','Contacto Uno','uno@example.com','111','Lima','active',datetime('now'),datetime('now')),
 ('v2','qa-company2','Proveedor Dos','20222222222','Contacto Dos','dos@example.com','222','Arequipa','active',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO requisitions (id, company_id, requester_id, title, description, amount, currency_id, status, created_at, updated_at) VALUES
 ('req-pending','qa-company','qa-freelancer','Compra pendiente','Desc pendiente',500,1,'pending',datetime('now'),datetime('now')),
 ('req-approved','qa-company','qa-freelancer','Compra aprobada','Desc aprobada',1500,1,'approved',datetime('now'),datetime('now')),
 ('req-ordered','qa-company','qa-freelancer','Compra ordenada','Desc ordenada',2000,1,'ordered',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO requisition_approvals (id, requisition_id, step_number, role_required, status, created_at) VALUES
 ('ra1','req-pending',1,'admin','pending',datetime('now')),
 ('ra2','req-approved',1,'admin','approved',datetime('now')),
 ('ra3','req-approved',2,'finance','approved',datetime('now')),
 ('ra4','req-ordered',1,'admin','approved',datetime('now'));
");

// Selección de usuario para el test (por defecto company_admin con empresa; ?__as=finance -> plataforma sin empresa)
$as = $_GET['__as'] ?? 'admin';
if ($as === 'finance') {
    $qaUser = ['id' => 'qa-finance', 'full_name' => 'Felipe Finance', 'email' => 'felipe.finance@example.com', 'status' => 'active', 'platform_role' => 'finance'];
} else {
    $qaUser = ['id' => 'qa-admin', 'full_name' => 'Ana Admin', 'email' => 'ana.admin@example.com', 'status' => 'active', 'platform_role' => 'company_admin'];
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

if ($table === 'finance') {
    (new \App\Controllers\FinanceController($db))->handle($segs, $method);
    exit;
}

if ($table === 'procurement') {
    $sub = strtolower($segs[2] ?? '');
    if ($sub === 'vendors') {
        $new = ['api', 'vendors'];
        if (isset($segs[3])) $new[] = $segs[3];
        (new \App\Controllers\VendorController($db))->handle($new, $method);
        exit;
    }
    if ($sub === 'requisitions') {
        $new = ['api', 'requisitions'];
        for ($i = 3; $i < count($segs); $i++) $new[] = $segs[$i];
        (new \App\Controllers\RequisitionController($db))->handle($new, $method);
        exit;
    }
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['message' => 'procurement not found']);
    exit;
}

if ($table === 'vendors') {
    (new \App\Controllers\VendorController($db))->handle($segs, $method);
    exit;
}
if ($table === 'requisitions') {
    (new \App\Controllers\RequisitionController($db))->handle($segs, $method);
    exit;
}

http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['message' => 'not found', 'table' => $table]);
