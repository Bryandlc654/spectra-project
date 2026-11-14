<?php
require __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

try {
    $pdo = new PDO(
        "mysql:host=" . $_ENV['DB_HOST'] . ";port=" . $_ENV['DB_PORT'] . ";dbname=" . $_ENV['DB_DATABASE'] . ";charset=utf8mb4",
        $_ENV['DB_USERNAME'],
        trim($_ENV['DB_PASSWORD'], "'\"")
    );
    $stmt = $pdo->query("SELECT setting_value FROM system_settings WHERE setting_key = 'system_frontend_url'");
    echo "URL: " . $stmt->fetchColumn() . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
