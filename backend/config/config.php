<?php
return [
    'db' => [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => getenv('DB_PORT') ?: '3306',
        'database' => getenv('DB_DATABASE') ?: 'core_spectra',
        'username' => getenv('DB_USERNAME') ?: 'manage_spect_usr',
        'password' => getenv('DB_PASSWORD') ?: 'admin@123',
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



