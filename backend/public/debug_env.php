<?php
// Script de depuración para verificar variables de entorno en el servidor
// Subir a Backend/public/debug_env.php y visitar https://apispectraerp.nextboostperu.com/public/debug_env.php

ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/../vendor/autoload.php';

try {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
    $dotenv->safeLoad();
    echo "Dotenv loaded successfully.\n";
} catch (Exception $e) {
    echo "Error loading Dotenv: " . $e->getMessage() . "\n";
}

header('Content-Type: text/plain');

echo "--- Debug Info ---\n";
echo "GOOGLE_CLIENT_ID (getenv): " . (getenv('GOOGLE_CLIENT_ID') ?: 'NULL/FALSE') . "\n";
echo "GOOGLE_CLIENT_ID ($_ENV): " . ($_ENV['GOOGLE_CLIENT_ID'] ?? 'NOT SET') . "\n";
echo "GOOGLE_CLIENT_ID ($_SERVER): " . ($_SERVER['GOOGLE_CLIENT_ID'] ?? 'NOT SET') . "\n";

echo "\n--- File Check ---\n";
$envPath = __DIR__ . '/../.env';
echo ".env path: $envPath\n";
echo ".env exists: " . (file_exists($envPath) ? 'YES' : 'NO') . "\n";
if (file_exists($envPath)) {
    echo ".env readable: " . (is_readable($envPath) ? 'YES' : 'NO') . "\n";
    $content = file_get_contents($envPath);
    echo "GOOGLE_CLIENT_ID in file content: " . (strpos($content, 'GOOGLE_CLIENT_ID') !== false ? 'FOUND' : 'NOT FOUND') . "\n";
}
