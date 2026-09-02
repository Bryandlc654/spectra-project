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

    echo "Wallets Columns:\n";
    $stmt = $pdo->query("DESCRIBE wallets");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $col) {
        echo $col['Field'] . " ";
    }
    echo "\n";

} catch (PDOException $e) {
    echo "DB Error: " . $e->getMessage();
}
