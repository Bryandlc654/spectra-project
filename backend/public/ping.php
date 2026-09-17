<?php
// Test mínimo: NO usa vendor ni BD. Si esto da 500, el problema es PHP (versión/handler).
header('Content-Type: text/plain; charset=utf-8');
echo "PING OK\n";
echo "PHP version: " . PHP_VERSION . "\n";
echo "pdo_mysql: " . (extension_loaded('pdo_mysql') ? 'OK' : 'FALTA') . "\n";
echo "vendor/autoload.php existe: " . (file_exists(__DIR__ . '/../vendor/autoload.php') ? 'SI' : 'NO') . "\n";
$storage = __DIR__ . '/../storage';
echo "storage existe: " . (is_dir($storage) ? 'SI' : 'NO') . " | escribible: " . (is_dir($storage) && is_writable($storage) ? 'SI' : 'NO') . "\n";
