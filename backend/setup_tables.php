<?php
require_once __DIR__ . '/src/Database.php';
$config = require __DIR__ . '/config/config.php';

use App\Database;

try {
    $db = new Database($config['db']);
    $pdo = $db->pdo();
    
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    echo "Existing tables: " . implode(', ', $tables) . "\n";

    // Create subscription_plans if not exists
    if (!in_array('subscription_plans', $tables)) {
        $pdo->exec("
            CREATE TABLE subscription_plans (
                id CHAR(36) PRIMARY KEY,
                code VARCHAR(50) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                currency_id INT NOT NULL,
                billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly', -- monthly, yearly
                features JSON NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        echo "Created subscription_plans table.\n";
        
        // Seed plans
        $pdo->exec("
            INSERT INTO subscription_plans (id, code, name, price, currency_id, billing_interval, features) VALUES
            (UUID(), 'free', 'Free Tier', 0.00, 1, 'monthly', '{\"users\": 2, \"projects\": 1}'),
            (UUID(), 'starter', 'Starter', 29.00, 1, 'monthly', '{\"users\": 5, \"projects\": 10}'),
            (UUID(), 'professional', 'Professional', 99.00, 1, 'monthly', '{\"users\": 20, \"projects\": 50}'),
            (UUID(), 'enterprise', 'Enterprise', 299.00, 1, 'monthly', '{\"users\": -1, \"projects\": -1}')
        ");
        echo "Seeded subscription_plans.\n";
    }

    // Create company_subscriptions if not exists
    if (!in_array('company_subscriptions', $tables)) {
        $pdo->exec("
            CREATE TABLE company_subscriptions (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                plan_id CHAR(36) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, canceled, past_due
                start_date DATE NOT NULL,
                end_date DATE NULL,
                next_billing_date DATE NULL,
                payment_method_json JSON NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                KEY idx_company_id (company_id),
                KEY idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        echo "Created company_subscriptions table.\n";
    }

    // Create docusign_envelopes if not exists
    if (!in_array('docusign_envelopes', $tables)) {
        $pdo->exec("
            CREATE TABLE docusign_envelopes (
                id CHAR(36) PRIMARY KEY,
                contract_id CHAR(36) NOT NULL,
                envelope_id VARCHAR(100) NOT NULL,
                status VARCHAR(50) NOT NULL,
                last_event_at DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                KEY idx_contract_id (contract_id),
                KEY idx_envelope_id (envelope_id),
                KEY idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        echo "Created docusign_envelopes table.\n";
    }

    // Create invoices table if not exists
    if (!in_array('invoices', $tables)) {
        $pdo->exec("
            CREATE TABLE invoices (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                contract_id CHAR(36) NULL,
                freelancer_id CHAR(36) NULL,
                invoice_number VARCHAR(50) NOT NULL,
                issue_date DATE NOT NULL,
                due_date DATE NOT NULL,
                currency_id INT NOT NULL,
                subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                status ENUM('draft', 'sent', 'paid', 'overdue', 'voided') NOT NULL DEFAULT 'draft',
                notes TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                KEY idx_company_id (company_id),
                KEY idx_contract_id (contract_id),
                KEY idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        echo "Created invoices table.\n";
    }

    // Create invoice_lines table if not exists
    if (!in_array('invoice_lines', $tables)) {
        $pdo->exec("
            CREATE TABLE invoice_lines (
                id CHAR(36) PRIMARY KEY,
                invoice_id CHAR(36) NOT NULL,
                description VARCHAR(255) NOT NULL,
                quantity DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
                unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                KEY idx_invoice_id (invoice_id),
                FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        echo "Created invoice_lines table.\n";
    }

} catch (Throwable $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
