<?php
require_once __DIR__ . '/vendor/autoload.php';
$config = require __DIR__ . '/config/config.php';

try {
    $pdo = new PDO(
        "mysql:host={$config['db']['host']};port={$config['db']['port']};dbname={$config['db']['database']};charset={$config['db']['charset']}",
        $config['db']['username'],
        $config['db']['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Get Company
    $stmt = $pdo->query("SELECT id, legal_name FROM companies LIMIT 1");
    $company = $stmt->fetch(PDO::FETCH_ASSOC);

    // Get Freelancer
    $stmt = $pdo->query("SELECT id, full_name, email FROM users WHERE platform_role IN ('freelancer', 'freelance') LIMIT 1");
    $freelancer = $stmt->fetch(PDO::FETCH_ASSOC);

    // Get Admin User
    $stmt = $pdo->query("SELECT id, full_name, email FROM users WHERE platform_role = 'admin' OR platform_role = 'owner' LIMIT 1");
    $admin = $stmt->fetch(PDO::FETCH_ASSOC);
    
    // Check Wallet
    if ($company) {
        $stmt = $pdo->prepare("SELECT company_id, balance FROM wallets WHERE company_id = ?");
        $stmt->execute([$company['id']]);
        $wallet = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$wallet) {
            // Create wallet if missing
            $pdo->prepare("INSERT INTO wallets (company_id, balance, currency_id, created_at) VALUES (?, 10000.00, 1, NOW())")
                ->execute([$company['id']]);
            $wallet = ['company_id' => $company['id'], 'balance' => 10000.00];
            echo "Created Wallet for company.\n";
        } elseif ($wallet['balance'] < 1000) {
            // Top up wallet
            $pdo->prepare("UPDATE wallets SET balance = 10000.00 WHERE company_id = ?")->execute([$company['id']]);
             echo "Topped up Wallet.\n";
        }
    }

    echo json_encode([
        'company' => $company,
        'freelancer' => $freelancer,
        'admin' => $admin,
        'wallet' => $wallet ?? null
    ]);

} catch (PDOException $e) {
    echo "DB Error: " . $e->getMessage();
}
