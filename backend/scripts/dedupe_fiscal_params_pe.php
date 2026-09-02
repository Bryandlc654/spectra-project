<?php
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../src/Database.php';

$config = require __DIR__ . '/../config/config.php';
$database = new \App\Database($config['db']);
$pdo = $database->pdo();

// Resolve Peru country_id by iso2
$stmt = $pdo->prepare("SELECT id FROM countries WHERE iso2 = 'PE' LIMIT 1");
$stmt->execute();
$countryId = $stmt->fetchColumn();
if (!$countryId) {
    echo json_encode(['error' => 'country_not_found']);
    exit(1);
}

// Find duplicate codes (same code repeated)
$sql = "
SELECT code, COUNT(*) as cnt
FROM fiscal_parameters
WHERE country_id = :cid
GROUP BY code
HAVING COUNT(*) > 1
";
$stmt = $pdo->prepare($sql);
$stmt->execute([':cid' => $countryId]);
$dups = $stmt->fetchAll(PDO::FETCH_ASSOC);

$deleted = [];
foreach ($dups as $d) {
    $code = $d['code'];
    // Keep the lowest id, delete others
    $stmtIds = $pdo->prepare("SELECT id FROM fiscal_parameters WHERE country_id = :cid AND code = :code ORDER BY id ASC");
    $stmtIds->execute([':cid' => $countryId, ':code' => $code]);
    $ids = $stmtIds->fetchAll(PDO::FETCH_COLUMN);
    if (count($ids) <= 1) continue;
    $keep = array_shift($ids);
    foreach ($ids as $rid) {
        $pdo->prepare("DELETE FROM fiscal_parameters WHERE id = :id")->execute([':id' => $rid]);
        $deleted[] = ['code' => $code, 'removed_id' => $rid, 'kept_id' => $keep];
    }
}

header('Content-Type: application/json');
echo json_encode(['country_id' => $countryId, 'deleted' => $deleted, 'total_dups_fixed' => count($deleted)], JSON_UNESCAPED_UNICODE);
