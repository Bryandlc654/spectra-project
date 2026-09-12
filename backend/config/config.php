<?php
return [
    'db' => [
        'host' => getenv('DB_HOST') ?: 'srv1067.hstgr.io',
        'port' => getenv('DB_PORT') ?: '3306',
        'database' => getenv('DB_DATABASE') ?: 'u560058480_spectrabderp',
        'username' => getenv('DB_USERNAME') ?: 'u560058480_adminspectra',
        'password' => getenv('DB_PASSWORD') ?: 'c#6;+sEWK',
        'charset' => 'utf8mb4',
    ],
    'pagination' => [
        'per_page' => 25,
    ],
    'jwt' => [
        'secret' => getenv('JWT_SECRET') ?: 'mP9$Kf7Z!2QwL@E8xR#T4YHnV6A%S^C*JdB1u0e',
        'issuer' => getenv('JWT_ISSUER') ?: 'apispectraerp.nextboostperu.com',
        'ttl' => (int)(getenv('JWT_TTL') ?: 3600), // 1 hora
    ],

];
