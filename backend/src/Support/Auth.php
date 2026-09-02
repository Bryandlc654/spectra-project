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

            $stmt = $pdo->prepare('SELECT id, full_name, email, status, platform_role FROM users WHERE id LIKE :id LIMIT 1');
            $stmt->execute([':id' => $claims['sub']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user || ($user['status'] ?? '') !== 'active') return;

            // Session check
            $tokenHash = hash('sha256', $token);
            try {
                $stmt = $pdo->prepare("SELECT id, is_active FROM user_sessions WHERE token_hash LIKE :hash LIMIT 1");
                $stmt->execute([':hash' => $tokenHash]);
                $session = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($session) {
                    if ($session['is_active'] == 0) return;
                    $pdo->prepare("UPDATE user_sessions SET last_activity = NOW() WHERE id LIKE :id")->execute([':id' => $session['id']]);
                }
            } catch (\Throwable $e) {}

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
            self::log('Auth failed: No bearer token found in headers: ' . json_encode($_SERVER));
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
                Response::error('Token expirado. Exp: ' . $claims['exp'] . ', Now: ' . time(), 401);
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
                WHERE u.id LIKE :id 
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
            $tokenHash = hash('sha256', $token);
            
            // Check session status
            // Note: If session table doesn't exist or row missing, we might want to fail-safe (allow).
            // But if we want security, we should probably check.
            // For now, let's only block if we FIND a revoked session (is_active = 0).
            // If we don't find it, we assume it's a legacy token or session tracking failed but token is valid.
            try {
                $stmt = $pdo->prepare("SELECT id, is_active FROM user_sessions WHERE token_hash = :hash LIMIT 1");
                $stmt->execute([':hash' => $tokenHash]);
                $session = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($session) {
                    if ($session['is_active'] == 0) {
                        self::log('Auth failed: Session revoked for hash: ' . $tokenHash);
                        Response::error('Sesión revocada', 401);
                        exit;
                    }
                    
                    // Update activity (optimistic, ignore errors)
                    // Only update if > 5 min to reduce writes? For simplicity, update always for now.
                    $pdo->exec("UPDATE user_sessions SET last_activity = NOW() WHERE id = '{$session['id']}'");
                } else {
                    self::log('Auth warning: Session not found in DB (allowing access)');
                }
            } catch (\Throwable $e) {
                // Ignore DB errors (e.g. table missing) to not break auth
                self::log('Auth warning: Session check failed: ' . $e->getMessage());
            }

            // self::log('Auth success for user: ' . $user['email']); // Uncomment for verbose logging

            self::$user = $user;
            self::checkReadOnly();
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
