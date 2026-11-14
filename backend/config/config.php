<?php
if (!function_exists('env_get')) {
    function env_get($key, $default = '') {
        return $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key) ?: $default;
    }
}

// El secreto JWT debe venir SIEMPRE del entorno (.env o variables del proceso).
// Sin valor por defecto: un secreto versionado permite falsificar tokens.
$jwtSecret = (string)env_get('JWT_SECRET', '');
if (strlen($jwtSecret) < 32) {
    throw new RuntimeException('JWT_SECRET no configurado o demasiado corto (mínimo 32 caracteres). Defínelo en backend/.env');
}

return [
    'db' => [
        'host' => env_get('DB_HOST', '127.0.0.1'),
        'port' => env_get('DB_PORT', '3306'),
        'database' => env_get('DB_DATABASE', 'core_spectra'),
        'username' => env_get('DB_USERNAME', 'manage_spect'),
        'password' => env_get('DB_PASSWORD', ''),
        'charset' => 'utf8mb4',
    ],
    'pagination' => [
        'per_page' => 25,
    ],
    'jwt' => [
        'secret' => $jwtSecret,
        'issuer' => env_get('JWT_ISSUER', 'apispectraerp.nextboostperu.com'),
        'ttl' => (int)env_get('JWT_TTL', 3600), // 1 hora
    ],



];



