<?php
require_once __DIR__ . '/Backend/vendor/autoload.php';

use App\Database;

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/Backend/');
$dotenv->safeLoad();

require_once __DIR__ . '/Backend/src/Database.php';

$config = require __DIR__ . '/Backend/config/config.php';

try {
    $db = new Database($config['db']);
    $pdo = $db->pdo();
    
    // Get one invoice ID
    $stmt = $pdo->query("SELECT id FROM invoices LIMIT 1");
    $invoiceId = $stmt->fetchColumn();
    
    if (!$invoiceId) {
        echo "No invoices found.\n";
        exit;
    }
    
    echo "Testing invoice ID: $invoiceId\n";
    
    $sql = "
            SELECT 
                i.id,
                ct.title as contract_title
            FROM invoices i
            LEFT JOIN contracts con ON i.contract_id = con.id
            LEFT JOIN contract_templates ct ON con.template_id = ct.id
            WHERE i.id = :id
    ";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id' => $invoiceId]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    
    print_r($result);

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
