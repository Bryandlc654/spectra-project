<?php

namespace App\Support;

use PDO;

class Auth
{
    private static ?array $user = null;

    public static function user(): ?array
    {
        return self::$user;
    }

    public static function userId(): ?string
    {
        return self::$user['id'] ?? null;
    }

    public static function attempt(PDO $pdo, array $jwtConfig): void
    {
        $token = self::bearerToken();
        if (!$token) return;

        try {
            $claims = self::jwtDecode($token, $jwtConfig['secret']);

            if (isset($claims['exp']) && time() >= (int)$claims['exp']) return;
            if (isset($claims['iss']) && $claims['iss'] !== ($jwtConfig['issuer'] ?? null)) return;

            $stmt = $pdo->prepare('SELECT id, full_name, email, status, platform_role FROM users WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => $claims['sub']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user || ($user['status'] ?? '') !== 'active') return;

            // Session check (fail-closed): sin sesión activa registrada -> anónimo
            $session = self::activeSession($pdo, $token);
            if ($session === null) return;
            self::bumpActivity($pdo, $session);

            self::$user = $user;
            self::checkReadOnly();
        } catch (\Throwable $e) {
            // Ignore
        }
    }

    public static function log(string $msg): void
    {
        try {
            $file = __DIR__ . '/../../storage/logs/auth-debug.log';
            $time = date('Y-m-d H:i:s');
            file_put_contents($file, "[$time] $msg" . PHP_EOL, FILE_APPEND);
        } catch (\Throwable $e) {}
    }

    public static function require(PDO $pdo, array $jwtConfig): void
    {
        $token = self::bearerToken();
        if (!$token) {
            // No volcar $_SERVER: contiene variables de entorno (secretos de BD, SMTP, etc.)
            self::log('Auth failed: No bearer token. ' . ($_SERVER['REQUEST_METHOD'] ?? '-') . ' '
                . ($_SERVER['REQUEST_URI'] ?? '-') . ' from ' . ($_SERVER['REMOTE_ADDR'] ?? '-'));
            Response::error('No autenticado', 401);
            exit;
        }

        try {
            $claims = self::jwtDecode($token, $jwtConfig['secret']);

            // Validaciones mínimas
            if (!isset($claims['sub']) || !is_string($claims['sub'])) {
                self::log('Auth failed: Invalid sub in claims');
                Response::error('Token inválido (sub)', 401);
                exit;
            }
            if (isset($claims['iss']) && $claims['iss'] !== ($jwtConfig['issuer'] ?? null)) {
                self::log('Auth failed: Issuer mismatch. Expected: ' . ($jwtConfig['issuer'] ?? 'null') . ', Got: ' . $claims['iss']);
                Response::error('Token inválido (iss)', 401);
                exit;
            }
            if (isset($claims['exp']) && time() >= (int)$claims['exp']) {
                self::log('Auth failed: Token expired. Exp: ' . $claims['exp'] . ', Now: ' . time());
                Response::error('Token expirado', 401);
                exit;
            }

            // Cargar usuario desde BD con info de empresa
            $stmt = $pdo->prepare('
                SELECT u.id, u.full_name, u.email, u.status, u.platform_role, u.global_permissions,
                       c.id as company_id, c.status as company_status,
                       cs.read_only_mode
                FROM users u
                LEFT JOIN company_users cu ON cu.user_id = u.id AND cu.deleted_at IS NULL
                LEFT JOIN companies c ON c.id = cu.company_id AND c.deleted_at IS NULL
                LEFT JOIN company_settings cs ON cs.company_id = c.id
                WHERE u.id = :id 
                LIMIT 1
            ');
            $stmt->execute([':id' => $claims['sub']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                self::log('Auth failed: User not found in DB for ID: ' . $claims['sub']);
                Response::error('No autenticado', 401);
                exit;
            }
            if (($user['status'] ?? '') !== 'active') {
                self::log('Auth failed: User inactive: ' . $user['email']);
                Response::error('La cuenta no está activa', 403);
                exit;
            }

            // Suspended Company Check
            // Allow super_admin to access even if linked to a suspended company (unlikely but safe)
            $isSuperAdmin = in_array($user['platform_role'] ?? '', ['super_admin', 'admin']);
            if (!$isSuperAdmin && ($user['company_status'] ?? '') === 'suspended') {
                Response::error('La empresa está suspendida. Contacte soporte.', 403);
                exit;
            }

            // Validar sesión en base de datos (revocación y tracking)
            // Calculamos el hash del token para buscar la sesión
            // Fail-closed: el token solo vale si tiene una sesión ACTIVA registrada
            // (login/refresh siempre la crean). Así cerrar sesión o revocar desde
            // Seguridad invalida el token de inmediato. Si la consulta falla, se deniega.
            $session = self::activeSession($pdo, $token);
            if ($session === null) {
                self::log('Auth failed: session missing, revoked or check failed');
                Response::error('Sesión no válida o revocada', 401);
                exit;
            }
            // Update activity (throttled to at most once every 5 minutes per session)
            self::bumpActivity($pdo, $session);

            // self::log('Auth success for user: ' . $user['email']); // Uncomment for verbose logging

            self::$user = $user;
            self::checkReadOnly();

            // Gate central de módulos por rol (matriz de la plataforma)
            ModuleAccess::guard($pdo);
        } catch (\Throwable $e) {
            self::log('Auth Exception: ' . $e->getMessage());
            Response::error('Error de autenticación', 401);
            exit;
        }
    }

    public static function checkReadOnly(): void
    {
        $user = self::user();
        if (!$user) return;

        // Allow Super Admin
        if (in_array($user['platform_role'] ?? '', ['super_admin', 'admin'])) return;

        // Check Read Only
        if (!empty($user['read_only_mode'])) {
             $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
             if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'])) {
                 Response::error('La empresa está en modo de solo lectura.', 403);
                 exit;
             }
        }
    }

    private static function bumpActivity(PDO $pdo, array $session): void
    {
        try {
            // Throttle: solo escribir como máximo una vez cada 5 minutos por sesión
            $last = $session['last_activity'] ?? null;
            if ($last !== null) {
                $ts = strtotime((string)$last);
                if ($ts !== false && time() - $ts < 300) return;
            }
            $pdo->prepare("UPDATE user_sessions SET last_activity = NOW() WHERE id = :id")
                ->execute([':id' => $session['id']]);
        } catch (\Throwable $e) {}
    }

    /**
     * Devuelve la sesión activa asociada al token, o null si no existe, está
     * revocada o la consulta falla (fail-closed). Antes se aceptaba cualquier
     * token sin sesión y se le creaba una al vuelo, lo que impedía revocar.
     */
    private static function activeSession(PDO $pdo, string $token): ?array
    {
        try {
            $stmt = $pdo->prepare("SELECT id, last_activity, is_active FROM user_sessions WHERE token_hash = :hash LIMIT 1");
            $stmt->execute([':hash' => hash('sha256', $token)]);
            $session = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$session || (int)($session['is_active'] ?? 0) !== 1) return null;
            return $session;
        } catch (\Throwable $e) {
            self::log('Auth failed: session check error: ' . $e->getMessage());
            return null;
        }
    }

    private static function uuid4(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    private static function bearerToken(): ?string
    {
        $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        
        // Try apache_request_headers if available (for some PHP-FPM/CGI setups)
        if (!$h && function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            // Headers might be case-insensitive or mixed case
            $h = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        }

        if (!$h || stripos($h, 'Bearer ') !== 0) return null;
        return trim(substr($h, 7));
    }

    public static function jwtEncode(array $claims, string $secret): string
    {
        $header = ['alg' => 'HS256', 'typ' => 'JWT'];
        $segments = [
            self::b64url(json_encode($header, JSON_UNESCAPED_SLASHES)),
            self::b64url(json_encode($claims, JSON_UNESCAPED_SLASHES)),
        ];
        $signingInput = implode('.', $segments);
        $sig = hash_hmac('sha256', $signingInput, $secret, true);
        $segments[] = self::b64url($sig);
        return implode('.', $segments);
    }

    public static function jwtDecode(string $jwt, string $secret): array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            throw new \RuntimeException('JWT inválido (partes)');
        }

        [$h64, $p64, $s64] = $parts;

        $header = json_decode(self::b64url_decode($h64), true);
        if (!is_array($header) || ($header['alg'] ?? '') !== 'HS256') {
            throw new \RuntimeException('JWT inválido (alg)');
        }

        $payload = json_decode(self::b64url_decode($p64), true);
        if (!is_array($payload)) {
            throw new \RuntimeException('JWT inválido (payload)');
        }

        $sig = self::b64url_decode_raw($s64);
        $expected = hash_hmac('sha256', $h64 . '.' . $p64, $secret, true);

        if (!hash_equals($expected, $sig)) {
            throw new \RuntimeException('JWT inválido (firma)');
        }

        return $payload;
    }

    private static function b64url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function b64url_decode(string $data): string
    {
        $raw = self::b64url_decode_raw($data);
        return $raw;
    }

    private static function b64url_decode_raw(string $data): string
    {
        $data = strtr($data, '-_', '+/');
        $pad = strlen($data) % 4;
        if ($pad) $data .= str_repeat('=', 4 - $pad);
        $decoded = base64_decode($data, true);
        if ($decoded === false) {
            throw new \RuntimeException('Base64 inválido');
        }
        return $decoded;
    }
}
