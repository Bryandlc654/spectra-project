<?php
declare(strict_types=1);

// =========================================================
// billing_cron.php — Facturación automática de Spectra.
//
// Uso (CLI, lo ejecuta el cron del servidor a diario):
//   php backend/scripts/billing_cron.php                 # mes actual + vencidos
//   php backend/scripts/billing_cron.php --month=2026-11 # mes concreto
//   php backend/scripts/billing_cron.php --dry-run       # solo simula, no escribe
//
// 1. Genera la factura mensual de cada empresa activa (cuota fija +
//    tarifa por contrato / por freelancer). Es idempotente: si la factura
//    del mes ya existe no se duplica, así que correrlo a diario es seguro
//    y recupera ejecuciones fallidas.
// 2. Marca como vencidas las facturas con due_date pasada.
// =========================================================

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../vendor/autoload.php';

try {
    Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();
} catch (Throwable $e) {
}

$opts = getopt('', ['month::', 'dry-run', 'company::']);
$month = (string)($opts['month'] ?? date('Y-m'));
$dryRun = isset($opts['dry-run']);
$companyId = isset($opts['company']) ? (string)$opts['company'] : null;

if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) {
    fwrite(STDERR, "Mes inválido: $month (formato AAAA-MM)\n");
    exit(2);
}

$stamp = date('Y-m-d H:i:s');
try {
    $config = require __DIR__ . '/../config/config.php';
    $database = new \App\Database($config['db'] ?? []);
    $fees = new \App\Controllers\FeesController($database);

    $result = $fees->runMonthlyBilling($month, $dryRun, $companyId);
    echo "[$stamp] {$result['message']} (mes $month)\n";
    foreach ($result['invoices'] as $inv) {
        echo "  + {$inv['company_name']}: {$inv['total']} (moneda {$inv['currency_id']}, {$inv['collaborators']} colaboradores, " . count($inv['items']) . " líneas)\n";
    }
    foreach ($result['errors'] as $err) {
        echo "  ! $err\n";
    }

    if (!$dryRun) {
        $overdue = $fees->markOverdueInvoices();
        echo "[$stamp] Facturas marcadas como vencidas: $overdue\n";
    }

    exit($result['errors'] ? 1 : 0);
} catch (Throwable $e) {
    fwrite(STDERR, "[$stamp] Error en la facturación automática: " . $e->getMessage() . "\n");
    exit(1);
}
