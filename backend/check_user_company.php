<?php

require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/src/Database.php';

use App\Database;

// Load env
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
$dotenv->load();

// Init DB
$config = require __DIR__ . '/config/config.php';
$db = new Database($config['db']);
$pdo = $db->pdo();

$email = 'admin@simulacion.com';

echo "Checking user: $email\n";

$stmt = $pdo->prepare("SELECT id, full_name, platform_role FROM users WHERE email = :email");
$stmt->execute([':email' => $email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    echo "User not found.\n";
    exit;
}

echo "User ID: " . $user['id'] . "\n";
echo "Platform Role: " . $user['platform_role'] . "\n";

echo "Checking company_users...\n";

// Query 1: Active company
$stmtCompany = $pdo->prepare("
    SELECT company_id, status, active_company
    FROM company_users 
    WHERE user_id = :uid 
    ORDER BY active_company DESC, created_at DESC 
");
$stmtCompany->execute([':uid' => $user['id']]);
$memberships = $stmtCompany->fetchAll(PDO::FETCH_ASSOC);

print_r($memberships);

// Simulate AuthController logic
$companyId = null;
$stmtCompany = $pdo->prepare("
    SELECT company_id 
    FROM company_users 
    WHERE user_id = :uid AND status = 'active' 
    ORDER BY active_company DESC, created_at DESC 
    LIMIT 1
");
$stmtCompany->execute([':uid' => $user['id']]);
$companyId = $stmtCompany->fetchColumn();

echo "AuthController Logic Result (Active): " . ($companyId ?: 'NULL') . "\n";

if (!$companyId) {
    $stmtFallback = $pdo->prepare("SELECT company_id FROM company_users WHERE user_id = :uid LIMIT 1");
    $stmtFallback->execute([':uid' => $user['id']]);
    $companyId = $stmtFallback->fetchColumn();
    echo "AuthController Logic Result (Fallback): " . ($companyId ?: 'NULL') . "\n";
}
