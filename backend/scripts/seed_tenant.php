<?php
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/Controllers/TenantController.php';
require_once __DIR__ . '/../src/Support/Response.php';

$config = require __DIR__ . '/../config/config.php';
$database = new \App\Database($config['db']);
$pdo = $database->pdo();

// Resolve required foreign keys
$countryId = null;
$stmt = $pdo->prepare("SELECT id FROM countries WHERE iso2 = :iso LIMIT 1");
$stmt->execute([':iso' => 'PE']);
$countryId = (int)($stmt->fetchColumn() ?: 0);
if ($countryId <= 0) {
    $pdo->exec("INSERT INTO countries (iso2, name) VALUES ('PE','Perú')");
    $countryId = (int)$pdo->lastInsertId();
}

$currencyId = null;
$stmt = $pdo->prepare("SELECT id FROM currencies WHERE code = :code LIMIT 1");
$stmt->execute([':code' => 'PEN']);
$currencyId = (int)($stmt->fetchColumn() ?: 0);
if ($currencyId <= 0) {
    $ins = $pdo->prepare("INSERT INTO currencies (code, name, symbol) VALUES (:code, :name, :symbol)");
    $ins->execute([':code' => 'PEN', ':name' => 'Sol Peruano', ':symbol' => 'S/']);
    $currencyId = (int)$pdo->lastInsertId();
}

$timezoneId = null;
$stmt = $pdo->prepare("SELECT id FROM timezones WHERE name LIKE :name LIMIT 1");
$stmt->execute([':name' => 'America/Lima']);
$row = $stmt->fetch(\PDO::FETCH_ASSOC);
$timezoneId = $row ? (int)$row['id'] : 0;
if ($timezoneId <= 0) {
    $ins = $pdo->prepare("INSERT INTO timezones (name, created_at, updated_at) VALUES (:name, NOW(), NOW())");
    $ins->execute([':name' => 'America/Lima']);
    $timezoneId = (int)$pdo->lastInsertId();
}

// Build payload
$nowTag = date('YmdHis');
$_POST = [
    'legal_name' => "Empresa Demo $nowTag",
    'trade_name' => 'Empresa Demo',
    'country_id' => $countryId,
    'default_currency_id' => $currencyId,
    'timezone_id' => $timezoneId,
    'status' => 'active',
    'owner_email' => "tenant.admin.$nowTag@example.com",
    'owner_name' => 'Tenant Admin Auto',
    'create_default_roles' => true,
    'activate_templates' => false,
    'invoice_series' => 'F001',
    'invoice_number_start' => 1,
];

$controller = new \App\Controllers\TenantController($database);
$controller->handle(['api','tenants','wizard'], 'POST');
