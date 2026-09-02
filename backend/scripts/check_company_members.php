<?php
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../src/Database.php';

$config = require __DIR__ . '/../config/config.php';
$database = new \App\Database($config['db']);
$pdo = $database->pdo();

$cid = $_GET['company_id'] ?? null;
if (!$cid) {
    $stmt = $pdo->query("SELECT id FROM companies WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1");
    $cid = $stmt->fetchColumn();
}

$sql = "
SELECT cu.id as company_user_id, u.id as user_id, u.email, u.full_name, r.name as role_name
FROM company_users cu
JOIN users u ON u.id = cu.user_id
LEFT JOIN user_roles ur ON ur.company_user_id = cu.id
LEFT JOIN roles r ON r.id = ur.role_id
WHERE cu.company_id = :cid AND cu.status = 'active'
ORDER BY u.email ASC
";
$stmt = $pdo->prepare($sql);
$stmt->execute([':cid' => $cid]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

header('Content-Type: application/json');
echo json_encode(['company_id' => $cid, 'members' => $rows], JSON_UNESCAPED_UNICODE);
