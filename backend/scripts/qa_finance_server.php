<?php
/**
 * Servidor/router SOLO para QA de dashboard/finance/invoices y /wallet.
 * Usa SQLite con fixtures y desactiva el DDL MySQL (Cache) para poder
 * ejecutar FinanceController real por HTTP sin BD externa.
 *
 * Uso: php -S 127.0.0.1:8098 -t <backend> scripts/qa_finance_server.php
 */

require_once __DIR__ . '/../vendor/autoload.php';
try { (Dotenv\Dotenv::createImmutable(__DIR__ . '/..'))->safeLoad(); } catch (Throwable $e) {}

// Evita DDL MySQL en SQLite
\App\Support\Cache::set('schema_migrated_at', time(), 3600);
\App\Support\Cache::set('finance_invoices_schema_v1', time(), 3600);
\App\Support\Cache::set('wallet_recon_cols_v1', time(), 3600);

class QaDatabase extends \App\Database
{
    private PDO $qaPdo;
    public function __construct(PDO $pdo) { $this->qaPdo = $pdo; }
    public function pdo(): PDO { return $this->qaPdo; }
}

$dbFile = __DIR__ . '/../storage/qa_finance.sqlite';
$fresh = !is_file($dbFile);
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
CREATE TABLE IF NOT EXISTS currencies (id INTEGER PRIMARY KEY, code TEXT, symbol TEXT);
CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, legal_name TEXT, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS company_settings (company_id TEXT PRIMARY KEY, tax_id TEXT, billing_address TEXT);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, full_name TEXT, email TEXT);
CREATE TABLE IF NOT EXISTS contract_templates (id TEXT PRIMARY KEY, title TEXT);
CREATE TABLE IF NOT EXISTS contracts (id TEXT PRIMARY KEY, title TEXT, template_id TEXT);
CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, company_id TEXT, contract_id TEXT, freelancer_id TEXT, invoice_number TEXT, issue_date TEXT, due_date TEXT, currency_id INTEGER, subtotal REAL, tax_amount REAL, total_amount REAL, status TEXT, notes TEXT, support_review_requested INTEGER DEFAULT 0, support_ticket_id TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS invoice_lines (id TEXT PRIMARY KEY, invoice_id TEXT, concept TEXT, quantity REAL, unit_price REAL, tax_rate REAL, line_total REAL, created_at TEXT);
CREATE TABLE IF NOT EXISTS wallets (id TEXT PRIMARY KEY, company_id TEXT, currency_id INTEGER, balance REAL, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS wallet_transactions (id TEXT PRIMARY KEY, company_id TEXT, wallet_id TEXT, type TEXT, amount REAL, currency_id INTEGER, reference_type TEXT, reference_id TEXT, description TEXT, status TEXT, created_at TEXT, is_reconciled INTEGER DEFAULT 0, reconciled_at TEXT);
");

$pdo->exec("
INSERT OR IGNORE INTO currencies (id, code, symbol) VALUES (1,'USD','$'),(2,'PEN','S/');
INSERT OR IGNORE INTO companies (id, legal_name) VALUES ('qa-company','QA Company SAC'),('qa-company2','QA Segundo SAC');
INSERT OR IGNORE INTO company_settings (company_id, tax_id, billing_address) VALUES ('qa-company','20123456789','Lima'),('qa-company2','20987654321','Arequipa');
INSERT OR IGNORE INTO users (id, full_name, email) VALUES ('qa-freelancer','Juan Perez','juan.perez@example.com');
INSERT OR IGNORE INTO contract_templates (id, title) VALUES ('qa-template','Contrato QA');
INSERT OR IGNORE INTO contracts (id, title, template_id) VALUES ('qa-contract','Contrato QA','qa-template');
INSERT OR IGNORE INTO invoices (id, company_id, contract_id, freelancer_id, invoice_number, issue_date, due_date, currency_id, subtotal, tax_amount, total_amount, status, notes, created_at)
VALUES
 ('qa-inv-1','qa-company','qa-contract','qa-freelancer','F001-0001', date('now'), date('now','+30 day'), 1, 100, 18, 118, 'sent', 'Servicios QA', datetime('now')),
 ('qa-inv-2','qa-company2',NULL,NULL,'F001-0002', date('now'), date('now','-5 day'), 2, 200, 36, 236, 'overdue', 'Overdue QA', datetime('now')),
 ('qa-inv-3','qa-company',NULL,NULL,'F002-0003', date('now'), date('now','+15 day'), 1, 50, 9, 59, 'paid', 'Pagada QA', datetime('now'));
INSERT OR IGNORE INTO invoice_lines (id, invoice_id, concept, quantity, unit_price, tax_rate, line_total, created_at)
VALUES ('qa-line-1','qa-inv-1','Desarrollo', 2, 40, 18, 80, datetime('now')), ('qa-line-2','qa-inv-1','Soporte', 1, 20, 18, 20, datetime('now'));
INSERT OR IGNORE INTO wallets (id, company_id, currency_id, balance, created_at, updated_at)
VALUES ('qa-wallet-1','qa-company',1,500,datetime('now'),datetime('now')), ('qa-wallet-2','qa-company2',2,100,datetime('now'),datetime('now'));
INSERT OR IGNORE INTO wallet_transactions (id, company_id, wallet_id, type, amount, currency_id, reference_type, reference_id, description, status, created_at, is_reconciled)
VALUES ('qa-tx-1','qa-company','qa-wallet-1','deposit',500,1,'manual_adjustment',NULL,'Saldo inicial','completed',datetime('now'),0);
");

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

if ($table === 'finance') {
    (new \App\Controllers\FinanceController(new QaDatabase($pdo)))->handle($segs, $_SERVER['REQUEST_METHOD'] ?? 'GET');
    exit;
}

http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['message' => 'not found', 'table' => $table]);
