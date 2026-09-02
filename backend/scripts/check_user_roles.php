<?php
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../src/Database.php';

$config = require __DIR__ . '/../config/config.php';
$database = new \App\Database($config['db']);
$pdo = $database->pdo();

$email = $argv[1] ?? ($_GET['email'] ?? null);
if (!$email) {
    header('Content-Type: application/json');
    echo json_encode(['error' => 'usage: php check_user_roles.php <email>']);
    exit(1);
}
$email = strtolower(trim($email));

$stmt = $pdo->prepare("SELECT id, full_name, email, platform_role FROM users WHERE email LIKE :email LIMIT 1");
$stmt->execute([':email' => $email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$user) {
    header('Content-Type: application/json');
    echo json_encode(['error' => 'user_not_found']);
    exit(2);
}

// Company ID selection (mimic AuthController)
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
if (!$companyId) {
    $stmtFallback = $pdo->prepare("SELECT company_id FROM company_users WHERE user_id = :uid LIMIT 1");
    $stmtFallback->execute([':uid' => $user['id']]);
    $companyId = $stmtFallback->fetchColumn();
}

$stmtRoles = $pdo->prepare("
    SELECT DISTINCT r.name
    FROM company_users cu
    JOIN user_roles ur ON cu.id = ur.company_user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE cu.user_id LIKE :uid AND cu.status LIKE 'active'
");
$stmtRoles->execute([':uid' => $user['id']]);
$tenantRoles = $stmtRoles->fetchAll(PDO::FETCH_COLUMN);

header('Content-Type: application/json');
echo json_encode([
    'user' => [
        'id' => $user['id'],
        'full_name' => $user['full_name'],
        'email' => $user['email'],
        'platform_role' => $user['platform_role'],
        'company_id' => $companyId ?: null,
        'roles' => $tenantRoles,
    ]
], JSON_UNESCAPED_UNICODE);
