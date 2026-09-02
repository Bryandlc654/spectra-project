<?php
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../src/Database.php';

$config = require __DIR__ . '/../config/config.php';
$database = new \App\Database($config['db']);
$pdo = $database->pdo();

$stmt = $pdo->query("SELECT id, legal_name, created_at FROM companies WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1");
$row = $stmt->fetch(PDO::FETCH_ASSOC);
header('Content-Type: application/json');
echo json_encode(['latest' => $row ?: null], JSON_UNESCAPED_UNICODE);
