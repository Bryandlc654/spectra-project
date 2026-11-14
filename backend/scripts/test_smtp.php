<?php
require __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

echo "Testing SMTP connection...\n";
try {
    \App\Support\SMTP::send('test@example.com', 'Test Subject', 'Test Body', true);
    echo "SMTP send executed successfully.\n";
} catch (Exception $e) {
    echo "SMTP ERROR: " . $e->getMessage() . "\n";
}
