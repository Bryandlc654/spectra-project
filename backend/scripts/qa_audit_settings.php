<?php
/**
 * QA end-to-end de:
 *   - /dashboard/audit
 *   - /dashboard/settings/countries (+ parámetros fiscales)
 *   - /dashboard/settings/currencies
 *
 * Uso: php backend/scripts/qa_audit_settings.php
 */
declare(strict_types=1);

$root = dirname(__DIR__);
require_once $root . '/vendor/autoload.php';

$dbFile = $root . '/storage/qa_audit_settings.sqlite';
$log = $root . '/storage/qa_audit_settings_server.log';
$auditFile = $root . '/storage/logs/audit-2099-01-01.jsonl';
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

$port = 8096;
$base = "http://127.0.0.1:{$port}";

$proc = proc_open(
    [PHP_BINARY, '-d', 'display_errors=1', '-S', "127.0.0.1:{$port}", '-t', $root, $root . '/scripts/qa_audit_settings_server.php'],
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

$json = fn(string $s) => json_decode($s, true);

echo "======== QA: audit + settings ========\n";

// ================= AUDIT =================
echo "\n--- /dashboard/audit ---\n";
$r = http('GET', "{$base}/api/audit?" . http_build_query(['user_id' => 'qa-audit-user']));
$b = $json($r['body']);
check('GET /api/audit = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('total exacto = 3 (sin +100)', (int)($b['meta']['total'] ?? -1) === 3, json_encode($b['meta'] ?? []));
check('total_pages presente', isset($b['meta']['total_pages']), json_encode($b['meta'] ?? []));
check('actor_name enriquecido', ($b['data'][0]['actor_name'] ?? '') === 'QA Audit', $b['data'][0]['actor_name'] ?? '');

$r = http('GET', "{$base}/api/audit?" . http_build_query(['user_id' => 'qa-audit-user', 'per_page' => 2]));
$b = $json($r['body']);
check('per_page alias funciona (2 items, total 3, 2 páginas)', count($b['data'] ?? []) === 2 && (int)($b['meta']['total'] ?? 0) === 3 && (int)($b['meta']['total_pages'] ?? 0) === 2, json_encode($b['meta'] ?? []));

$r = http('GET', "{$base}/api/audit?" . http_build_query(['user_id' => 'qa-audit-user', 'per_page' => 2, 'page' => 2]));
$b = $json($r['body']);
check('página 2 devuelve 1 item', count($b['data'] ?? []) === 1, 'count=' . count($b['data'] ?? []));

$r = http('GET', "{$base}/api/audit?" . http_build_query(['user_id' => 'qa-audit-user', 'action' => 'qa-audit-A1']));
$b = $json($r['body']);
check('filtro action', $r['code'] === 200 && count($b['data'] ?? []) === 1 && ($b['data'][0]['action'] ?? '') === 'qa-audit-A1', 'count=' . count($b['data'] ?? []));

// Export CSV (antes nunca se activaba)
$r = http('GET', "{$base}/api/audit/export?" . http_build_query(['user_id' => 'qa-audit-user']));
check('GET /api/audit/export = 200', $r['code'] === 200, "code={$r['code']}");
check('export content-type text/csv', stripos($r['headers'], 'text/csv') !== false, $r['headers']);
check('export contiene cabecera y datos', str_contains($r['body'], 'Fecha') && str_contains($r['body'], 'qa-audit-A1'), substr($r['body'], 0, 80));

// ================= COUNTRIES =================
echo "\n--- /dashboard/settings/countries ---\n";
$r = http('GET', "{$base}/api/countries?" . http_build_query(['per_page' => 10]));
$b = $json($r['body']);
check('GET /api/countries = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('lista países (>=2) y meta', count($b['data'] ?? []) >= 2 && isset($b['meta']['total_pages']), json_encode($b['meta'] ?? []));

$r = http('GET', "{$base}/api/countries?" . http_build_query(['q' => 'Per']));
$b = $json($r['body']);
check('búsqueda q por nombre', $r['code'] === 200 && count($b['data'] ?? []) === 1 && ($b['data'][0]['iso2'] ?? '') === 'PE', 'count=' . count($b['data'] ?? []));

$r = http('POST', "{$base}/api/countries", json_encode(['iso2' => 'br', 'name' => 'Brasil']));
$b = $json($r['body']);
check('crear país = 201 (iso2 normalizado)', $r['code'] === 201 && !empty($b['data']['id']), "code={$r['code']} {$r['body']}");
$countryId = (int)($b['data']['id'] ?? 0);

$r = http('GET', "{$base}/api/countries/{$countryId}");
$b = $json($r['body']);
check('detalle país = 200', $r['code'] === 200 && ($b['data']['iso2'] ?? '') === 'BR', json_encode($b));

$r = http('POST', "{$base}/api/countries", json_encode(['iso2' => 'PE', 'name' => 'Duplicado']));
check('iso2 duplicado -> 409', $r['code'] === 409, "code={$r['code']}");

$r = http('POST', "{$base}/api/countries", json_encode(['iso2' => 'X', 'name' => 'Malo']));
check('iso2 inválido -> 422', $r['code'] === 422, "code={$r['code']}");

$r = http('PUT', "{$base}/api/countries/{$countryId}", json_encode(['name' => 'Brasil Federal']));
check('editar país = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$r = http('GET', "{$base}/api/countries/{$countryId}");
$b = $json($r['body']);
check('país actualizado en BD', ($b['data']['name'] ?? '') === 'Brasil Federal', $b['data']['name'] ?? '');

$r = http('DELETE', "{$base}/api/countries/1");
check('borrar país en uso -> 409', $r['code'] === 409, "code={$r['code']} {$r['body']}");
$r = http('DELETE', "{$base}/api/countries/999999");
check('borrar país inexistente -> 404', $r['code'] === 404, "code={$r['code']}");

$r = http('DELETE', "{$base}/api/countries/{$countryId}");
check('borrar país = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$r = http('GET', "{$base}/api/countries/{$countryId}");
check('país eliminado -> 404', $r['code'] === 404, "code={$r['code']}");

// Parámetros fiscales (modal de Países)
$r = http('GET', "{$base}/api/countries/1/fiscal-parameters");
$b = $json($r['body']);
check('GET fiscal-parameters (array)', $r['code'] === 200 && is_array($b), "code={$r['code']} {$r['body']}");

$r = http('POST', "{$base}/api/countries/1/fiscal-parameters", json_encode([
    'name' => 'IGV 18%', 'code' => 'igv18', 'percentage' => 18, 'type' => 'tax',
    'calculation_base' => 'services_total', 'applies_to' => 'any',
    'valid_from' => '2099-01-01', 'valid_to' => '2099-12-31', 'description' => 'IGV',
]));
$b = $json($r['body']);
check('crear parámetro fiscal = 201', $r['code'] === 201 && !empty($b['id']), "code={$r['code']} {$r['body']}");
$fpId = (int)($b['id'] ?? 0);

$r = http('GET', "{$base}/api/countries/1/fiscal-parameters");
$b = $json($r['body']);
$fp = null;
foreach ($b as $p) { if (($p['code'] ?? '') === 'IGV18') $fp = $p; }
check('parámetro persiste code normalizado', $fp !== null, json_encode($b));
check('parámetro persiste valid_from', ($fp['valid_from'] ?? '') === '2099-01-01', $fp['valid_from'] ?? '');
check('parámetro persiste valid_to', ($fp['valid_to'] ?? '') === '2099-12-31', $fp['valid_to'] ?? '');

$r = http('POST', "{$base}/api/countries/1/fiscal-parameters", json_encode(['name' => 'Dup', 'code' => 'IGV18', 'percentage' => 1]));
check('código fiscal duplicado -> 409', $r['code'] === 409, "code={$r['code']}");
$r = http('POST', "{$base}/api/countries/1/fiscal-parameters", json_encode(['name' => '', 'code' => '']));
check('parámetro sin nombre/código -> 422', $r['code'] === 422, "code={$r['code']}");

$r = http('PUT', "{$base}/api/fiscal-parameters/{$fpId}", json_encode(['percentage' => 19, 'valid_to' => '2099-06-30']));
check('editar parámetro fiscal = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$r = http('GET', "{$base}/api/countries/1/fiscal-parameters");
$b = $json($r['body']);
$fp = null;
foreach ($b as $p) { if (($p['id'] ?? 0) === $fpId) $fp = $p; }
check('parámetro actualizado (19 / valid_to)', $fp !== null && (float)$fp['percentage'] === 19.0 && ($fp['valid_to'] ?? '') === '2099-06-30', json_encode($fp));

$r = http('DELETE', "{$base}/api/fiscal-parameters/{$fpId}");
check('borrar parámetro fiscal = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");

// ================= CURRENCIES =================
echo "\n--- /dashboard/settings/currencies ---\n";
$r = http('GET', "{$base}/api/currencies?" . http_build_query(['per_page' => 10]));
$b = $json($r['body']);
check('GET /api/currencies = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('lista monedas (>=2) y meta', count($b['data'] ?? []) >= 2 && isset($b['meta']['total_pages']), json_encode($b['meta'] ?? []));

$r = http('GET', "{$base}/api/currencies?" . http_build_query(['q' => 'PEN']));
$b = $json($r['body']);
check('búsqueda q por code', $r['code'] === 200 && count($b['data'] ?? []) === 1 && ($b['data'][0]['code'] ?? '') === 'PEN', 'count=' . count($b['data'] ?? []));

$r = http('POST', "{$base}/api/currencies", json_encode(['code' => 'brl', 'name' => 'Real brasileño', 'symbol' => 'R$']));
$b = $json($r['body']);
check('crear moneda = 201 (code normalizado)', $r['code'] === 201 && !empty($b['data']['id']), "code={$r['code']} {$r['body']}");
$curId = (int)($b['data']['id'] ?? 0);

$r = http('POST', "{$base}/api/currencies", json_encode(['code' => 'USD', 'name' => 'Dup', 'symbol' => '$']));
check('code duplicado -> 409', $r['code'] === 409, "code={$r['code']}");
$r = http('POST', "{$base}/api/currencies", json_encode(['code' => 'EUR', 'name' => 'Euro', 'symbol' => '']));
check('moneda sin symbol -> 422', $r['code'] === 422, "code={$r['code']}");

$r = http('GET', "{$base}/api/currencies/{$curId}");
$b = $json($r['body']);
check('detalle moneda = 200', $r['code'] === 200 && ($b['data']['code'] ?? '') === 'BRL', json_encode($b));

$r = http('PUT', "{$base}/api/currencies/{$curId}", json_encode(['name' => 'Real (Brasil)']));
check('editar moneda = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$r = http('GET', "{$base}/api/currencies/{$curId}");
$b = $json($r['body']);
check('moneda actualizada en BD', ($b['data']['name'] ?? '') === 'Real (Brasil)', $b['data']['name'] ?? '');

$r = http('DELETE', "{$base}/api/currencies/1");
check('borrar moneda en uso -> 409', $r['code'] === 409, "code={$r['code']} {$r['body']}");
$r = http('DELETE', "{$base}/api/currencies/999999");
check('borrar moneda inexistente -> 404', $r['code'] === 404, "code={$r['code']}");

$r = http('DELETE', "{$base}/api/currencies/{$curId}");
check('borrar moneda = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$r = http('GET', "{$base}/api/currencies/{$curId}");
check('moneda eliminada -> 404', $r['code'] === 404, "code={$r['code']}");

echo "\n======== RESULTADO: {$pass} PASS / {$fail} FAIL ========\n";
if ($fail > 0) {
    echo "Fallos:\n";
    foreach ($failures as $f) echo "  - {$f}\n";
}

proc_terminate($proc);
usleep(300000);
proc_close($proc);
@unlink($dbFile);
@unlink($auditFile);

exit($fail > 0 ? 1 : 0);
