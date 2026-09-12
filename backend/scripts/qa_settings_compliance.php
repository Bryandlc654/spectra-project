<?php
/**
 * QA end-to-end de:
 *   /dashboard/settings/auth, /dashboard/settings/smtp, /dashboard/settings/notifications,
 *   /dashboard/compliance, /dashboard/compliance/tax-forms, /dashboard/profile
 *
 * Uso: php backend/scripts/qa_settings_compliance.php
 */
declare(strict_types=1);

$root = dirname(__DIR__);
require_once $root . '/vendor/autoload.php';

$dbFile = $root . '/storage/qa_settings_compliance.sqlite';
$log = $root . '/storage/qa_settings_compliance_server.log';
@unlink($dbFile);
@unlink($log);

$pass = 0;
$fail = 0;
$failures = [];

function check(string $name, bool $cond, string $detail = ''): void
{
    global $pass, $fail, $failures;
    if ($cond) { $pass++; echo "  [PASS] {$name}\n"; }
    else { $fail++; $failures[] = $name . ($detail !== '' ? " -> {$detail}" : ''); echo "  [FAIL] {$name}" . ($detail !== '' ? " -> {$detail}" : '') . "\n"; }
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
    if ($rawBody !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $rawBody);
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $hlen = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    return ['code' => $code, 'headers' => substr((string)$res, 0, $hlen), 'body' => substr((string)$res, $hlen)];
}

function httpMultipart(string $url, array $fields): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HEADER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_POSTFIELDS => $fields,
    ]);
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $hlen = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    return ['code' => $code, 'headers' => substr((string)$res, 0, $hlen), 'body' => substr((string)$res, $hlen)];
}

$port = 8095;
$base = "http://127.0.0.1:{$port}";

$proc = proc_open(
    [PHP_BINARY, '-d', 'display_errors=1', '-S', "127.0.0.1:{$port}", '-t', $root, $root . '/scripts/qa_settings_compliance_server.php'],
    [0 => ['pipe', 'r'], 1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']],
    $pipes,
    $root
);
if (!is_resource($proc)) { echo "No se pudo iniciar el servidor de pruebas.\n"; exit(2); }

$ready = false;
for ($i = 0; $i < 50; $i++) {
    if (http('GET', "{$base}/__health")['code'] === 200) { $ready = true; break; }
    usleep(100000);
}
if (!$ready) {
    echo "El servidor no respondió. Log:\n" . (@file_get_contents($log) ?: '') . "\n";
    proc_terminate($proc); proc_close($proc); exit(2);
}

$json = fn(string $s) => json_decode($s, true);
$sdb = new PDO('sqlite:' . $dbFile, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);

echo "======== QA: settings + compliance + profile ========\n";

// ============ SETTINGS (auth / smtp) ============
echo "\n--- /dashboard/settings/auth + smtp ---\n";
$r = http('GET', "{$base}/api/system-settings");
$b = $json($r['body']);
check('GET /api/system-settings = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('client_id presente', ($b['data']['google_client_id'] ?? '') !== '', json_encode($b['data'] ?? []));
check('secret de Google enmascarado', ($b['data']['google_client_secret'] ?? '') === '********', $b['data']['google_client_secret'] ?? '');
check('smtp_pass enmascarado', ($b['data']['smtp_pass'] ?? '') === '********', $b['data']['smtp_pass'] ?? '');

$r = http('PUT', "{$base}/api/system-settings", json_encode([
    'google_client_id' => 'nuevo-id.apps.googleusercontent.com',
    'google_client_secret' => '********',
    'smtp_host' => 'smtp.test.com',
]));
check('PUT /api/system-settings = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$r = http('GET', "{$base}/api/system-settings");
$b = $json($r['body']);
check('client_id persistido', ($b['data']['google_client_id'] ?? '') === 'nuevo-id.apps.googleusercontent.com', $b['data']['google_client_id'] ?? '');
check('secret NO sobrescrito por máscara', ($b['data']['google_client_secret'] ?? '') === '********', $b['data']['google_client_secret'] ?? '');
$secret = $sdb->query("SELECT setting_value FROM system_settings WHERE setting_key='google_client_secret'")->fetchColumn();
check('secret real intacto en BD', $secret === 'secret123', (string)$secret);

$r = http('POST', "{$base}/api/system-settings/test-smtp", json_encode([]));
check('test-smtp sin "to" -> 422', $r['code'] === 422, "code={$r['code']} {$r['body']}");

// ============ NOTIFICATIONS ============
echo "\n--- /dashboard/settings/notifications ---\n";
$r = http('GET', "{$base}/api/notifications");
$b = $json($r['body']);
check('GET /api/notifications = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('solo notificaciones del usuario (2)', count($b['items'] ?? []) === 2, 'count=' . count($b['items'] ?? []));
check('unread_count = 1', (int)($b['unread_count'] ?? -1) === 1, json_encode($b['unread_count'] ?? null));

$r = http('PATCH', "{$base}/api/notifications/n1");
$b = $json($r['body']);
check('PATCH marcar leída = success', $r['code'] === 200 && ($b['success'] ?? false) === true, "code={$r['code']} {$r['body']}");
$r = http('GET', "{$base}/api/notifications");
$b = $json($r['body']);
check('unread_count = 0 tras marcar', (int)($b['unread_count'] ?? -1) === 0, json_encode($b['unread_count'] ?? null));

$r = http('POST', "{$base}/api/notifications/read-all");
$b = $json($r['body']);
check('read-all = success', $r['code'] === 200 && ($b['success'] ?? false) === true, "code={$r['code']} {$r['body']}");

// ============ COMPLIANCE ============
echo "\n--- /dashboard/compliance ---\n";
$r = http('GET', "{$base}/api/compliance/requirements?country_id=1");
$b = $json($r['body']);
check('GET requirements = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
check('auto-seed Perú (>=3 requisitos)', count($b['data'] ?? []) >= 3, 'count=' . count($b['data'] ?? []));
check('meta.pages presente', isset($b['meta']['pages']), json_encode($b['meta'] ?? []));
$reqId = $b['data'][0]['id'] ?? '';

$r = http('GET', "{$base}/api/compliance/documents");
$b = $json($r['body']);
check('GET documents (propios) = 200', $r['code'] === 200 && is_array($b['data'] ?? null), "code={$r['code']} {$r['body']}");

// Subida multipart
$tmp = $root . '/storage/qa_upload.txt';
file_put_contents($tmp, 'documento de prueba QA');
$r = httpMultipart("{$base}/api/compliance/documents", [
    'requirement_id' => $reqId,
    'file' => new CURLFile($tmp, 'text/plain', 'qa_upload.txt'),
]);
$b = $json($r['body']);
check('subir documento = 200', $r['code'] === 200 && !empty($b['path']), "code={$r['code']} {$r['body']}");
$docId = $sdb->query("SELECT id FROM user_compliance_documents WHERE user_id='qa-user' LIMIT 1")->fetchColumn();
check('documento persistido (pending)', (bool)$docId, 'sin registro');
$status = $sdb->query("SELECT status FROM user_compliance_documents WHERE id=" . $sdb->quote((string)$docId))->fetchColumn();
check('estado inicial pending', $status === 'pending', (string)$status);

$r = http('PUT', "{$base}/api/compliance/documents/{$docId}", json_encode(['status' => 'verified']));
check('usuario normal no puede verificar -> 403', $r['code'] === 403, "code={$r['code']} {$r['body']}");
$r = http('PUT', "{$base}/api/compliance/documents/{$docId}?__as=admin", json_encode(['status' => 'verified']));
check('admin verifica documento = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$status = $sdb->query("SELECT status FROM user_compliance_documents WHERE id=" . $sdb->quote((string)$docId))->fetchColumn();
check('estado verificado en BD', $status === 'verified', (string)$status);

// ============ TAX FORMS ============
echo "\n--- /dashboard/compliance/tax-forms ---\n";
$r = http('GET', "{$base}/api/tax-forms/me");
check('GET /tax-forms/me = 200 (vacío)', $r['code'] === 200, "code={$r['code']}");

$r = http('POST', "{$base}/api/tax-forms", json_encode([
    'type' => 'w9', 'data' => ['name' => 'Normal User', 'signature' => 'Normal User', 'ssn_ein' => 'XXX'],
]));
$b = $json($r['body']);
check('POST /tax-forms = 200 con id', $r['code'] === 200 && !empty($b['id']), "code={$r['code']} {$r['body']}");
$formId = (string)($b['id'] ?? '');

$r = http('GET', "{$base}/api/tax-forms/me");
$b = $json($r['body']);
check('me devuelve formulario', $r['code'] === 200 && ($b['type'] ?? '') === 'w9' && is_array($b['data'] ?? null), json_encode($b));

$r = http('GET', "{$base}/api/tax-forms/{$formId}/download");
check('download propio = 200 text/html', $r['code'] === 200 && stripos($r['headers'], 'text/html') !== false, "code={$r['code']}");
check('download contiene Form W-9', str_contains($r['body'], 'Form W-9') && str_contains($r['body'], 'Normal User'), substr($r['body'], 0, 120));

$r = http('GET', "{$base}/api/tax-forms");
check('listado admin denegado a usuario normal -> 403', $r['code'] === 403, "code={$r['code']} {$r['body']}");
$r = http('GET', "{$base}/api/tax-forms?__as=admin");
$b = $json($r['body']);
check('listado admin = 200 con paginación', $r['code'] === 200 && count($b['data'] ?? []) >= 1 && isset($b['pagination']['total_pages']), "code={$r['code']} {$r['body']}");

// ============ PROFILE ============
echo "\n--- /dashboard/profile ---\n";
$r = http('PUT', "{$base}/api/users/qa-user", json_encode(['full_name' => 'Nombre Actualizado', 'email' => 'normal@example.com']));
check('usuario edita su propio perfil = 200', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$name = $sdb->query("SELECT full_name FROM users WHERE id='qa-user'")->fetchColumn();
check('nombre actualizado en BD', $name === 'Nombre Actualizado', (string)$name);

$r = http('PUT', "{$base}/api/users/qa-user", json_encode(['full_name' => 'X', 'platform_role' => 'super_admin']));
check('auto-edición no devuelve 403', $r['code'] === 200, "code={$r['code']} {$r['body']}");
$role = $sdb->query("SELECT platform_role FROM users WHERE id='qa-user'")->fetchColumn();
check('rol NO escalado por auto-edición', $role === 'user', (string)$role);

$r = http('PUT', "{$base}/api/users/qa-other", json_encode(['full_name' => 'Hack']));
check('editar otro usuario -> 403', $r['code'] === 403, "code={$r['code']} {$r['body']}");

$r = http('PUT', "{$base}/api/users/qa-user", json_encode(['full_name' => 'X', 'email' => 'admin@example.com']));
check('email duplicado -> 409', $r['code'] === 409, "code={$r['code']} {$r['body']}");

$r = http('POST', "{$base}/api/users/qa-other/send-password-reset", json_encode([]));
check('reset de contraseña de otro -> 403', $r['code'] === 403, "code={$r['code']} {$r['body']}");

$r = http('POST', "{$base}/api/users/qa-user/send-password-reset", json_encode([]));
check('reset propio autorizado (no 403)', $r['code'] !== 403, "code={$r['code']} {$r['body']}");

echo "\n======== RESULTADO: {$pass} PASS / {$fail} FAIL ========\n";
if ($fail > 0) { echo "Fallos:\n"; foreach ($failures as $f) echo "  - {$f}\n"; }

proc_terminate($proc);
usleep(300000);
proc_close($proc);
@unlink($dbFile);
@unlink($tmp);
foreach (glob($root . '/public/uploads/compliance/*') ?: [] as $f) @unlink($f);

exit($fail > 0 ? 1 : 0);
