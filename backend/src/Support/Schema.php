<?php

namespace App\Support;

use PDO;

class Schema
{
    private const CACHE_KEY = 'schema_migrated_at';
    private const DB_KEY = 'schema_migrated_at';
    private const CACHE_TTL = 86400;
    private const KYB_COLUMN_CACHE_KEY = 'schema_company_kyb_required';
    private const KYB_STATUS_CACHE_KEY = 'schema_kyb_status_enum';

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

    /**
     * Adds companies.kyb_required on databases created before this feature.
     * Existing companies default to FALSE so enabling the gate does not lock
     * accounts that were already operating.
     */
    public static function ensureCompanyKybColumn(PDO $pdo): void
    {
        if (Cache::get(self::KYB_COLUMN_CACHE_KEY) === '1') return;

        try {
            $stmt = $pdo->query("SHOW COLUMNS FROM companies LIKE 'kyb_required'");
            $exists = (bool)$stmt->fetch(PDO::FETCH_ASSOC);

            if (!$exists) {
                $pdo->exec("ALTER TABLE companies ADD COLUMN kyb_required BOOLEAN DEFAULT TRUE AFTER read_only_mode");
                // Backfill: companies created before this feature stay operational.
                $pdo->exec("UPDATE companies SET kyb_required = FALSE");
            }

            Cache::set(self::KYB_COLUMN_CACHE_KEY, '1', self::CACHE_TTL);
        } catch (\Throwable $e) {
            // Fresh installs create the table (with the column) in TenantController.
        }
    }

    /**
     * Alinea el ENUM de kyb_requests.status en bases creadas con el esquema antiguo
     * (pending/approved/rejected) y normaliza estados vacíos.
     */
    public static function ensureKybStatusEnum(PDO $pdo): void
    {
        if (Cache::get(self::KYB_STATUS_CACHE_KEY) === '1') return;

        try {
            $col = $pdo->query("SHOW COLUMNS FROM kyb_requests LIKE 'status'")->fetch(PDO::FETCH_ASSOC);
            if (!$col) return; // La tabla la crea el controlador que llama.

            $type = (string)($col['Type'] ?? '');
            if (strpos($type, 'pending_review') === false) {
                // 1) Añadir los valores nuevos sin perder los antiguos.
                $pdo->exec("ALTER TABLE kyb_requests MODIFY status ENUM('pending','approved','rejected','not_started','pending_review','more_info_required') NOT NULL DEFAULT 'pending'");
                // 2) Normalizar valores vacíos/inválidos.
                $pdo->exec("UPDATE kyb_requests SET status = CASE WHEN submitted_at IS NOT NULL THEN 'pending_review' ELSE 'not_started' END WHERE status = '' OR status IS NULL");
                // 3) 'pending' legacy equivale a pendiente de revisión.
                $pdo->exec("UPDATE kyb_requests SET status = 'pending_review' WHERE status = 'pending'");
                // 4) Esquema final sin el valor legacy.
                $pdo->exec("ALTER TABLE kyb_requests MODIFY status ENUM('not_started','pending_review','approved','rejected','more_info_required') NOT NULL DEFAULT 'not_started'");
            }

            Cache::set(self::KYB_STATUS_CACHE_KEY, '1', self::CACHE_TTL);
        } catch (\Throwable $e) {
            // No cachear: se reintenta en la siguiente petición.
        }
    }

    public static function markMigrated(PDO $pdo): void    {
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