<?php
declare(strict_types=1);

// =========================================================
// Desactiva cuentas de nivel empresa que quedaron "huérfanas":
// usuarios (company_admin / user) cuyas empresas fueron TODAS
// eliminadas antes de que el borrado de empresas las desactivara.
// Siguen activos y pueden iniciar sesión.
//
// Uso (CLI):
//   php backend/scripts/disable_orphan_company_users.php            # solo muestra (por defecto)
//   php backend/scripts/disable_orphan_company_users.php --apply    # aplica los cambios
//
// No toca staff interno (super_admin, admin, support, finance...) ni
// freelancers, ni usuarios que nunca tuvieron empresa asignada.
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

$config = require __DIR__ . '/../config/config.php';
$pdo = (new \App\Database($config['db']))->pdo();
$apply = in_array('--apply', $argv ?? [], true);

$sql = "
    SELECT u.id, u.full_name, u.email, u.platform_role, u.last_login_at
    FROM users u
    WHERE u.status = 'active'
      AND u.deleted_at IS NULL
      AND (u.platform_role IN ('company_admin', 'user', '', 'none') OR u.platform_role IS NULL)
      AND EXISTS (SELECT 1 FROM company_users cu WHERE cu.user_id = u.id)
      AND NOT EXISTS (
          SELECT 1 FROM company_users cu
          JOIN companies c ON c.id = cu.company_id AND c.deleted_at IS NULL
          WHERE cu.user_id = u.id AND cu.deleted_at IS NULL
      )
    ORDER BY u.created_at
";
$rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

echo ($apply ? "MODO APLICAR" : "MODO SOLO LECTURA (usa --apply para aplicar)") . "\n";
echo "Cuentas huérfanas activas: " . count($rows) . "\n";
foreach ($rows as $r) {
    printf("  %s | %s | %s | último login: %s\n", $r['full_name'], $r['email'], $r['platform_role'] ?: '(vacío)', $r['last_login_at'] ?: 'nunca');
}

if (!$apply || !$rows) {
    exit(0);
}

$pdo->beginTransaction();
try {
    // Membresías que siguen "vivas" en empresas eliminadas
    $pdo->exec("
        UPDATE company_users cu
        JOIN companies c ON c.id = cu.company_id
        SET cu.status = 'disabled', cu.deleted_at = NOW()
        WHERE c.deleted_at IS NOT NULL AND cu.deleted_at IS NULL
    ");
    $disable = $pdo->prepare("UPDATE users SET status = 'disabled' WHERE id = :id");
    $revoke = $pdo->prepare("UPDATE user_sessions SET is_active = 0 WHERE user_id = :id");
    foreach ($rows as $r) {
        $disable->execute([':id' => $r['id']]);
        $revoke->execute([':id' => $r['id']]);
    }
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, "Error: " . $e->getMessage() . "\n");
    exit(1);
}

try {
    (new \App\Support\AuditLogger())->log('maintenance.orphan_users.disabled', 'user', null, ['users' => array_column($rows, 'id')]);
} catch (Throwable $e) {
}

echo "Desactivadas " . count($rows) . " cuentas y revocadas sus sesiones.\n";
