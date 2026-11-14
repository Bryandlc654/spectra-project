<?php
require __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

try {
    $pdo = new PDO(
        "mysql:host=" . $_ENV['DB_HOST'] . ";port=" . $_ENV['DB_PORT'] . ";dbname=" . $_ENV['DB_DATABASE'] . ";charset=utf8mb4",
        $_ENV['DB_USERNAME'],
        trim($_ENV['DB_PASSWORD'], "'\"")
    );
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $email = 'nextboost53@gmail.com';
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user) {
        $id = $user['id'];
        
        $pdo->prepare("DELETE FROM user_roles WHERE company_user_id IN (SELECT id FROM company_users WHERE user_id = ?)")->execute([$id]);
        $pdo->prepare("DELETE FROM company_users WHERE user_id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM user_sessions WHERE user_id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM password_resets WHERE email = ?")->execute([$email]);
        $pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$id]);
        
        echo "User $email (ID: $id) completely deleted from the database.\n";
    } else {
        echo "User $email not found.\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
