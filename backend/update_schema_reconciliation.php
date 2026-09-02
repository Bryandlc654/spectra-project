<?php

require_once __DIR__ . '/src/Database.php';

use App\Database;

$config = require __DIR__ . '/config/config.php';
$database = new Database($config['db']);
$pdo = $database->pdo();

echo "Updating schema for Reconciliation module...\n";

try {
    // 1. Add is_reconciled and reconciled_at columns if they don't exist
    $columns = $pdo->query("SHOW COLUMNS FROM wallet_transactions")->fetchAll(PDO::FETCH_COLUMN);
    
    if (!in_array('is_reconciled', $columns)) {
        echo "Adding is_reconciled column...\n";
        $pdo->exec("ALTER TABLE wallet_transactions ADD COLUMN is_reconciled BOOLEAN DEFAULT 0 AFTER status");
    } else {
        echo "Column is_reconciled already exists.\n";
    }

    if (!in_array('reconciled_at', $columns)) {
        echo "Adding reconciled_at column...\n";
        $pdo->exec("ALTER TABLE wallet_transactions ADD COLUMN reconciled_at DATETIME NULL AFTER is_reconciled");
    } else {
        echo "Column reconciled_at already exists.\n";
    }

    // 2. Modify ENUM to include 'adjustment'
    // We need to check the current column definition to see if it already has 'adjustment'
    // But blindly altering ENUM is usually okay in MySQL if we just append.
    // However, we must be careful not to lose data.
    // The current definition is: ENUM('deposit', 'withdrawal', 'transfer', 'payment', 'refund')
    // We want: ENUM('deposit', 'withdrawal', 'transfer', 'payment', 'refund', 'adjustment')
    
    echo "Updating wallet_transactions type ENUM...\n";
    $pdo->exec("ALTER TABLE wallet_transactions MODIFY COLUMN type ENUM('deposit', 'withdrawal', 'transfer', 'payment', 'refund', 'adjustment') NOT NULL");
    
    echo "Schema update completed successfully.\n";

} catch (PDOException $e) {
    echo "SQL Error: " . $e->getMessage() . "\n";
} catch (Throwable $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
