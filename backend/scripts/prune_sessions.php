<?php
declare(strict_types=1);

// =========================================================
// prune_sessions.php — Poda sesiones inactivas o vencidas.
//
// Uso (CLI/cron, no es webroot):
//   php backend/scripts/prune_sessions.php              (por defecto > 90 días)
//   php backend/scripts/prune_sessions.php 30
// =========================================================

require_once __DIR__ . '/../vendor/autoload.php';

try {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->safeLoad();
} catch (Throwable $e) {
}

header('Content-Type: text/plain; charset=utf-8');

try {
    $config = require __DIR__ . '/../config/config.php';
    $database = new \App\Database($config['db'] ?? []);
    $pdo = $database->pdo();
} catch (Throwable $e) {
    fwrite(STDERR, "No se pudo conectar a la base de datos: " . $e->getMessage() . "\n");
    exit(1);
}

$days = max(1, (int)($argv[1] ?? 90));

try {
    $stmt = $pdo->prepare(
        "DELETE FROM user_sessions
         WHERE last_activity < (NOW() - INTERVAL :d DAY)
            OR (refresh_expires_at IS NOT NULL AND refresh_expires_at < NOW())"
    );
    $stmt->execute([':d' => $days]);

    echo "Sesiones eliminadas (inactivas > {$days} días o refresh expirado): {$stmt->rowCount()}\n";
} catch (Throwable $e) {
    fwrite(STDERR, "Error al podar sesiones (revisa si la tabla existe): " . $e->getMessage() . "\n");
    exit(1);
}

exit(0);