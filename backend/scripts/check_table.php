<?php
require __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();
$pdo = new PDO("mysql:host=" . $_ENV['DB_HOST'] . ";port=" . $_ENV['DB_PORT'] . ";dbname=" . $_ENV['DB_DATABASE'], $_ENV['DB_USERNAME'], trim($_ENV['DB_PASSWORD'], "'\""));
$stmt = $pdo->query("SHOW CREATE TABLE password_resets");
echo $stmt->fetchColumn(1);
