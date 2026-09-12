<?php

namespace App\Controllers;

use App\Database;
use App\Support\Auth;
use App\Support\Response;
use App\Support\AuditLogger;
use PDO;
use Throwable;

class AuthController
{
    private PDO $pdo;
    private array $jwt;
    private AuditLogger $audit;

    public function __construct(Database $database, array $jwtConfig)
    {
        $this->pdo = $database->pdo();
        $this->jwt = $jwtConfig;
        $this->audit = new AuditLogger();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255),
                status VARCHAR(50) DEFAULT 'active',
                platform_role VARCHAR(50) DEFAULT 'user',
                deleted_at DATETIME NULL,
                last_login_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (email),
                INDEX (platform_role)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        try { $this->pdo->exec("ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL AFTER platform_role"); } catch (\Throwable $e) {}

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS system_settings (
                setting_key VARCHAR(100) PRIMARY KEY,
                setting_value TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS user_identities (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                provider VARCHAR(50) NOT NULL,
                provider_id VARCHAR(255) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_provider (provider, provider_id),
                INDEX (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Lazy Migrations for user_identities
        try { 
            $this->pdo->query("SELECT provider_id FROM user_identities LIMIT 1"); 
        } catch (\Throwable $e) { 
            try { 
                $this->pdo->exec("ALTER TABLE user_identities ADD COLUMN provider_id VARCHAR(255) NOT NULL DEFAULT ''"); 
                $this->pdo->exec("ALTER TABLE user_identities ADD UNIQUE INDEX unique_provider (provider, provider_id)");
            } catch (\Throwable $x) {} 
        }

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS password_resets (
                email VARCHAR(255) NOT NULL,
                token VARCHAR(255) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS user_sessions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                token_hash VARCHAR(64),
                is_active BOOLEAN DEFAULT 1,
                jti VARCHAR(64) NULL,
                refresh_token_hash VARCHAR(64) NULL,
                refresh_expires_at DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (user_id),
                INDEX (token_hash)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        try { $this->pdo->query("SELECT jti FROM user_sessions LIMIT 1"); } catch (\Throwable $e) { try { $this->pdo->exec("ALTER TABLE user_sessions ADD COLUMN jti VARCHAR(64) NULL"); } catch (\Throwable $x) {} }
        try { $this->pdo->query("SELECT refresh_token_hash FROM user_sessions LIMIT 1"); } catch (\Throwable $e) { try { $this->pdo->exec("ALTER TABLE user_sessions ADD COLUMN refresh_token_hash VARCHAR(64) NULL"); } catch (\Throwable $x) {} }
        try { $this->pdo->query("SELECT refresh_expires_at FROM user_sessions LIMIT 1"); } catch (\Throwable $e) { try { $this->pdo->exec("ALTER TABLE user_sessions ADD COLUMN refresh_expires_at DATETIME NULL"); } catch (\Throwable $x) {} }

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS login_attempts (
                email VARCHAR(255) NOT NULL,
                ip_address VARCHAR(45) NOT NULL,
                attempts INT NOT NULL DEFAULT 0,
                last_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                locked_until DATETIME NULL,
                PRIMARY KEY (email, ip_address),
                INDEX (email),
                INDEX (ip_address)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Ensure last_activity column exists (migration for user_sessions)
        try {
            $this->pdo->query("SELECT last_activity FROM user_sessions LIMIT 1");
        } catch (\Throwable $e) {
            try {
                $this->pdo->exec("ALTER TABLE user_sessions ADD COLUMN last_activity DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
            } catch (\Throwable $ex) {
                // Ignore error
            }
        }

        // Ensure manager_id column exists in users table (for Org Chart)
        try {
            $this->pdo->exec("ALTER TABLE users ADD COLUMN manager_id VARCHAR(36) NULL");
            $this->pdo->exec("ALTER TABLE users ADD INDEX (manager_id)");
        } catch (\Throwable $ex) {
            // Ignore error (column likely exists)
        }

        // Ensure global_permissions column exists
        try {
            $this->pdo->query("SELECT global_permissions FROM users LIMIT 1");
        } catch (\Throwable $e) {
            try {
                $this->pdo->exec("ALTER TABLE users ADD COLUMN global_permissions JSON NULL");
            } catch (\Throwable $ex) {
                // Ignore
            }
        }

        try {
            $this->pdo->query("SELECT freelancer_code FROM users LIMIT 1");
        } catch (\Throwable $e) {
            try {
                $this->pdo->exec("ALTER TABLE users ADD COLUMN freelancer_code CHAR(6) NULL");
                $this->pdo->exec("CREATE UNIQUE INDEX idx_users_freelancer_code ON users(freelancer_code)");
            } catch (\Throwable $ex) {
            }
        }

        try {
            $this->pdo->query("SELECT national_id FROM users LIMIT 1");
        } catch (\Throwable $e) {
            try {
                $this->pdo->exec("ALTER TABLE users ADD COLUMN national_id VARCHAR(190) NULL");
            } catch (\Throwable $ex) {
            }
        }

        try {
            $stmt = $this->pdo->query("SELECT id FROM users WHERE (platform_role = 'freelancer' OR platform_role = 'freelance') AND (freelancer_code IS NULL OR freelancer_code = '') LIMIT 50");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as $r) {
                $code = $this->generateUniqueFreelancerCode();
                $upd = $this->pdo->prepare("UPDATE users SET freelancer_code = :code WHERE id = :id AND (freelancer_code IS NULL OR freelancer_code = '')");
                $upd->execute([':code' => $code, ':id' => $r['id']]);
            }
        } catch (\Throwable $e) {
        }
    }

    private function generateUniqueFreelancerCode(): string
    {
        while (true) {
            $code = \App\Support\Str::randomDigits(6);
            $stmt = $this->pdo->prepare("SELECT id FROM users WHERE freelancer_code = :code LIMIT 1");
            $stmt->execute([':code' => $code]);
            if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
                return $code;
            }
        }
    }

    public function login(): void
    {
        try {
            $payload = $this->readPayload();
            if (empty($payload)) {
                Response::error('Body vacío o inválido', 400);
                return;
            }

            $email = strtolower(trim((string)($payload['email'] ?? '')));
            $password = (string)($payload['password'] ?? '');

            if ($email === '' || $password === '') {
                Response::error('Correo y contraseña son requeridos', 422);
                return;
            }

            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                Response::error('Correo inválido', 422);
                return;
            }

            // ensureTables() called in constructor handles table creation
            if ($this->isLocked($email, $_SERVER['REMOTE_ADDR'] ?? '')) {
                Response::error('Demasiados intentos. Intente más tarde.', 429);
                return;
            }

            $stmt = $this->pdo->prepare(
                'SELECT * FROM users
                 WHERE email LIKE :email
                 LIMIT 1'
            );
            $stmt->execute([':email' => $email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user || empty($user['password_hash'])) {
                $this->registerFailedAttempt($email, $_SERVER['REMOTE_ADDR'] ?? '');
                Response::error('Credenciales inválidas', 401);
                return;
            }

            if (($user['status'] ?? '') !== 'active') {
                Response::error('La cuenta no está activa', 403);
                return;
            }

            if (!password_verify($password, (string)$user['password_hash'])) {
                $this->registerFailedAttempt($email, $_SERVER['REMOTE_ADDR'] ?? '');
                Response::error('Credenciales inválidas', 401);
                return;
            }

            // Best-effort: si no existe la columna, no debe tumbar el login
            $this->touchLastLogin((string)$user['id']);

            // JWT
            $now = time();
            $ttl = (int)($this->jwt['ttl'] ?? 3600);

            $claims = [
                'iss'  => (string)($this->jwt['issuer'] ?? ''),
                'iat'  => $now,
                'nbf'  => $now,
                'exp'  => $now + $ttl,
                'sub'  => (string)$user['id'],
                'role' => (string)($user['platform_role'] ?? ''),
                'jti'  => $this->generateUuid(),
            ];

            $token = Auth::jwtEncode($claims, (string)$this->jwt['secret']);
            
            // Audit Log
            $this->audit->log(
                'login', 
                'user', 
                (string)$user['id'], 
                ['ip' => $_SERVER['REMOTE_ADDR'] ?? null], 
                null, 
                'User logged in'
            );

            // Get Tenant Roles
            $stmtRoles = $this->pdo->prepare("
                SELECT DISTINCT r.name
                FROM company_users cu
                JOIN user_roles ur ON cu.id = ur.company_user_id
                JOIN roles r ON ur.role_id = r.id
                WHERE cu.user_id LIKE :uid AND cu.status LIKE 'active'
            ");
            $stmtRoles->execute([':uid' => $user['id']]);
            $tenantRoles = $stmtRoles->fetchAll(PDO::FETCH_COLUMN);

            // Get Primary Company ID
            $companyId = null;
            if (($user['platform_role'] ?? '') !== 'super_admin') {
                try {
                    $stmtCompany = $this->pdo->prepare("
                        SELECT company_id 
                        FROM company_users 
                        WHERE user_id = :uid AND status = 'active' 
                        ORDER BY active_company DESC, created_at DESC 
                        LIMIT 1
                    ");
                    $stmtCompany->execute([':uid' => $user['id']]);
                    $companyId = $stmtCompany->fetchColumn();

                    if (!$companyId) {
                        // Fallback: Try finding ANY company for this user, ignoring status/active flag
                        $stmtFallback = $this->pdo->prepare("SELECT company_id FROM company_users WHERE user_id = :uid LIMIT 1");
                        $stmtFallback->execute([':uid' => $user['id']]);
                        $companyId = $stmtFallback->fetchColumn();
                    }
                } catch (Throwable $e) {
                    // Log error but don't fail login
                    file_put_contents(__DIR__ . '/../../debug_login_error.log', "Company fetch error: " . $e->getMessage() . "\n", FILE_APPEND);
                }
            }

            $refreshTtlDays = 30;
            $refreshToken = $this->randomToken();
            $refreshHash = hash('sha256', $refreshToken);
            $this->recordSession((string)$user['id'], $token, $claims['jti'], $refreshHash, (new \DateTimeImmutable("+$refreshTtlDays days"))->format('Y-m-d H:i:s'));
            $this->resetAttempts($email, $_SERVER['REMOTE_ADDR'] ?? '');

            $this->audit->log('login_success', 'user', $user['id'], ['email' => $user['email'], 'role' => $user['platform_role']]);

            file_put_contents(__DIR__ . '/../../debug_login.log', "Login User: " . $user['email'] . " | CID: " . json_encode($companyId) . "\n", FILE_APPEND);

            Response::json([
                'message' => 'Inicio de sesión exitoso',
                'token' => $token,
                'expires_in' => $ttl,
                'refresh_token' => $refreshToken,
                'user' => [
                    'id' => $user['id'],
                    'full_name' => $user['full_name'],
                    'email' => $user['email'],
                    'platform_role' => $user['platform_role'],
                    'role' => $user['platform_role'], // Alias for frontend compatibility
                    'roles' => $tenantRoles,
                    'company_id' => $companyId ?: null,
                    'country_id' => $user['country_id'] ?? null,
                    'nationality' => $user['nationality'] ?? null
                ],
            ], 200);

        } catch (Throwable $e) {
            Response::error('Error interno en login', 500, [
                'message' => $e->getMessage(),
            ]);
            return;
        }
    }

    public function registerAdmin(): void
    {
        try {
            $payload = $this->readPayload();
            if (empty($payload)) {
                Response::error('Body vacío o inválido', 400);
                return;
            }

            $fullName = trim((string)($payload['full_name'] ?? ''));
            $email = strtolower(trim((string)($payload['email'] ?? '')));
            $password = (string)($payload['password'] ?? '');

            if ($fullName === '' || $email === '' || $password === '') {
                Response::error('Nombre, correo y contraseña son requeridos', 422);
                return;
            }

            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                Response::error('Correo inválido', 422);
                return;
            }

            if (strlen($password) < 8) {
                Response::error('La contraseña debe tener al menos 8 caracteres', 422);
                return;
            }

            // Removed explicit tableExists check to rely on ensureTables() and standard SQL errors
            // if (!$this->tableExists('users')) ...

            if ($this->emailExists($email)) {
                Response::error('Ya existe un usuario con ese correo', 409);
                return;
            }

            $passwordHash = password_hash($password, PASSWORD_BCRYPT);
            $id = $this->generateUuid();

            $stmt = $this->pdo->prepare(
                'INSERT INTO users (id, full_name, email, password_hash, status, platform_role, created_at)
                 VALUES (:id, :full_name, :email, :password_hash, :status, :platform_role, NOW())'
            );

            $stmt->execute([
                ':id' => $id,
                ':full_name' => $fullName,
                ':email' => $email,
                ':password_hash' => $passwordHash,
                ':status' => 'active',
                ':platform_role' => 'user',
            ]);

            if ($stmt->rowCount() !== 1) {
                Response::error('No se pudo insertar el usuario (rowCount=0)', 500);
                return;
            }

            Response::json([
                'message' => 'Admin registrado exitosamente',
                'id' => $id,
            ], 201);

        } catch (Throwable $e) {
            Response::error('Error interno al registrar', 500, [
                'error' => $e->getMessage()
            ]);
        }
    }

    public function forgotPassword(): void
    {
        try {
            $payload = $this->readPayload();
            if (empty($payload)) {
                Response::error('Body vacío o inválido', 400);
                return;
            }

            $email = strtolower(trim((string)($payload['email'] ?? '')));

            if ($email === '') {
                Response::error('Correo es requerido', 422);
                return;
            }

            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                Response::error('Correo inválido', 422);
                return;
            }

            $stmt = $this->pdo->prepare("SELECT id, full_name, email, status FROM users WHERE email LIKE :email LIMIT 1");
            $stmt->execute([':email' => $email]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$user) {
                // Do not reveal whether the email exists
                Response::json([
                    'message' => 'Si el correo está registrado, te hemos enviado un enlace para restablecer la contraseña'
                ]);
                return;
            }

            $this->ensurePasswordResetsTable();

            $token = bin2hex(random_bytes(32));

            $del = $this->pdo->prepare("DELETE FROM password_resets WHERE email LIKE :email");
            $del->execute([':email' => $email]);

            $ins = $this->pdo->prepare("INSERT INTO password_resets (email, token, created_at) VALUES (:email, :token, NOW())");
            $ins->execute([':email' => $email, ':token' => $token]);

            $resetLink = $this->getFrontendUrl() . "/auth/reset-password?token=$token&email=" . urlencode($email);

            $fullName = $user['full_name'] ?: $user['email'];

            // Force UTF-8 encoding for the subject
            $subject = 'Restablecimiento de Contraseña';
            
            $body = "Hola {$fullName},<br><br>";
            $body .= "Se ha solicitado un restablecimiento de contraseña para tu cuenta.<br>";
            $body .= "Haz clic en el siguiente enlace para continuar:<br><br>";
            $body .= "<a href='$resetLink' style='padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px;'>Restablecer Contraseña</a><br><br>";
            $body .= "Si no solicitaste esto, ignora este correo.<br><br>";
            $body .= "El enlace expirará en 60 minutos.";

            try {
                // Ensure send returns true/false and log explicitly
                $sent = \App\Support\SMTP::send($email, $subject, $body);
                
                if (!$sent) {
                     error_log("SMTP forgotPassword failed for $email (returned false)");
                }

                $this->audit->log(
                    'user.password_reset_sent',
                    'user',
                    (string)$user['id'],
                    ['email' => $email]
                );
            } catch (Throwable $smtpError) {
                error_log('SMTP forgotPassword error: ' . $smtpError->getMessage());
                // Do not leak SMTP errors to the client to avoid user enumeration
            }

            Response::json([
                'message' => 'Si el correo está registrado, te hemos enviado un enlace para restablecer la contraseña'
            ]);
        } catch (Throwable $e) {
            Response::error('Error al iniciar el restablecimiento de contraseña', 500, [
                'message' => $e->getMessage(),
            ]);
        }
    }

    public function resetPassword(): void
    {
        try {
            $payload = $this->readPayload();
            if (empty($payload)) {
                Response::error('Body vacío o inválido', 400);
                return;
            }

            $email = strtolower(trim((string)($payload['email'] ?? '')));
            $token = (string)($payload['token'] ?? '');
            $password = (string)($payload['password'] ?? '');

            if ($email === '' || $token === '' || $password === '') {
                Response::error('Correo, token y nueva contraseña son requeridos', 422);
                return;
            }

            if (strlen($password) < 8) {
                Response::error('La contraseña debe tener al menos 8 caracteres', 422);
                return;
            }

            // Verify token
            $stmt = $this->pdo->prepare("SELECT created_at FROM password_resets WHERE email LIKE :email AND token = :token LIMIT 1");
            $stmt->execute([':email' => $email, ':token' => $token]);
            $reset = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$reset) {
                Response::error('Token inválido o correo incorrecto', 400);
                return;
            }

            // Check expiration (60 minutes)
            $createdAt = new \DateTime($reset['created_at']);
            $now = new \DateTime();
            $interval = $now->diff($createdAt);
            $minutes = ($interval->days * 24 * 60) + ($interval->h * 60) + $interval->i;

            if ($minutes > 60) {
                Response::error('El enlace ha expirado. Solicita uno nuevo.', 400);
                return;
            }

            // Update password
            $passwordHash = password_hash($password, PASSWORD_BCRYPT);
            $upd = $this->pdo->prepare("UPDATE users SET password_hash = :hash WHERE email LIKE :email");
            $upd->execute([':hash' => $passwordHash, ':email' => $email]);

            // Delete used token
            $del = $this->pdo->prepare("DELETE FROM password_resets WHERE email LIKE :email");
            $del->execute([':email' => $email]);

            $this->audit->log(
                'user.password_reset_success',
                'user',
                'system', // We might not have user ID handy easily without another query, or could fetch it. 'system' or email is fine for now.
                ['email' => $email]
            );

            Response::json([
                'message' => 'Contraseña actualizada correctamente. Ahora puedes iniciar sesión.'
            ]);

        } catch (Throwable $e) {
            Response::error('Error al restablecer contraseña', 500, [
                'message' => $e->getMessage(),
            ]);
        }
    }

    // Google / Microsoft OAuth Handlers
    public function handleOAuth(string $provider, array $segments): void
    {
        // /api/auth/google/url
        // /api/auth/google/callback
        $action = $segments[3] ?? null;

        if ($provider === 'google') {
            if ($action === 'url') $this->googleUrl();
            elseif ($action === 'callback') $this->googleCallback();
            else Response::error('Acción inválida para Google', 404);
        } elseif ($provider === 'microsoft') {
            if ($action === 'url') $this->microsoftUrl();
            elseif ($action === 'callback') $this->microsoftCallback();
            else Response::error('Acción inválida para Microsoft', 404);
        } else {
            Response::error('Proveedor inválido', 404);
        }
    }

    private function getSystemSetting(string $key): ?string
    {
        try {
            // Check if table exists first to avoid crash
            if (!$this->tableExists('system_settings')) return null;

            $stmt = $this->pdo->prepare("SELECT setting_value FROM system_settings WHERE setting_key LIKE :k LIMIT 1");
            $stmt->execute([':k' => $key]);
            return $stmt->fetchColumn() ?: null;
        } catch (Throwable $e) {
            return null;
        }
    }

    private function ensurePasswordResetsTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS password_resets (
                email VARCHAR(190) NOT NULL,
                token VARCHAR(190) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    private function getFrontendUrl(): string
    {
        $configured = $this->getSystemSetting('system_frontend_url');
        if ($configured && filter_var($configured, FILTER_VALIDATE_URL)) {
            return rtrim($configured, '/');
        }

        return 'http://localhost:5173';
    }

    private function allowedFrontendOrigins(): array
    {
        $origins = [];

        $fromEnv = trim((string)(getenv('FRONTEND_URLS') ?: ''));
        if ($fromEnv !== '') {
            foreach (explode(',', $fromEnv) as $origin) {
                $origin = trim($origin);
                if ($origin !== '') $origins[$origin] = true;
            }
        }

        $configured = $this->getFrontendUrl();
        if ($configured) $origins[$configured] = true;

        // Dev y defaults de producción conocidos
        foreach ([
            'http://localhost:5173',
            'http://localhost:3000',
            'https://app.spectralatam.com',
            'https://manage.spectralatam.com',
        ] as $origin) {
            $origins[$origin] = true;
        }

        return array_keys($origins);
    }

    private function sanitizeRedirectUrl(string $redirectUrl): string
    {
        $parsed = parse_url($redirectUrl);
        if (!$parsed || !isset($parsed['scheme'], $parsed['host'])) {
            return $this->getFrontendUrl();
        }

        $scheme = strtolower($parsed['scheme']);
        if (!in_array($scheme, ['http', 'https'], true)) {
            return $this->getFrontendUrl();
        }

        $port = isset($parsed['port']) ? ':' . $parsed['port'] : '';
        $origin = $scheme . '://' . $parsed['host'] . $port;

        $allowedHosts = array_map(function ($origin) {
            return parse_url($origin, PHP_URL_HOST);
        }, $this->allowedFrontendOrigins());

        // Validar el origen completo (host + puerto)
        foreach ($this->allowedFrontendOrigins() as $allowed) {
            if (strcasecmp(rtrim($allowed, '/'), $origin) === 0) {
                return $redirectUrl;
            }
        }

        // Fallback: si el host coincide pero el puerto es el estándar, permitir igual
        if (in_array($parsed['host'], $allowedHosts, true) && $port === '') {
            $defaultPort = $scheme === 'https' ? ':443' : ':80';
            foreach ($this->allowedFrontendOrigins() as $allowed) {
                $allowedUrl = rtrim($allowed, '/');
                $allowedHost = parse_url($allowedUrl, PHP_URL_HOST);
                $allowedPort = parse_url($allowedUrl, PHP_URL_PORT);
                if ($allowedHost === $parsed['host'] && (($allowedPort === null && $defaultPort === ($scheme === 'https' ? ':443' : ':80')) || ':' . $allowedPort === $defaultPort)) {
                    return $redirectUrl;
                }
            }
        }

        return $this->getFrontendUrl();
    }

    private function getBaseApiUrl(): string
    {
        // Try to get from system settings first
        $configuredUrl = $this->getSystemSetting('system_api_url');
        if ($configuredUrl && filter_var($configuredUrl, FILTER_VALIDATE_URL)) {
            return rtrim($configuredUrl, '/\\');
        }

        $protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? "https" : "http";
        $host = $_SERVER['HTTP_HOST'];
        $scriptDir = dirname($_SERVER['SCRIPT_NAME']); // /public
        $scriptDir = rtrim($scriptDir, '/\\');
        return $protocol . "://" . $host . $scriptDir;
    }

    private function googleUrl(): void
    {
        $clientId = $this->getSystemSetting('google_client_id') 
            ?? $_ENV['GOOGLE_CLIENT_ID'] 
            ?? $_SERVER['GOOGLE_CLIENT_ID'] 
            ?? getenv('GOOGLE_CLIENT_ID');
            
        if (!$clientId) {
            Response::error('Google Auth no configurado (falta Client ID)', 400);
            return;
        }
        
        $frontendUrl = $this->sanitizeRedirectUrl($_GET['redirect_to'] ?? 'http://localhost:5173'); // Default fallback
        $callbackUrl = $this->getBaseApiUrl() . '/api/auth/google/callback';
        
        $state = base64_encode(json_encode(['redirect_to' => $frontendUrl]));

        $url = "https://accounts.google.com/o/oauth2/v2/auth?" . http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $callbackUrl,
            'response_type' => 'code',
            'scope' => 'email profile',
            'access_type' => 'offline',
            'state' => $state,
            'prompt' => 'consent'
        ]);
        
        Response::json(['url' => $url]);
    }

    private function googleCallback(): void
    {
        Auth::log('Starting googleCallback');
        $code = $_GET['code'] ?? '';
        $state = $_GET['state'] ?? '';
        
        if (!$code) {
            Auth::log('googleCallback: No code provided');
            Response::error('No code provided', 400);
            return;
        }

        $clientId = $this->getSystemSetting('google_client_id') 
            ?? $_ENV['GOOGLE_CLIENT_ID'] 
            ?? $_SERVER['GOOGLE_CLIENT_ID'] 
            ?? getenv('GOOGLE_CLIENT_ID');
            
        $clientSecret = $this->getSystemSetting('google_client_secret') 
            ?? $_ENV['GOOGLE_CLIENT_SECRET'] 
            ?? $_SERVER['GOOGLE_CLIENT_SECRET'] 
            ?? getenv('GOOGLE_CLIENT_SECRET');
        
        if (!$clientId || !$clientSecret) {
            Response::error('Google Auth misconfigured', 500);
            return;
        }

        $callbackUrl = $this->getBaseApiUrl() . '/api/auth/google/callback';

        // Exchange code
        $tokenUrl = 'https://oauth2.googleapis.com/token';
        $postData = [
            'code' => $code,
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => $callbackUrl,
            'grant_type' => 'authorization_code'
        ];
        
        $ch = curl_init($tokenUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
        $response = curl_exec($ch);
        curl_close($ch);
        
        $data = json_decode($response, true);
        if (isset($data['error'])) {
            Auth::log('googleCallback: Token Error: ' . ($data['error_description'] ?? $data['error']));
            Response::error('Google Token Error: ' . ($data['error_description'] ?? $data['error']), 400);
            return;
        }
        
        $accessToken = $data['access_token'] ?? '';
        if (!$accessToken) {
            Auth::log('googleCallback: No access token');
            Response::error('No access token from Google', 400);
            return;
        }
        
        // Get User Info
        $userInfoUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';
        $ch = curl_init($userInfoUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $accessToken]);
        $userInfoRes = curl_exec($ch);
        curl_close($ch);
        
        $userInfo = json_decode($userInfoRes, true);
        $email = $userInfo['email'] ?? '';
        $googleId = $userInfo['id'] ?? '';
        $name = $userInfo['name'] ?? $email;
        
        if (!$email) {
            Auth::log('googleCallback: No email from Google');
            Response::error('No email from Google', 400);
            return;
        }

        Auth::log("googleCallback: Success for $email");
        $this->finishSocialLogin($email, $state, 'google', $googleId, $name);
    }

    private function microsoftUrl(): void
    {
        $clientId = $this->getSystemSetting('microsoft_client_id');
        if (!$clientId) {
            Response::error('Microsoft Auth no configurado', 400);
            return;
        }
        
        $frontendUrl = $this->sanitizeRedirectUrl($_GET['redirect_to'] ?? 'http://localhost:5173');
        $callbackUrl = $this->getBaseApiUrl() . '/api/auth/microsoft/callback';
        $state = base64_encode(json_encode(['redirect_to' => $frontendUrl]));

        // Microsoft Entra ID (common)
        $url = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" . http_build_query([
            'client_id' => $clientId,
            'response_type' => 'code',
            'redirect_uri' => $callbackUrl,
            'response_mode' => 'query',
            'scope' => 'User.Read offline_access', // offline_access if needed
            'state' => $state,
        ]);
        
        Response::json(['url' => $url]);
    }

    private function microsoftCallback(): void
    {
        $code = $_GET['code'] ?? '';
        $state = $_GET['state'] ?? '';

        if (!$code) {
            Response::error('No code provided', 400);
            return;
        }

        $clientId = $this->getSystemSetting('microsoft_client_id');
        $clientSecret = $this->getSystemSetting('microsoft_client_secret');
        if (!$clientId || !$clientSecret) {
            Response::error('Microsoft Auth misconfigured', 500);
            return;
        }

        $callbackUrl = $this->getBaseApiUrl() . '/api/auth/microsoft/callback';
        
        // Exchange code
        $tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
        $postData = [
            'client_id' => $clientId,
            'scope' => 'User.Read offline_access',
            'code' => $code,
            'redirect_uri' => $callbackUrl,
            'grant_type' => 'authorization_code',
            'client_secret' => $clientSecret
        ];

        $ch = curl_init($tokenUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
        $response = curl_exec($ch);
        curl_close($ch);

        $data = json_decode($response, true);
        if (isset($data['error'])) {
            Response::error('Microsoft Token Error: ' . ($data['error_description'] ?? $data['error']), 400);
            return;
        }

        $accessToken = $data['access_token'] ?? '';
        if (!$accessToken) {
            Response::error('No access token from Microsoft', 400);
            return;
        }

        // Get User Info
        $userInfoUrl = 'https://graph.microsoft.com/v1.0/me';
        $ch = curl_init($userInfoUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $accessToken]);
        $userInfoRes = curl_exec($ch);
        curl_close($ch);

        $userInfo = json_decode($userInfoRes, true);
        $email = $userInfo['mail'] ?? $userInfo['userPrincipalName'] ?? '';
        $msId = $userInfo['id'] ?? '';
        $name = $userInfo['displayName'] ?? $email;
        
        if (!$email) {
            Response::error('No email from Microsoft', 400);
            return;
        }

        $this->finishSocialLogin($email, $state, 'microsoft', $msId, $name);
    }

    private function finishSocialLogin(string $email, string $state, string $provider, string $providerId, string $fullName): void
    {
        // 1. Check if user exists
        $stmt = $this->pdo->prepare("SELECT id, full_name, email, status, platform_role FROM users WHERE email LIKE :email LIMIT 1");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            // Auto-register new user
            $userId = $this->generateUuid();
            // Check if it's the first user ever (optional, but good practice to make first user super_admin)
            // But let's keep it simple: default to 'user'
            
            $stmtInsert = $this->pdo->prepare("
                INSERT INTO users (id, full_name, email, status, platform_role, created_at)
                VALUES (:id, :name, :email, 'active', 'user', NOW())
            ");
            $stmtInsert->execute([
                ':id' => $userId,
                ':name' => $fullName,
                ':email' => $email
            ]);
            
            $user = [
                'id' => $userId,
                'full_name' => $fullName,
                'email' => $email,
                'status' => 'active',
                'platform_role' => 'user'
            ];
        }

        if (($user['status'] ?? '') !== 'active') {
             Auth::log("finishSocialLogin: User inactive ($email)");
             $this->redirectFrontend($state, ['error' => 'user_inactive']);
             return;
        }

        // 2. Link Identity (Idempotent)
        if ($providerId) {
            $stmtLink = $this->pdo->prepare("
                INSERT INTO user_identities (id, user_id, provider, provider_id)
                VALUES (UUID(), :uid, :prov, :pid)
                ON DUPLICATE KEY UPDATE provider_id = provider_id
            ");
            $stmtLink->execute([
                ':uid' => $user['id'],
                ':prov' => $provider,
                ':pid' => $providerId
            ]);
        }

        $this->touchLastLogin((string)$user['id']);

        // Issue Token
        $now = time();
        $ttl = (int)($this->jwt['ttl'] ?? 3600);

        $claims = [
            'iss'  => (string)($this->jwt['issuer'] ?? ''),
            'iat'  => $now,
            'nbf'  => $now,
            'exp'  => $now + $ttl,
            'sub'  => (string)$user['id'],
            'role' => (string)($user['platform_role'] ?? ''),
        ];

        Auth::log("finishSocialLogin: Generating token for user {$user['id']}");
        $token = Auth::jwtEncode($claims, (string)$this->jwt['secret']);
        
        // Record Session
        $this->recordSession((string)$user['id'], $token);

        $stmtRoles = $this->pdo->prepare("
            SELECT DISTINCT r.name
            FROM company_users cu
            JOIN user_roles ur ON cu.id = ur.company_user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE cu.user_id LIKE :uid AND cu.status LIKE 'active'
        ");
        $stmtRoles->execute([':uid' => $user['id']]);
        $tenantRoles = $stmtRoles->fetchAll(PDO::FETCH_COLUMN);

        $companyId = null;
        try {
            $stmtCompany = $this->pdo->prepare("
                SELECT company_id 
                FROM company_users 
                WHERE user_id = :uid AND status = 'active' 
                ORDER BY active_company DESC, created_at DESC 
                LIMIT 1
            ");
            $stmtCompany->execute([':uid' => $user['id']]);
            $companyId = $stmtCompany->fetchColumn();
            if (!$companyId) {
                $stmtFallback = $this->pdo->prepare("SELECT company_id FROM company_users WHERE user_id = :uid LIMIT 1");
                $stmtFallback->execute([':uid' => $user['id']]);
                $companyId = $stmtFallback->fetchColumn();
            }
        } catch (Throwable $e) {}

        $this->redirectFrontend($state, [
            'token' => $token,
            'user' => base64_encode(json_encode([
                'id' => $user['id'],
                'full_name' => $user['full_name'],
                'email' => $user['email'],
                'platform_role' => $user['platform_role'],
                'roles' => $tenantRoles,
                'company_id' => $companyId ?: null
            ]))
        ]);
    }

    private function redirectFrontend(string $state, array $params): void
    {
        $stateDecoded = json_decode(base64_decode($state), true);
        $redirectUrl = $this->sanitizeRedirectUrl($stateDecoded['redirect_to'] ?? 'http://localhost:5173');
        
        $query = http_build_query($params);
        $sep = (strpos($redirectUrl, '?') === false) ? '?' : '&';
        
        header("Location: $redirectUrl$sep$query");
        exit;
    }

    // --- Helpers ---

    private function readPayload(): array
    {
        $input = file_get_contents('php://input');
        if (!$input) return [];
        return json_decode($input, true) ?? [];
    }

    private function tableExists(string $table): bool
    {
        try {
            $stmt = $this->pdo->prepare("SHOW TABLES LIKE ?");
            $stmt->execute([$table]);
            return $stmt->rowCount() > 0;
        } catch (Throwable $e) {
            return false;
        }
    }

    private function emailExists(string $email): bool
    {
        $stmt = $this->pdo->prepare('SELECT id FROM users WHERE email LIKE :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        return (bool)$stmt->fetch();
    }

    private function generateUuid(): string
    {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }

    private function touchLastLogin(string $userId): void
    {
        try {
            // Check if column exists first? Or just try/catch
            // We assume column exists if migration ran. If not, ignore.
            $stmt = $this->pdo->prepare("UPDATE users SET last_login_at = NOW() WHERE id LIKE :id");
            $stmt->execute([':id' => $userId]);
        } catch (Throwable $e) {
            // Ignore if column doesn't exist
        }
    }

    private function recordSession(string $userId, string $token, ?string $jti = null, ?string $refreshHash = null, ?string $refreshExpiresAt = null): void
    {
        try {
            $id = $this->generateUuid();
            $ip = $_SERVER['REMOTE_ADDR'] ?? null;
            $ua = $_SERVER['HTTP_USER_AGENT'] ?? null;
            $tokenHash = hash('sha256', $token);
            $stmt = $this->pdo->prepare("
                INSERT INTO user_sessions (id, user_id, ip_address, user_agent, token_hash, jti, refresh_token_hash, refresh_expires_at, last_activity)
                VALUES (:id, :uid, :ip, :ua, :th, :jti, :rth, :rex, NOW())
            ");
            $stmt->execute([
                ':id' => $id,
                ':uid' => $userId,
                ':ip' => $ip,
                ':ua' => $ua,
                ':th' => $tokenHash,
                ':jti' => $jti,
                ':rth' => $refreshHash,
                ':rex' => $refreshExpiresAt
            ]);
        } catch (Throwable $e) {
            error_log('Session record failed: ' . $e->getMessage());
        }
    }

    public function logout(): void
    {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (!$authHeader || stripos($authHeader, 'Bearer ') !== 0) {
            Response::json(['message' => 'OK'], 200);
            return;
        }
        $token = trim(substr($authHeader, 7));
        $hash = hash('sha256', $token);
        try {
            $stmt = $this->pdo->prepare("UPDATE user_sessions SET is_active = 0 WHERE token_hash = :h");
            $stmt->execute([':h' => $hash]);
        } catch (Throwable $e) {}
        Response::json(['message' => 'Sesión cerrada'], 200);
    }

    public function refresh(): void
    {
        $payload = $this->readPayload();
        $refresh = (string)($payload['refresh_token'] ?? '');
        if ($refresh === '') {
            Response::error('Falta refresh_token', 400);
            return;
        }
        $refreshHash = hash('sha256', $refresh);
        try {
            $stmt = $this->pdo->prepare("
                SELECT us.user_id, us.refresh_expires_at, u.platform_role
                FROM user_sessions us
                JOIN users u ON u.id = us.user_id
                WHERE us.refresh_token_hash = :h AND us.is_active = 1
                LIMIT 1
            ");
            $stmt->execute([':h' => $refreshHash]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                Response::error('Refresh inválido', 401);
                return;
            }
            if (!empty($row['refresh_expires_at']) && strtotime($row['refresh_expires_at']) <= time()) {
                Response::error('Refresh expirado', 401);
                return;
            }
            $now = time();
            $ttl = (int)($this->jwt['ttl'] ?? 3600);
            $claims = [
                'iss'  => (string)($this->jwt['issuer'] ?? ''),
                'iat'  => $now,
                'nbf'  => $now,
                'exp'  => $now + $ttl,
                'sub'  => (string)$row['user_id'],
                'role' => (string)($row['platform_role'] ?? ''),
                'jti'  => $this->generateUuid(),
            ];
            $token = Auth::jwtEncode($claims, (string)$this->jwt['secret']);
            $newRefresh = $this->randomToken();
            $newRefreshHash = hash('sha256', $newRefresh);
            $newExp = (new \DateTimeImmutable('+30 days'))->format('Y-m-d H:i:s');
            $th = hash('sha256', $token);
            $stmt = $this->pdo->prepare("
                INSERT INTO user_sessions (id, user_id, ip_address, user_agent, token_hash, jti, refresh_token_hash, refresh_expires_at, last_activity)
                VALUES (UUID(), :uid, :ip, :ua, :th, :jti, :rth, :rex, NOW())
            ");
            $stmt->execute([
                ':uid' => $row['user_id'],
                ':ip' => $_SERVER['REMOTE_ADDR'] ?? null,
                ':ua' => $_SERVER['HTTP_USER_AGENT'] ?? null,
                ':th' => $th,
                ':jti' => $claims['jti'],
                ':rth' => $newRefreshHash,
                ':rex' => $newExp
            ]);
            Response::json([
                'token' => $token,
                'expires_in' => $ttl,
                'refresh_token' => $newRefresh
            ], 200);
        } catch (Throwable $e) {
            Response::error('Error al refrescar token', 500);
        }
    }

    private function isLocked(string $email, string $ip): bool
    {
        try {
            $stmt = $this->pdo->prepare("SELECT locked_until, last_attempt_at, attempts FROM login_attempts WHERE email = :e AND ip_address = :ip LIMIT 1");
            $stmt->execute([':e' => $email, ':ip' => $ip]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) return false;
            if (!empty($row['locked_until']) && strtotime($row['locked_until']) > time()) return true;
            if (!empty($row['last_attempt_at']) && (time() - strtotime($row['last_attempt_at'])) <= 900 && (int)$row['attempts'] >= 10) return true;
        } catch (\Throwable $e) {}
        return false;
    }

    private function registerFailedAttempt(string $email, string $ip): void
    {
        try {
            $stmt = $this->pdo->prepare("SELECT attempts, last_attempt_at FROM login_attempts WHERE email = :e AND ip_address = :ip LIMIT 1");
            $stmt->execute([':e' => $email, ':ip' => $ip]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                $this->pdo->prepare("INSERT INTO login_attempts (email, ip_address, attempts, last_attempt_at) VALUES (:e, :ip, 1, NOW())")->execute([':e' => $email, ':ip' => $ip]);
                return;
            }
            $attempts = (int)$row['attempts'];
            $last = strtotime($row['last_attempt_at']);
            if (time() - $last > 900) $attempts = 0;
            $attempts++;
            $lockedUntil = null;
            if ($attempts >= 5) {
                $lockedUntil = (new \DateTimeImmutable('+15 minutes'))->format('Y-m-d H:i:s');
            }
            $stmt = $this->pdo->prepare("UPDATE login_attempts SET attempts = :a, last_attempt_at = NOW(), locked_until = :lu WHERE email = :e AND ip_address = :ip");
            $stmt->execute([':a' => $attempts, ':lu' => $lockedUntil, ':e' => $email, ':ip' => $ip]);
        } catch (\Throwable $e) {}
    }

    private function resetAttempts(string $email, string $ip): void
    {
        try {
            $this->pdo->prepare("DELETE FROM login_attempts WHERE email = :e AND ip_address = :ip")->execute([':e' => $email, ':ip' => $ip]);
        } catch (\Throwable $e) {}
    }

    private function randomToken(int $bytes = 32): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }
}
