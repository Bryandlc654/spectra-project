<?php
// ============================================================
// DIAGNÓSTICO TEMPORAL DE CONEXIÓN A BD
// Ábrelo en el navegador y BÓRRALO después de usarlo.
// Ej:  https://core.spectralatam.com/db_check.php
//      https://core.spectralatam.com/public/db_check.php
// ============================================================
header('Content-Type: text/plain; charset=utf-8');
ini_set('display_errors', '1');
error_reporting(E_ALL);

echo "PHP: " . PHP_VERSION . "\n";
foreach (['pdo_mysql', 'mysqli', 'curl', 'mbstring', 'openssl', 'dom', 'gd'] as $ext) {
    echo "ext {$ext}: " . (extension_loaded($ext) ? 'OK' : 'FALTA') . "\n";
}

$autoload = __DIR__ . '/../vendor/autoload.php';
echo "\nvendor/autoload.php: " . (file_exists($autoload) ? 'OK' : 'NO EXISTE') . "\n";
if (file_exists($autoload)) {
    require_once $autoload;
} else {
    echo "No puedo continuar sin vendor/autoload.php\n";
    exit;
}

$envPath = __DIR__ . '/../.env';
echo ".env: " . (file_exists($envPath) ? (is_readable($envPath) ? 'existe y legible' : 'existe pero NO legible') : 'NO existe') . "\n";

if (class_exists('Dotenv\\Dotenv')) {
    try {
        Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();
        echo "Dotenv: cargado\n";
    } catch (\Throwable $e) {
        echo "Dotenv ERROR: " . $e->getMessage() . "\n";
    }
} else {
    echo "Dotenv: clase NO disponible (revisa vendor/)\n";
}

echo "\n-- Variables de entorno --\n";
foreach (['DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD', 'JWT_SECRET', 'APP_DEBUG'] as $k) {
    $g = getenv($k);
    echo "{$k}: getenv=" . ($g === false ? 'no' : 'sí') . " \$_ENV=" . (isset($_ENV[$k]) ? 'sí' : 'no') . "\n";
}

$configFile = __DIR__ . '/../config/config.php';
echo "\nconfig.php: " . (file_exists($configFile) ? 'OK' : 'NO EXISTE') . "\n";
$config = require $configFile;
$db = $config['db'] ?? [];

echo "\n-- Config de BD resuelta (password enmascarado) --\n";
echo "host     = " . ($db['host'] ?? '(vacío)') . "\n";
echo "port     = " . ($db['port'] ?? '(vacío)') . "\n";
echo "database = " . ($db['database'] ?? '(vacío)') . "\n";
echo "username = " . ($db['username'] ?? '(vacío)') . "\n";
echo "password = " . (($db['password'] ?? '') === '' ? '(VACÍO)' : 'definido (' . strlen((string)$db['password']) . ' chars)') . "\n";

echo "\n-- Prueba de conexión --\n";
try {
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', $db['host'], $db['port'], $db['database'], $db['charset'] ?? 'utf8mb4');
    $pdo = new PDO($dsn, $db['username'] ?? '', $db['password'] ?? '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 10,
    ]);
    echo "CONEXIÓN OK -> MySQL " . $pdo->query('SELECT VERSION()')->fetchColumn() . "\n";
} catch (\Throwable $e) {
    echo "CONEXIÓN FALLÓ:\n" . $e->getMessage() . "\n";
}

echo "\n-- Permisos de escritura --\n";
foreach (['storage', 'storage/cache', 'storage/logs'] as $d) {
    $p = __DIR__ . '/../' . $d;
    echo "  {$d}: " . (is_dir($p) ? (is_writable($p) ? 'OK' : 'existe pero NO escribible') : 'NO existe') . "\n";
}

echo "\n-- DSN usado --\n";
echo sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', $db['host'] ?? '', $db['port'] ?? '', $db['database'] ?? '', $db['charset'] ?? 'utf8mb4') . "\n";
