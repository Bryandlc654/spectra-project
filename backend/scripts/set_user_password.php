<?php
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../src/Database.php';

$config = require __DIR__ . '/../config/config.php';
$database = new \App\Database($config['db']);
$pdo = $database->pdo();

$email = $argv[1] ?? null;
$newPass = $argv[2] ?? null;

if (!$email || !$newPass) {
    header('Content-Type: application/json');
    echo json_encode(['error' => 'usage: php set_user_password.php <email> <password>']);
    exit(1);
}

$stmt = $pdo->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
$stmt->execute([':email' => strtolower($email)]);
$uid = $stmt->fetchColumn();
if (!$uid) {
    header('Content-Type: application/json');
    echo json_encode(['error' => 'user_not_found']);
    exit(2);
}

$hash = password_hash($newPass, PASSWORD_BCRYPT);
$upd = $pdo->prepare("UPDATE users SET password_hash = :hash WHERE id = :id");
$upd->execute([':hash' => $hash, ':id' => $uid]);

header('Content-Type: application/json');
echo json_encode(['ok' => true, 'user_id' => $uid]);
