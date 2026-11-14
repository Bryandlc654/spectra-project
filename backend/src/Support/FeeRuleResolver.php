<?php

namespace App\Support;

use PDO;

class FeeRuleResolver
{
    public static function ensureSchema(PDO $pdo): void
    {
        if (Cache::get('company_fee_rules_extensions_v1') !== null) return;

        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS company_fee_rules (
                    id CHAR(36) PRIMARY KEY,
                    company_id CHAR(36) NOT NULL,
                    type VARCHAR(32) NOT NULL,
                    value DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                    currency_id INT UNSIGNED NULL,
                    active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at DATETIME NULL,
                    INDEX idx_cfr_company (company_id),
                    INDEX idx_cfr_active (active),
                    INDEX idx_cfr_type (type)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            $columns = [
                'position' => "ALTER TABLE company_fee_rules ADD COLUMN position VARCHAR(150) NULL AFTER type",
                'min_collaborators' => "ALTER TABLE company_fee_rules ADD COLUMN min_collaborators INT NOT NULL DEFAULT 0 AFTER position",
                'max_collaborators' => "ALTER TABLE company_fee_rules ADD COLUMN max_collaborators INT NULL AFTER min_collaborators",
                'priority' => "ALTER TABLE company_fee_rules ADD COLUMN priority INT NOT NULL DEFAULT 0 AFTER max_collaborators",
            ];

            foreach ($columns as $column => $sql) {
                $stmt = $pdo->query("SHOW COLUMNS FROM company_fee_rules LIKE " . $pdo->quote($column));
                if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
                    try {
                        $pdo->exec($sql);
                    } catch (\Throwable $e) { }
                }
            }

            Cache::set('company_fee_rules_extensions_v1', time(), 86400 * 365);
        } catch (\Throwable $e) {
            error_log('[FeeRuleResolver] Schema migration failed: ' . $e->getMessage());
        }
    }

    public static function activeCollaboratorCount(PDO $pdo, string $companyId, ?string $periodStart = null, ?string $periodEnd = null): int
    {
        $sql = "
            SELECT COUNT(DISTINCT c.freelancer_id) AS cnt
            FROM contracts c
            WHERE c.company_id = :cid
              AND c.status = 'active'
        ";
        $params = [':cid' => $companyId];

        if ($periodStart !== null && $periodEnd !== null) {
            $sql .= " AND (c.start_date IS NULL OR c.start_date <= :pend)";
            $sql .= " AND (c.end_date IS NULL OR c.end_date >= :pstart)";
            $params[':pend'] = $periodEnd;
            $params[':pstart'] = $periodStart;
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return (int)$stmt->fetchColumn();
    }

    public static function hasContractFeeRules(PDO $pdo, string $companyId): bool
    {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) FROM company_fee_rules
            WHERE company_id = :cid AND type = 'contract_fee' AND active = 1 AND deleted_at IS NULL
        ");
        try {
            $stmt->execute([':cid' => $companyId]);
            return (int)$stmt->fetchColumn() > 0;
        } catch (\Throwable $e) {
            try {
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM company_fee_rules WHERE company_id = :cid AND type = 'contract_fee' AND active = 1");
                $stmt->execute([':cid' => $companyId]);
                return (int)$stmt->fetchColumn() > 0;
            } catch (\Throwable $x) {
                return false;
            }
        }
    }

    public static function resolveContractFee(PDO $pdo, string $companyId, string $position, ?int $collaboratorCount = null): ?array
    {
        if ($collaboratorCount === null) {
            $collaboratorCount = self::activeCollaboratorCount($pdo, $companyId);
        }

        $sql = "
            SELECT * FROM company_fee_rules
            WHERE company_id = :cid
              AND type = 'contract_fee'
              AND active = 1
              AND (min_collaborators IS NULL OR min_collaborators <= :collab_min)
              AND (max_collaborators IS NULL OR max_collaborators >= :collab_max)
        ";
        try {
            $sql .= " AND deleted_at IS NULL";
        } catch (\Throwable $e) { }

        $stmt = $pdo->prepare($sql);
        try {
            $stmt->execute([':cid' => $companyId, ':collab_min' => $collaboratorCount, ':collab_max' => $collaboratorCount]);
        } catch (\Throwable $e) {
            $stmt = $pdo->prepare("
                SELECT * FROM company_fee_rules
                WHERE company_id = :cid
                  AND type = 'contract_fee'
                  AND active = 1
                  AND (min_collaborators IS NULL OR min_collaborators <= :collab_min)
                  AND (max_collaborators IS NULL OR max_collaborators >= :collab_max)
            ");
            $stmt->execute([':cid' => $companyId, ':collab_min' => $collaboratorCount, ':collab_max' => $collaboratorCount]);
        }

        $rules = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        if (!$rules) return null;

        $positionNorm = self::normalize($position);
        $matches = [];

        foreach ($rules as $rule) {
            $rulePosition = trim((string)($rule['position'] ?? ''));
            $rulePositionNorm = self::normalize($rulePosition);
            if ($rulePositionNorm !== '' && $rulePositionNorm !== $positionNorm) {
                continue;
            }

            $min = (int)($rule['min_collaborators'] ?? 0);
            $max = $rule['max_collaborators'] !== null ? (int)$rule['max_collaborators'] : null;
            $width = $max === null ? PHP_INT_MAX : max(0, $max - $min);

            $matches[] = [
                'rule' => $rule,
                'exact_position' => $rulePositionNorm !== '' ? 1 : 0,
                'range_width' => $width,
                'priority' => (int)($rule['priority'] ?? 0),
            ];
        }

        if (!$matches) return null;

        usort($matches, function (array $a, array $b): int {
            if ($a['exact_position'] !== $b['exact_position']) {
                return $b['exact_position'] <=> $a['exact_position'];
            }
            if ($a['range_width'] !== $b['range_width']) {
                return $a['range_width'] <=> $b['range_width'];
            }
            if ($a['priority'] !== $b['priority']) {
                return $b['priority'] <=> $a['priority'];
            }
            return strcmp((string)($b['rule']['updated_at'] ?? ''), (string)($a['rule']['updated_at'] ?? ''));
        });

        return $matches[0]['rule'];
    }

    private static function normalize(string $value): string
    {
        $value = trim(mb_strtolower($value));
        return preg_replace('/\s+/', ' ', $value) ?? $value;
    }
}
