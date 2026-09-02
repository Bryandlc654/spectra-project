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
        'secret' => getenv('JWT_SECRET') ?: 'your-secret-key-change-me',
        'issuer' => getenv('JWT_ISSUER') ?: 'your-app-url',
        'ttl' => (int)(getenv('JWT_TTL') ?: 3600),
    ],
];
