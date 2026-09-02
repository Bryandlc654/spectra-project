<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

try {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->safeLoad();
} catch (Throwable $e) {
}

require_once __DIR__ . '/../src/Database.php';

function uuidv4(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

header('Content-Type: application/json; charset=utf-8');

try {
    $config = require __DIR__ . '/../config/config.php';
    $dbConf = $config['db'] ?? [];

    $database = new \App\Database($dbConf);
    $pdo = $database->pdo();

    $email = getenv('FINOPS_SEED_EMAIL') ?: 'finance.ops@frontspectra.test';
    $password = getenv('FINOPS_SEED_PASSWORD') ?: 'Spectra#2026';
    $fullName = getenv('FINOPS_SEED_NAME') ?: 'Finance Ops';
    $platformRole = 'finance';

    $stmt = $pdo->prepare("SELECT id, status, platform_role FROM users WHERE email LIKE :email AND deleted_at IS NULL");
    $stmt->execute([':email' => strtolower($email)]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($existing) {
        echo json_encode([
            'status' => 'exists',
            'message' => 'Ya existe un usuario activo con ese email',
            'data' => [
                'email' => $email,
                'platform_role' => $existing['platform_role'],
                'login' => [
                    'api' => '/api/login',
                    'email' => $email,
                    'password' => $password
                ]
            ]
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $id = uuidv4();
    $hash = password_hash($password, PASSWORD_BCRYPT);

    $insert = $pdo->prepare("
        INSERT INTO users (id, full_name, email, password_hash, status, platform_role, created_at)
        VALUES (:id, :name, :email, :hash, 'active', :role, NOW())
    ");
    $insert->execute([
        ':id' => $id,
        ':name' => $fullName,
        ':email' => strtolower($email),
        ':hash' => $hash,
        ':role' => $platformRole
    ]);

    echo json_encode([
        'status' => 'created',
        'message' => 'Usuario Finance Ops creado correctamente',
        'data' => [
            'id' => $id,
            'full_name' => $fullName,
            'email' => $email,
            'platform_role' => $platformRole,
            'login' => [
                'api' => '/api/login',
                'email' => $email,
                'password' => $password
            ]
        ]
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Error al crear el usuario',
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
