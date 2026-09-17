<?php

namespace App;

use PDO;

class Database
{
    private static ?PDO $connection = null;
    private PDO $pdo;

    private array $config;

    public function __construct(array $db)
    {
        $this->config = $db;
    }

    public function pdo(): PDO
    {
        if (self::$connection === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=%s',
                $this->config['host'],
                $this->config['port'],
                $this->config['database'],
                $this->config['charset'] ?? 'utf8mb4'
            );

            $this->pdo = new PDO($dsn, $this->config['username'], $this->config['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_TIMEOUT => 10,
            ]);
            
            self::$connection = $this->pdo;
        } else {
            $this->pdo = self::$connection;
        }

        return $this->pdo;
    }
}
