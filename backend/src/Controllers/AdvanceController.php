<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class AdvanceController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
        $this->ensureExtensions();
    }

    private function ensureExtensions(): void
    {
        if (\App\Support\Cache::get('salary_advance_extensions_v1') !== null) return;

        try {
            $columns = [
                'company_id' => "ALTER TABLE salary_advances ADD COLUMN company_id CHAR(36) NULL AFTER user_id",
                'decision_by_user_id' => "ALTER TABLE salary_advances ADD COLUMN decision_by_user_id CHAR(36) NULL AFTER status",
                'decision_notes' => "ALTER TABLE salary_advances ADD COLUMN decision_notes TEXT NULL AFTER decision_by_user_id",
                'decision_at' => "ALTER TABLE salary_advances ADD COLUMN decision_at DATETIME NULL AFTER decision_notes",
            ];

            foreach ($columns as $column => $sql) {
                if (!$this->columnExists('salary_advances', $column)) {
                    try {
                        $this->pdo->exec($sql);
                    } catch (\Throwable $e) { }
                }
            }

            $this->pdo->exec("
                UPDATE salary_advances sa
                JOIN (
                    SELECT user_id, MIN(company_id) AS company_id
                    FROM company_users
                    GROUP BY user_id
                ) cu ON cu.user_id = sa.user_id
                SET sa.company_id = cu.company_id
                WHERE sa.company_id IS NULL
            ");

            \App\Support\Cache::set('salary_advance_extensions_v1', time(), 86400 * 365);
        } catch (\Throwable $e) {
            error_log('[Advances] Extension migration failed: ' . $e->getMessage());
        }
    }

    private function columnExists(string $table, string $column): bool
    {
        $stmt = $this->pdo->query("SHOW COLUMNS FROM `{$table}` LIKE " . $this->pdo->quote($column));
        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    }

    private function ensureTables(): void
    {
        // Salary Advances
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS salary_advances (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                fee DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                total_repayment_amount DECIMAL(15, 2) GENERATED ALWAYS AS (amount + fee) STORED,
                repayment_date DATE NOT NULL,
                status ENUM('pending', 'approved', 'rejected', 'paid', 'overdue') DEFAULT 'pending',
                reason TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Advance Repayments
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS advance_repayments (
                id CHAR(36) PRIMARY KEY,
                advance_id CHAR(36) NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                method VARCHAR(50) DEFAULT 'manual', -- deduction, manual, bank_transfer
                transaction_ref VARCHAR(100) NULL,
                FOREIGN KEY (advance_id) REFERENCES salary_advances(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/advances
        $id = $segments[2] ?? null;

        if ($id) {
            if ($method === 'GET') {
                $this->show($id);
            } elseif ($method === 'PUT' || $method === 'PATCH') {
                $this->update($id); // E.g. approve/reject or repay
            } else {
                Response::error('Method not allowed', 405);
            }
            return;
        }

        if ($method === 'GET') {
            $this->index();
        } elseif ($method === 'POST') {
            $this->store();
        } else {
            Response::error('Method not allowed', 405);
        }
    }

    private function index(): void
    {
        $user = Auth::user();
        $role = $user['platform_role'] ?? '';
        $isPlatformManager = in_array($role, ['super_admin', 'admin', 'finance', 'support'], true);
        $companyId = $this->resolveCompanyId($user, $_GET['company_id'] ?? null);
        $isTenantAdmin = $this->isCompanyAdmin($user, $companyId);

        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;

        $where = [];
        $params = [];

        if ($isPlatformManager) {
            if ($companyId) {
                $where[] = 'sa.company_id = :company_id';
                $params[':company_id'] = $companyId;
            }
        } elseif ($isTenantAdmin && $companyId) {
            $where[] = 'sa.company_id = :company_id';
            $params[':company_id'] = $companyId;
        } else {
            $where[] = 'sa.user_id = :user_id';
            $params[':user_id'] = $user['id'];
        }

        $status = trim((string)($_GET['status'] ?? ''));
        if ($status !== '' && in_array($status, ['pending', 'approved', 'rejected', 'paid', 'overdue'], true)) {
            $where[] = 'sa.status = :status';
            $params[':status'] = $status;
        }

        $whereClause = 'WHERE ' . implode(' AND ', $where);

        $sql = "
            SELECT sa.*, u.full_name AS user_name, u.email AS user_email, c.legal_name AS company_name
            FROM salary_advances sa
            LEFT JOIN users u ON u.id = sa.user_id
            LEFT JOIN companies c ON c.id = sa.company_id
            $whereClause
            ORDER BY sa.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM salary_advances sa $whereClause");
        foreach ($params as $key => $value) {
            $countStmt->bindValue($key, $value);
        }
        $countStmt->execute();
        $total = (int)$countStmt->fetchColumn();

        Response::json([
            'data' => $items,
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => ceil($total / $limit),
            ],
        ]);
    }

    private function show(string $id): void
    {
        $user = Auth::user();

        $stmt = $this->pdo->prepare("
            SELECT sa.*, u.full_name AS user_name, u.email AS user_email, c.legal_name AS company_name
            FROM salary_advances sa
            LEFT JOIN users u ON u.id = sa.user_id
            LEFT JOIN companies c ON c.id = sa.company_id
            WHERE sa.id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$item) {
            Response::error('Advance not found', 404);
            return;
        }

        if (!$this->canAccessAdvance($user, $item)) {
            Response::error('Unauthorized', 403);
            return;
        }

        Response::json(['data' => $item]);
    }

    private function store(): void
    {
        $user = Auth::user();
        $data = json_decode(file_get_contents('php://input'), true) ?: [];

        if (empty($data['amount']) || empty($data['repayment_date'])) {
            Response::error('Amount and repayment date are required', 422);
            return;
        }

        $amount = (float)$data['amount'];
        if ($amount <= 0) {
            Response::error('El monto debe ser mayor a cero', 422);
            return;
        }

        $companyId = $this->resolveCompanyId($user);
        if (!$companyId) {
            Response::error('No se encontró una empresa asociada al usuario', 422);
            return;
        }

        $fee = $amount * 0.02;
        $id = $this->uuid();

        $stmt = $this->pdo->prepare("
            INSERT INTO salary_advances (id, user_id, company_id, amount, fee, repayment_date, status, reason)
            VALUES (:id, :uid, :cid, :amount, :fee, :date, 'pending', :reason)
        ");

        $stmt->execute([
            ':id' => $id,
            ':uid' => $user['id'],
            ':cid' => $companyId,
            ':amount' => $amount,
            ':fee' => $fee,
            ':date' => $data['repayment_date'],
            ':reason' => $data['reason'] ?? null,
        ]);

        Response::json(['message' => 'Advance requested successfully', 'id' => $id], 201);
    }

    private function update(string $id): void
    {
        $user = Auth::user();
        $role = $user['platform_role'] ?? '';
        $isPlatformManager = in_array($role, ['super_admin', 'admin', 'finance'], true);

        $stmt = $this->pdo->prepare("SELECT * FROM salary_advances WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $advance = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$advance) {
            Response::error('Advance not found', 404);
            return;
        }

        $companyId = $advance['company_id'] ?: $this->resolveCompanyId($user);
        $isTenantAdmin = $this->isCompanyAdmin($user, $companyId);

        if (!$isPlatformManager && !$isTenantAdmin) {
            Response::error('Unauthorized', 403);
            return;
        }

        if (!$isPlatformManager && $advance['company_id'] && $advance['company_id'] !== $companyId) {
            Response::error('Unauthorized', 403);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $status = $data['status'] ?? null;

        if (!$status || !in_array($status, ['approved', 'rejected', 'paid', 'overdue'], true)) {
            Response::error('Invalid status', 422);
            return;
        }

        $notes = trim((string)($data['decision_notes'] ?? ''));

        $stmt = $this->pdo->prepare("
            UPDATE salary_advances
            SET status = :status,
                decision_by_user_id = :decided_by,
                decision_notes = :notes,
                decision_at = NOW()
            WHERE id = :id
        ");
        $stmt->execute([
            ':status' => $status,
            ':decided_by' => $user['id'],
            ':notes' => $notes !== '' ? $notes : null,
            ':id' => $id,
        ]);

        Response::json(['message' => 'Advance updated']);
    }

    private function resolveCompanyId(array $user, ?string $requestedCompanyId = null): ?string
    {
        $role = $user['platform_role'] ?? '';
        if ($requestedCompanyId && in_array($role, ['super_admin', 'admin', 'finance', 'support'], true)) {
            return $requestedCompanyId;
        }

        if (!empty($user['company_id'])) {
            return (string)$user['company_id'];
        }

        if (empty($user['id'])) return null;

        $stmt = $this->pdo->prepare("
            SELECT company_id
            FROM company_users
            WHERE user_id = :uid AND status = 'active'
            ORDER BY active_company DESC, created_at DESC
            LIMIT 1
        ");
        $stmt->execute([':uid' => $user['id']]);
        $companyId = $stmt->fetchColumn();

        if (!$companyId) {
            $stmt = $this->pdo->prepare("SELECT company_id FROM company_users WHERE user_id = :uid LIMIT 1");
            $stmt->execute([':uid' => $user['id']]);
            $companyId = $stmt->fetchColumn();
        }

        return $companyId ?: null;
    }

    private function isCompanyAdmin(array $user, ?string $companyId): bool
    {
        if (!$companyId) return false;
        if (($user['platform_role'] ?? '') === 'company_admin') return true;
        if (in_array($user['platform_role'] ?? '', ['super_admin', 'admin', 'finance'], true)) return true;
        if (empty($user['id'])) return false;

        try {
            $stmt = $this->pdo->prepare("
                SELECT 1
                FROM company_users cu
                JOIN user_roles ur ON ur.company_user_id = cu.id
                JOIN roles r ON r.id = ur.role_id
                WHERE cu.user_id = :uid
                  AND cu.company_id = :cid
                  AND cu.status = 'active'
                  AND LOWER(r.name) IN ('admin', 'company admin', 'company_admin')
                LIMIT 1
            ");
            $stmt->execute([':uid' => $user['id'], ':cid' => $companyId]);
            return (bool)$stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function canAccessAdvance(array $user, array $advance): bool
    {
        if (($advance['user_id'] ?? null) === ($user['id'] ?? null)) return true;
        if (in_array($user['platform_role'] ?? '', ['super_admin', 'admin', 'finance', 'support'], true)) return true;

        $companyId = $advance['company_id'] ?? $this->resolveCompanyId($user);
        return $this->isCompanyAdmin($user, $companyId) && $companyId === ($advance['company_id'] ?? null);
    }

    private function uuid(): string
    {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
}
