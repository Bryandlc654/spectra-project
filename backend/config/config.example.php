<?php
return [
    'db' => [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => getenv('DB_PORT') ?: '3306',
        'database' => getenv('DB_DATABASE') ?: 'spectra_db',
        'username' => getenv('DB_USERNAME') ?: 'root',
        'password' => getenv('DB_PASSWORD') ?: '',
        'charset' => 'utf8mb4',
    ],
    'pagination' => [
        'per_page' => 25,
    ],
    'jwt' => [
        // Obligatorio, mínimo 32 caracteres. Generar con: php -r "echo bin2hex(random_bytes(32));"
        'secret' => getenv('JWT_SECRET') ?: throw new RuntimeException('JWT_SECRET no configurado'),
        'issuer' => getenv('JWT_ISSUER') ?: 'your-app-url',
        'ttl' => (int)(getenv('JWT_TTL') ?: 3600),
    ],
];
