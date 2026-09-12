<?php
/**
 * QA end-to-end de dashboard/finance/invoices y dashboard/finance/wallet.
 *
 * Uso: php backend/scripts/qa_finance.php
 *
 * Levanta scripts/qa_finance_server.php (SQLite + fixtures), ejecuta los casos
 * con cURL contra FinanceController real y valida efectos. Sale con código 1 si falla.
 */
declare(strict_types=1);

$root = dirname(__DIR__);
require_once $root . '/vendor/autoload.php';

$dbFile = $root . '/storage/qa_finance.sqlite';
$log = $root . '/storage/qa_finance_server.log';
@unlink($dbFile);
@unlink($log);

$pass = 0;
$fail = 0;
$failures = [];

function check(string $name, bool $cond, string $detail = ''): void
{
    global $pass, $fail, $failures;
    if ($cond) {
        $pass++;
        echo "  [PASS] {$name}\n";
    } else {
        $fail++;
        $failures[] = $name . ($detail !== '' ? " -> {$detail}" : '');
        echo "  [FAIL] {$name}" . ($detail !== '' ? " -> {$detail}" : '') . "\n";
    }
}

function http(string $method, string $url, ?string $rawBody = null): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HEADER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    ]);
    if ($rawBody !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $rawBody);
    }
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $hlen = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    return ['code' => $code, 'headers' => substr((string)$res, 0, $hlen), 'body' => substr((string)$res, $hlen)];
}

$port = 8098;
$base = "http://127.0.0.1:{$port}";

$proc = proc_open(
    [PHP_BINARY, '-d', 'display_errors=1', '-S', "127.0.0.1:{$port}", '-t', $root, $root . '/scripts/qa_finance_server.php'],
    [0 => ['pipe', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']],
    $pipes,
    $root
);
if (!is_resource($proc)) {
    echo "No se pudo iniciar el servidor de pruebas.\n";
    exit(2);
}

$ready = false;
for ($i = 0; $i < 50; $i++) {
    if (http('GET', "{$base}/__health")['code'] === 200) { $ready = true; break; }
    usleep(100000);
}
if (!$ready) {
    echo "El servidor no respondió. Log:\n" . (@file_get_contents($log) ?: '') . "\n";
    proc_terminate($proc);
    proc_close($proc);
    exit(2);
}

$json = fn(string $s): array => (json_decode($s, true) ?: []);
$sdb = new PDO('sqlite:' . $dbFile, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);

echo "================ Finance QA: /dashboard/finance ================\n";

// ================= INVOICES =================
$r = http('GET', "{$base}/api/finance/invoices");
$b = $json($r['body']);
check('GET /api/finance/invoices = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('lista de facturas (>=3)', count($b['data'] ?? []) >= 3, 'count=' . count($b['data'] ?? []));
check('meta.total_pages presente', isset($b['meta']['total_pages']), json_encode($b['meta'] ?? []));

// Búsqueda (q) — antes era ignorada por el backend
$r = http('GET', "{$base}/api/finance/invoices?" . http_build_query(['q' => 'F001-0001']));
$b = $json($r['body']);
check('búsqueda q por número filtra (1 resultado)', $r['code'] === 200 && count($b['data'] ?? []) === 1 && ($b['data'][0]['invoice_number'] ?? '') === 'F001-0001', json_encode($b['data'] ?? []));

$r = http('GET', "{$base}/api/finance/invoices?" . http_build_query(['q' => 'QA Segundo']));
$b = $json($r['body']);
check('búsqueda q por empresa filtra', $r['code'] === 200 && count($b['data'] ?? []) === 1 && ($b['data'][0]['company_name'] ?? '') === 'QA Segundo SAC', 'code=' . $r['code'] . ' count=' . count($b['data'] ?? []));

$r = http('GET', "{$base}/api/finance/invoices?" . http_build_query(['q' => 'QA Company']));
$b = $json($r['body']);
$allSame = true;
foreach (($b['data'] ?? []) as $row) { if (($row['company_name'] ?? '') !== 'QA Company SAC') $allSame = false; }
check('búsqueda q por empresa multi-factura (2)', $r['code'] === 200 && count($b['data'] ?? []) === 2 && $allSame, 'code=' . $r['code'] . ' count=' . count($b['data'] ?? []));

$r = http('GET', "{$base}/api/finance/invoices?" . http_build_query(['q' => 'F001']));
$b = $json($r['body']);
check('búsqueda q parcial devuelve 2', $r['code'] === 200 && count($b['data'] ?? []) === 2, 'count=' . count($b['data'] ?? []));

// Detalle
$r = http('GET', "{$base}/api/finance/invoices/qa-inv-1");
$b = $json($r['body']);
check('GET /invoices/{id} = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('detalle incluye ítems (2)', count($b['items'] ?? []) === 2, 'items=' . count($b['items'] ?? []));
check('freelancer_first_name = Juan', ($b['freelancer_first_name'] ?? '') === 'Juan', $b['freelancer_first_name'] ?? '');
check('currency_symbol presente', ($b['currency_symbol'] ?? '') === '$', $b['currency_symbol'] ?? '');

$r = http('GET', "{$base}/api/finance/invoices/no-existe");
check('detalle factura inexistente -> 404', $r['code'] === 404, "code={$r['code']}");

// Descarga (antes la ruta /download caía en invoicesShow)
$r = http('GET', "{$base}/api/finance/invoices/qa-inv-1/download");
check('GET /invoices/{id}/download = 200', $r['code'] === 200, "code={$r['code']}");
check('download content-type text/plain', stripos($r['headers'], 'text/plain') !== false, $r['headers']);
check('download contiene N° de factura', str_contains($r['body'], 'F001-0001') && str_contains($r['body'], 'Total:'), substr($r['body'], 0, 120));

// ================= WALLET =================
$r = http('GET', "{$base}/api/finance/wallet");
$b = $json($r['body']);
check('GET /api/finance/wallet = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('lista de wallets (2)', count($b['data'] ?? []) === 2, 'count=' . count($b['data'] ?? []));
check('wallet incluye company_name y symbol', !empty($b['data'][0]['company_name']) && !empty($b['data'][0]['currency_symbol']), json_encode($b['data'][0] ?? []));

$r = http('GET', "{$base}/api/finance/wallet/qa-company");
$b = $json($r['body']);
check('GET /wallet/{companyId} = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('wallet detalle balance 500', (float)($b['balance'] ?? 0) === 500.0, (string)($b['balance'] ?? ''));
check('wallet detalle incluye transacciones', !empty($b['transactions']['data']), json_encode($b['transactions'] ?? []));

$r = http('GET', "{$base}/api/finance/wallet/sin-wallet");
check('wallet inexistente -> 404', $r['code'] === 404, "code={$r['code']}");

$r = http('GET', "{$base}/api/finance/wallet/transactions");
$b = $json($r['body']);
check('GET /wallet/transactions (ledger) = 200', $r['code'] === 200 && count($b['data'] ?? []) >= 1, "code={$r['code']}");
check('ledger usa reference_type', array_key_exists('reference_type', $b['data'][0] ?? []) && !array_key_exists('related_object_type', $b['data'][0] ?? []), json_encode(array_keys($b['data'][0] ?? [])));

// ================= AJUSTE / CONCILIACIÓN =================
$r = http('POST', "{$base}/api/finance/reconciliation/adjustment", json_encode([
    'company_id' => 'qa-company', 'currency_id' => 1, 'amount' => 100, 'description' => 'QA recarga',
]));
$b = $json($r['body']);
check('POST reconciliation/adjustment = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$txId = (string)($b['id'] ?? '');
check('ajuste devuelve id', $txId !== '');

$wallet = $sdb->query("SELECT balance FROM wallets WHERE company_id='qa-company' AND currency_id=1")->fetch();
check('wallet balance actualizado 500 -> 600', (float)($wallet['balance'] ?? 0) === 600.0, (string)($wallet['balance'] ?? ''));
$tx = $sdb->query("SELECT * FROM wallet_transactions WHERE id=" . $sdb->quote($txId))->fetch();
check('transacción de ajuste creada', !empty($tx));
check('ajuste status = completed', ($tx['status'] ?? '') === 'completed', $tx['status'] ?? '');
check('ajuste reference_type = manual_adjustment', ($tx['reference_type'] ?? '') === 'manual_adjustment', $tx['reference_type'] ?? '');

$r = http('POST', "{$base}/api/finance/reconciliation/adjustment", json_encode(['company_id' => 'qa-company', 'currency_id' => 1, 'amount' => 0, 'description' => '']));
check('ajuste con datos incompletos -> 422', $r['code'] === 422, "code={$r['code']}");

$r = http('POST', "{$base}/api/finance/reconciliation/adjustment", json_encode(['company_id' => 'qa-company2', 'currency_id' => 1, 'amount' => 10, 'description' => 'sin wallet']));
check('ajuste sin wallet (moneda) -> 404', $r['code'] === 404, "code={$r['code']}");

// Toggle conciliación
$r = http('POST', "{$base}/api/finance/reconciliation/{$txId}/toggle");
$b = $json($r['body']);
check('toggle conciliación -> activa', $r['code'] === 200 && (int)($b['is_reconciled'] ?? -1) === 1, "code={$r['code']} {$r['body']}");
$r = http('POST', "{$base}/api/finance/reconciliation/{$txId}/toggle");
$b = $json($r['body']);
check('toggle conciliación -> desactiva', $r['code'] === 200 && (int)($b['is_reconciled'] ?? -1) === 0, "code={$r['code']} {$r['body']}");

$r = http('GET', "{$base}/api/finance/reconciliation");
$b = $json($r['body']);
$found = false;
foreach (($b['data'] ?? []) as $row) { if (($row['id'] ?? '') === $txId) $found = true; }
check('GET /finance/reconciliation incluye el ajuste', $r['code'] === 200 && $found, "code={$r['code']}");

echo "\n================ RESULTADO: {$pass} PASS / {$fail} FAIL ================\n";
if ($fail > 0) {
    echo "Fallos:\n";
    foreach ($failures as $f) echo "  - {$f}\n";
}

proc_terminate($proc);
usleep(300000);
proc_close($proc);
@unlink($dbFile);

exit($fail > 0 ? 1 : 0);
