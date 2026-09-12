<?php

namespace App\Support;

use PDO;

class Schema
{
    private const CACHE_KEY = 'schema_migrated_at';
    private const DB_KEY = 'schema_migrated_at';
    private const CACHE_TTL = 86400;

    public static function isMigrated(?PDO $pdo = null): bool
    {
        $ts = Cache::get(self::CACHE_KEY);

        if ($ts !== null && (int)$ts > 0) {
            return true;
        }

        if ($pdo !== null) {
            try {
                $stmt = $pdo->prepare(
                    "SELECT setting_value FROM system_settings WHERE setting_key = :k LIMIT 1"
                );
                $stmt->execute([':k' => self::DB_KEY]);
                $value = $stmt->fetchColumn();

                if ($value !== false && (int)$value > 0) {
                    Cache::set(self::CACHE_KEY, (int)$value, self::CACHE_TTL);
                    return true;
                }
            } catch (\Throwable $e) {
                // system_settings may not exist yet in a fresh database
            }
        }

        return false;
    }

    public static function needsMigration(?PDO $pdo = null): bool
    {
        return !self::isMigrated($pdo);
    }

    public static function markMigrated(PDO $pdo): void
    {
        $now = time();
        Cache::set(self::CACHE_KEY, $now, self::CACHE_TTL * 30);

        try {
            $stmt = $pdo->prepare(
                "INSERT INTO system_settings (setting_key, setting_value, created_at, updated_at)
                 VALUES (:k, :v, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE setting_value = :v2, updated_at = NOW()"
            );
            $stmt->execute([
                ':k' => self::DB_KEY,
                ':v' => (string)$now,
                ':v2' => (string)$now,
            ]);
        } catch (\Throwable $e) {
            // Fresh database without system_settings yet: the file marker is the source of truth
        }
    }
}