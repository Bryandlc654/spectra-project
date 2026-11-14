<?php
// El secreto JWT debe venir SIEMPRE del entorno (.env o variables del proceso).
// Sin valor por defecto: un secreto versionado permite falsificar tokens.
$jwtSecret = (string)($_ENV['JWT_SECRET'] ?? $_SERVER['JWT_SECRET'] ?? (getenv('JWT_SECRET') ?: ''));
if (strlen($jwtSecret) < 32) {
    throw new RuntimeException('JWT_SECRET no configurado o demasiado corto (mínimo 32 caracteres). Defínelo en backend/.env');
}

return [
    'db' => [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => getenv('DB_PORT') ?: '3306',
        'database' => getenv('DB_DATABASE') ?: 'core_spectra',
        'username' => getenv('DB_USERNAME') ?: 'manage_spect',
        'password' => getenv('DB_PASSWORD') ?: '',
        'charset' => 'utf8mb4',
    ],
    'pagination' => [
        'per_page' => 25,
    ],
    'jwt' => [
        'secret' => $jwtSecret,
        'issuer' => getenv('JWT_ISSUER') ?: 'apispectraerp.nextboostperu.com',
        'ttl' => (int)(getenv('JWT_TTL') ?: 3600), // 1 hora
    ],


];



