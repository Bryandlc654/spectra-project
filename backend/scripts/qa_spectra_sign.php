<?php
/**
 * QA end-to-end de Spectra Sign (firma digital propia).
 *
 * Uso: php backend/scripts/qa_spectra_sign.php
 *
 * Levanta un servidor PHP embebido con scripts/qa_spectra_sign_server.php
 * (SQLite + fixtures), ejecuta los casos con cURL contra los controladores
 * reales y valida efectos en la "base de datos". Sale con código 1 si falla.
 */
declare(strict_types=1);

$root = dirname(__DIR__);
require_once $root . '/vendor/autoload.php';

$dbFile = $root . '/storage/qa_spectra_sign.sqlite';
$log = $root . '/storage/qa_spectra_sign_server.log';
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

$port = 8099;
$base = "http://127.0.0.1:{$port}";

$proc = proc_open(
    [PHP_BINARY, '-d', 'display_errors=1', '-S', "127.0.0.1:{$port}", '-t', $root, $root . '/scripts/qa_spectra_sign_server.php'],
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
    $r = http('GET', "{$base}/__health");
    if ($r['code'] === 200) { $ready = true; break; }
    usleep(100000);
}
if (!$ready) {
    echo "El servidor no respondió. Log:\n" . (@file_get_contents($log) ?: '') . "\n";
    proc_terminate($proc);
    proc_close($proc);
    exit(2);
}

$json = fn(string $s): array => (json_decode($s, true) ?: []);
$png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
$goodSvg = 'M 10 80 L 40 20 L 90 90 L 150 30 L 220 80 L 300 40';

echo "================ Spectra Sign QA ================\n";

// ---- 1. Crear sobre de contrato (endpoint autenticado) ----
$r = http('POST', "{$base}/api/envelopes", json_encode(['contract_id' => 'qa-contract']));
$b = $json($r['body']);
check('POST /api/envelopes crea el sobre (200)', $r['code'] === 200, "code={$r['code']} body={$r['body']}");
check('provider = spectra_sign', ($b['provider'] ?? '') === 'spectra_sign', json_encode($b));
check('envelope_id con prefijo SPEC-', str_starts_with((string)($b['envelope_id'] ?? ''), 'SPEC-'), $b['envelope_id'] ?? '');
check('respuesta incluye signing_url con token', !empty($b['signing_url']) && str_contains($b['signing_url'], '/sign/'), $b['signing_url'] ?? '');

$sdb = new PDO('sqlite:' . $dbFile, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$env = $sdb->query("SELECT * FROM docusign_envelopes WHERE contract_id='qa-contract' AND amendment_id IS NULL ORDER BY rowid DESC LIMIT 1")->fetch();
$token = (string)($env['sign_token'] ?? '');
$envId = (string)($env['id'] ?? '');
check('token persistido (64 hex)', strlen($token) === 64 && ctype_xdigit($token));

// ---- 2. Estado público del documento ----
$r = http('GET', "{$base}/api/sign/{$token}");
$b = $json($r['body']);
check('GET /api/sign/{token} = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('signed = false antes de firmar', ($b['signed'] ?? true) === false);
check('contract_title correcto', ($b['contract_title'] ?? '') === 'QA Contract', $b['contract_title'] ?? '');
check('content_html con variables reemplazadas', str_contains($b['content_html'] ?? '', 'QA Company') && str_contains($b['content_html'] ?? '', 'QA Freelancer'));
check('signer_name de fallback', ($b['signer_name'] ?? '') === 'QA Freelancer', $b['signer_name'] ?? '');

// ---- 3. Token inexistente ----
$r = http('GET', "{$base}/api/sign/tokeninvalido");
check('token inválido -> 404', $r['code'] === 404, "code={$r['code']}");

// ---- 4. Firma ausente / inválida ----
$r = http('POST', "{$base}/api/sign/{$token}", '{}');
check('sin firma -> 422', $r['code'] === 422, "code={$r['code']} {$r['body']}");

$r = http('POST', "{$base}/api/sign/{$token}", json_encode(['signature' => 'data:image/png;base64,QUJD']));
check('PNG con magic bytes inválidos -> 422', $r['code'] === 422, "code={$r['code']}");

$r = http('POST', "{$base}/api/sign/{$token}", json_encode(['signature_svg' => '<script>alert(1)</script>']));
check('trazo SVG con markup malicioso -> 422', $r['code'] === 422, "code={$r['code']}");

// ---- 5. Firma correcta (PNG + SVG) ----
$r = http('POST', "{$base}/api/sign/{$token}", json_encode([
    'signature' => $png,
    'signature_svg' => $goodSvg,
    'signature_width' => 900,
    'signature_height' => 300,
    'name' => 'QA Freelancer',
    'email' => 'qa.freelancer@example.com',
]));
$b = $json($r['body']);
check('firma válida -> 201', $r['code'] === 201, "code={$r['code']} {$r['body']}");
check('respuesta incluye pdf_url', !empty($b['pdf_url']), $b['pdf_url'] ?? '');

// ---- 6. Estado tras firmar ----
$r = http('GET', "{$base}/api/sign/{$token}");
$b = $json($r['body']);
check('signed = true tras firmar', ($b['signed'] ?? false) === true);
check('signed_at presente', !empty($b['signed_at']));
check('pdf_url disponible', !empty($b['pdf_url']));

// ---- 7. PDF firmado ----
$r = http('GET', "{$base}/api/sign/{$token}/pdf");
check('GET /api/sign/{token}/pdf = 200', $r['code'] === 200, "code={$r['code']}");
check('contenido es un PDF (%PDF)', str_starts_with($r['body'], '%PDF'), substr($r['body'], 0, 8));
check('content-type application/pdf', stripos($r['headers'], 'application/pdf') !== false);

// ---- 8. Doble firma ----
$r = http('POST', "{$base}/api/sign/{$token}", json_encode(['signature_svg' => $goodSvg]));
check('doble firma -> 409', $r['code'] === 409, "code={$r['code']}");

// ---- 9. Efectos en la BD ----
$contract = $sdb->query("SELECT status FROM contracts WHERE id='qa-contract'")->fetch();
check('contrato pasa a active', ($contract['status'] ?? '') === 'active', $contract['status'] ?? '');
$env = $sdb->query("SELECT * FROM docusign_envelopes WHERE id=" . $sdb->quote($envId))->fetch();
check('signed_pdf guardado', !empty($env['signed_pdf']));
check('signature_svg guardado', !empty($env['signature_svg']));
check('signature_data (PNG) guardado', !empty($env['signature_data']));
check('signer_name guardado', ($env['signer_name'] ?? '') === 'QA Freelancer');
check('signature_ip guardado', !empty($env['signature_ip']));

// ---- 10. action=view ----
$r = http('POST', "{$base}/api/envelopes/{$envId}?action=view");
$b = $json($r['body']);
check('action=view devuelve token + url', ($b['token'] ?? '') === $token && !empty($b['url']), $r['body']);

// ---- 11. Listado de sobres ----
$r = http('GET', "{$base}/api/envelopes");
$b = $json($r['body']);
$found = false;
foreach (($b['data'] ?? []) as $row) {
    if (($row['id'] ?? '') === $envId && !empty($row['signing_url']) && !empty($row['pdf_url'])) {
        $found = true;
    }
}
check('GET /api/envelopes incluye signing_url y pdf_url', $r['code'] === 200 && $found, "code={$r['code']}");

// ---- 12. Sobre de enmienda ----
$r = http('POST', "{$base}/api/envelopes", json_encode(['amendment_id' => 'qa-amendment']));
$b = $json($r['body']);
check('enmienda crea sobre spectra_sign', $r['code'] === 200 && ($b['provider'] ?? '') === 'spectra_sign', "code={$r['code']} {$r['body']}");
$am = $sdb->query("SELECT * FROM docusign_envelopes WHERE amendment_id='qa-amendment' ORDER BY rowid DESC LIMIT 1")->fetch();
$token2 = (string)($am['sign_token'] ?? '');
$envId2 = (string)($am['id'] ?? '');
check('token de enmienda persistido', strlen($token2) === 64);

// ---- 13. Contenido de la enmienda ----
$r = http('GET', "{$base}/api/sign/{$token2}");
$b = $json($r['body']);
check('contenido de enmienda incluye cambios', str_contains($b['content_html'] ?? '', 'ENMIENDA') && str_contains($b['content_html'] ?? '', '1500'), substr($b['content_html'] ?? '', 0, 140));

// ---- 14. Anulación ----
$r = http('POST', "{$base}/api/envelopes/{$envId2}?action=void");
check('anular sobre -> 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$r = http('GET', "{$base}/api/sign/{$token2}");
$b = $json($r['body']);
check('estado = voided', ($b['status'] ?? '') === 'voided', json_encode($b));
$r = http('POST', "{$base}/api/sign/{$token2}", json_encode(['signature_svg' => $goodSvg]));
check('firmar sobre anulado -> 409', $r['code'] === 409, "code={$r['code']}");

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
