<?php
require_once __DIR__ . '/src/Database.php';
$config = require __DIR__ . '/config/config.php';

use App\Database;

try {
    $db = new Database($config['db']);
    $pdo = $db->pdo();
    
    // Check if column exists
    $stmt = $pdo->prepare("SHOW COLUMNS FROM companies LIKE 'logo_url'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN logo_url VARCHAR(255) NULL AFTER trade_name");
        echo "Column logo_url added to companies table.\n";
    } else {
        echo "Column logo_url already exists.\n";
    }

} catch (Throwable $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
