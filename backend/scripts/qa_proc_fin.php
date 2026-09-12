<?php
/**
 * QA end-to-end de:
 *   - /dashboard/finance/reconciliation
 *   - /dashboard/procurement/vendors
 *   - /dashboard/procurement/requisitions
 *
 * Uso: php backend/scripts/qa_proc_fin.php
 */
declare(strict_types=1);

$root = dirname(__DIR__);
require_once $root . '/vendor/autoload.php';

$dbFile = $root . '/storage/qa_proc_fin.sqlite';
$log = $root . '/storage/qa_proc_fin_server.log';
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

$port = 8097;
$base = "http://127.0.0.1:{$port}";

$proc = proc_open(
    [PHP_BINARY, '-d', 'display_errors=1', '-S', "127.0.0.1:{$port}", '-t', $root, $root . '/scripts/qa_proc_fin_server.php'],
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

echo "======== QA: reconciliation + procurement ========\n";

// ============ FINANCE / RECONCILIATION ============
echo "\n--- /dashboard/finance/reconciliation ---\n";
$r = http('GET', "{$base}/api/finance/reconciliation");
$b = $json($r['body']);
check('GET /api/finance/reconciliation = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('lista >= 2 transacciones', count($b['data'] ?? []) >= 2, 'count=' . count($b['data'] ?? []));
check('meta.total_pages presente', isset($b['meta']['total_pages']), json_encode($b['meta'] ?? []));

$r = http('GET', "{$base}/api/finance/reconciliation?reconciled=1");
$b = $json($r['body']);
$onlyReconciled = true;
foreach (($b['data'] ?? []) as $row) { if ((int)($row['is_reconciled'] ?? 0) !== 1) $onlyReconciled = false; }
check('filtro reconciled=1', $r['code'] === 200 && count($b['data'] ?? []) >= 1 && $onlyReconciled, json_encode($b['data'] ?? []));

$r = http('GET', "{$base}/api/finance/reconciliation?" . http_build_query(['q' => 'Pago']));
$b = $json($r['body']);
check('búsqueda q=descripción', $r['code'] === 200 && count($b['data'] ?? []) === 1 && ($b['data'][0]['id'] ?? '') === 'tx2', 'count=' . count($b['data'] ?? []));

$r = http('GET', "{$base}/api/finance/reconciliation?" . http_build_query(['company_id' => 'qa-company']));
$b = $json($r['body']);
check('filtro company_id', $r['code'] === 200 && count($b['data'] ?? []) >= 2, 'count=' . count($b['data'] ?? []));

// Ajuste (endpoint correcto /adjustment, body objeto)
$r = http('POST', "{$base}/api/finance/reconciliation/adjustment", json_encode([
    'company_id' => 'qa-company', 'currency_id' => 1, 'amount' => 50, 'description' => 'QA ajuste',
]));
$b = $json($r['body']);
check('POST /reconciliation/adjustment = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$adjTxId = (string)($b['id'] ?? '');
$wallet = $sdb->query("SELECT balance FROM wallets WHERE company_id='qa-company' AND currency_id=1")->fetch();
check('wallet 1000 -> 1050', (float)($wallet['balance'] ?? 0) === 1050.0, (string)($wallet['balance'] ?? ''));

$r = http('POST', "{$base}/api/finance/reconciliation", json_encode(['company_id' => 'qa-company', 'currency_id' => 1, 'amount' => 1, 'description' => 'x']));
check('URL anterior (sin /adjustment) -> 404', $r['code'] === 404, "code={$r['code']}");

$r = http('POST', "{$base}/api/finance/reconciliation/{$adjTxId}/toggle");
$b = $json($r['body']);
check('toggle conciliación activa', $r['code'] === 200 && (int)($b['is_reconciled'] ?? -1) === 1, "code={$r['code']} {$r['body']}");
$r = http('POST', "{$base}/api/finance/reconciliation/{$adjTxId}/toggle");
$b = $json($r['body']);
check('toggle conciliación desactiva', $r['code'] === 200 && (int)($b['is_reconciled'] ?? -1) === 0, "code={$r['code']} {$r['body']}");

// ============ PROCUREMENT / VENDORS ============
echo "\n--- /dashboard/procurement/vendors ---\n";
$r = http('GET', "{$base}/api/procurement/vendors");
$b = $json($r['body']);
check('GET /api/procurement/vendors = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('solo proveedores de la empresa (1)', count($b['data'] ?? []) === 1 && ($b['data'][0]['name'] ?? '') === 'Proveedor Uno', json_encode($b['data'] ?? []));

$r = http('POST', "{$base}/api/procurement/vendors", json_encode([
    'company_id' => 'qa-company', 'name' => 'Nuevo Proveedor', 'tax_id' => '20999999999', 'email' => 'nuevo@example.com',
]));
$b = $json($r['body']);
check('crear proveedor = 201', $r['code'] === 201 && !empty($b['id']), "code={$r['code']} {$r['body']}");
$vendorId = (string)($b['id'] ?? '');

$r = http('GET', "{$base}/api/procurement/vendors/{$vendorId}");
$b = $json($r['body']);
check('detalle proveedor = 200', $r['code'] === 200 && ($b['name'] ?? '') === 'Nuevo Proveedor', "code={$r['code']}");

$r = http('PUT', "{$base}/api/procurement/vendors/{$vendorId}", json_encode(['name' => 'Proveedor Editado', 'status' => 'active']));
check('editar proveedor = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$row = $sdb->query("SELECT name FROM vendors WHERE id=" . $sdb->quote($vendorId))->fetch();
check('proveedor actualizado en BD', ($row['name'] ?? '') === 'Proveedor Editado', $row['name'] ?? '');

$r = http('DELETE', "{$base}/api/procurement/vendors/{$vendorId}");
check('eliminar proveedor = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$r = http('GET', "{$base}/api/procurement/vendors/{$vendorId}");
check('proveedor eliminado -> 404', $r['code'] === 404, "code={$r['code']}");

// Plataforma finance sin empresa: debe listar todas
$r = http('GET', "{$base}/api/procurement/vendors?__as=finance");
$b = $json($r['body']);
check('finance (sin empresa) lista todas las empresas (2)', $r['code'] === 200 && count($b['data'] ?? []) === 2, "code={$r['code']} count=" . count($b['data'] ?? []));

// ============ PROCUREMENT / REQUISITIONS ============
echo "\n--- /dashboard/procurement/requisitions ---\n";
$r = http('GET', "{$base}/api/procurement/requisitions");
$b = $json($r['body']);
check('GET /api/procurement/requisitions = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('lista 3 requisiciones', count($b['data'] ?? []) === 3, 'count=' . count($b['data'] ?? []));
check('pagination.total_pages presente', isset($b['pagination']['total_pages']), json_encode($b['pagination'] ?? []));

$r = http('GET', "{$base}/api/procurement/requisitions/req-pending");
$b = $json($r['body']);
check('detalle incluye aprobaciones', $r['code'] === 200 && count($b['approvals'] ?? []) === 1, "code={$r['code']}");

// Crear (amount 1500 -> 2 pasos: admin + finance)
$r = http('POST', "{$base}/api/procurement/requisitions", json_encode([
    'company_id' => 'qa-company', 'title' => 'QA Requisición', 'description' => 'creada en QA', 'amount' => 1500, 'currency_id' => 1,
]));
$b = $json($r['body']);
check('crear requisición = 201', $r['code'] === 201 && !empty($b['id']), "code={$r['code']} {$r['body']}");
$reqId = (string)($b['id'] ?? '');
$steps = (int)$sdb->query("SELECT COUNT(*) FROM requisition_approvals WHERE requisition_id=" . $sdb->quote($reqId))->fetchColumn();
check('genera 2 pasos de aprobación (>=1000)', $steps === 2, "steps={$steps}");

// Crear sin amount -> 422
$r = http('POST', "{$base}/api/procurement/requisitions", json_encode(['company_id' => 'qa-company', 'title' => 'Sin monto', 'currency_id' => 1]));
check('crear sin amount -> 422', $r['code'] === 422, "code={$r['code']} {$r['body']}");

// Aprobaciones
$r = http('POST', "{$base}/api/procurement/requisitions/{$reqId}/approve", json_encode(['status' => 'approved', 'comments' => 'ok']));
check('aprobar paso 1 = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$r = http('POST', "{$base}/api/procurement/requisitions/{$reqId}/approve", json_encode(['status' => 'approved', 'comments' => 'ok2']));
check('aprobar paso 2 = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$status = $sdb->query("SELECT status FROM requisitions WHERE id=" . $sdb->quote($reqId))->fetchColumn();
check('requisición aprobada tras todos los pasos', $status === 'approved', (string)$status);

// Emitir PO (action alias emit-po; columnas po_number/ordered_at)
$r = http('POST', "{$base}/api/procurement/requisitions/{$reqId}/emit-po");
$b = $json($r['body']);
check('emit-po = 200 con po_number', $r['code'] === 200 && !empty($b['po_number']), "code={$r['code']} {$r['body']}");
$row = $sdb->query("SELECT status, po_number, ordered_at FROM requisitions WHERE id=" . $sdb->quote($reqId))->fetch();
check('estado ordered + po_number persistido', ($row['status'] ?? '') === 'ordered' && !empty($row['po_number']) && !empty($row['ordered_at']), json_encode($row));

$r = http('POST', "{$base}/api/procurement/requisitions/{$reqId}/emit-po");
check('emit-po sobre ya ordenada -> 400', $r['code'] === 400, "code={$r['code']}");

// Confirmar recepción (action alias confirm-receipt; columnas received_at/received_by)
$r = http('POST', "{$base}/api/procurement/requisitions/{$reqId}/confirm-receipt");
check('confirm-receipt = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$row = $sdb->query("SELECT status, received_at, received_by FROM requisitions WHERE id=" . $sdb->quote($reqId))->fetch();
check('estado received + recepción persistida', ($row['status'] ?? '') === 'received' && !empty($row['received_at']) && !empty($row['received_by']), json_encode($row));

$r = http('POST', "{$base}/api/procurement/requisitions/req-pending/emit-po");
check('emit-po sobre pendiente -> 400', $r['code'] === 400, "code={$r['code']}");

// Edición / borrado de pendientes
$r = http('PUT', "{$base}/api/procurement/requisitions/req-pending", json_encode(['title' => 'Editada', 'amount' => 600, 'currency_id' => 1]));
check('editar requisición pendiente = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$r = http('DELETE', "{$base}/api/procurement/requisitions/req-approved");
check('borrar requisición no pendiente -> 400', $r['code'] === 400, "code={$r['code']}");
$r = http('DELETE', "{$base}/api/procurement/requisitions/req-pending");
check('borrar requisición pendiente = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");

// Plataforma finance sin empresa: lista todas
$r = http('GET', "{$base}/api/procurement/requisitions?__as=finance");
$b = $json($r['body']);
check('finance (sin empresa) lista requisiciones (>=2)', $r['code'] === 200 && count($b['data'] ?? []) >= 2, "code={$r['code']} count=" . count($b['data'] ?? []));

echo "\n======== RESULTADO: {$pass} PASS / {$fail} FAIL ========\n";
if ($fail > 0) {
    echo "Fallos:\n";
    foreach ($failures as $f) echo "  - {$f}\n";
}

proc_terminate($proc);
usleep(300000);
proc_close($proc);
@unlink($dbFile);

exit($fail > 0 ? 1 : 0);
