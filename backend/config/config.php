<?php
return [
    'db' => [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => getenv('DB_PORT') ?: '3306',
        'database' => getenv('DB_DATABASE') ?: '',
        'username' => getenv('DB_USERNAME') ?: '',
        'password' => getenv('DB_PASSWORD') ?: '',
        'charset' => 'utf8mb4',
    ],
    'pagination' => [
        'per_page' => 25,
    ],
    'jwt' => [
        'secret' => getenv('JWT_SECRET') ?: '',
        'issuer' => getenv('JWT_ISSUER') ?: '',
        'ttl' => (int)(getenv('JWT_TTL') ?: 3600), // 1 hora
    ],

];