<?php
require_once __DIR__ . '/../vendor/autoload.php';

$base = 'http://127.0.0.1:8000';
$email = $argv[1] ?? '';
$password = $argv[2] ?? '';

if ($email === '' || $password === '') {
    header('Content-Type: application/json');
    echo json_encode(['error' => 'usage: php login_user.php <email> <password>']);
    exit(1);
}

$payload = json_encode(['email' => $email, 'password' => $password]);
$ctx = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\n",
        'content' => $payload,
        'ignore_errors' => true
    ]
]);
$res = file_get_contents($base . '/api/login', false, $ctx);
header('Content-Type: application/json');
echo $res !== false ? $res : json_encode(['error' => 'request_failed']);
