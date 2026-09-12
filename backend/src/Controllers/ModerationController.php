<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use App\Support\AuditLogger;
use PDO;

class ModerationController
{
    private PDO $pdo;
    private AuditLogger $audit;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->audit = new AuditLogger();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS moderation_reports (
                id INT AUTO_INCREMENT PRIMARY KEY,
                target_type ENUM('user', 'company', 'content') NOT NULL,
                target_id VARCHAR(36) NOT NULL,
                reporter_id VARCHAR(36) NULL,
                reason TEXT NOT NULL,
                status ENUM('open', 'investigating', 'resolved', 'dismissed') DEFAULT 'open',
                action_taken VARCHAR(50) NULL,
                admin_notes TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (status),
                INDEX (target_type, target_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(string $method, ?string $id = null): void
    {
        $user = Auth::user();
        if (!$user) {
            Response::error('No autenticado', 401);
            return;
        }

        // Only Support and Super Admin can manage moderation
        // But maybe regular users can create reports? For now let's assume this endpoint is for management.
        // If we want creation, we'd check method POST and allow all authenticated users.
        
        $isSupport = in_array($user['platform_role'] ?? '', ['super_admin', 'support']);

        switch ($method) {
            case 'GET':
                if (!$isSupport) {
                    Response::error('Acceso denegado', 403);
                    return;
                }
                $this->index();
                break;
            case 'POST':
                // Allow creation by any user? Or just testing for now?
                // Let's allow any user to create a report
                $this->store($user['id']);
                break;
            case 'PUT':
            case 'PATCH':
                if (!$isSupport) {
                    Response::error('Acceso denegado', 403);
                    return;
                }
                if ($id) $this->update($id, $user['id']);
                else Response::error('ID required', 400);
                break;
            default:
                Response::error('Method not allowed', 405);
        }
    }

    private function index(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(1, min(100, (int)($_GET['limit'] ?? 10)));
        $status = $_GET['status'] ?? null;
        $offset = ($page - 1) * $perPage;

        $where = [];
        $params = [];

        if ($status) {
            $where[] = "status = :status";
            $params[':status'] = $status;
        }

        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        // Count
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM moderation_reports $whereSql");
        $stmt->execute($params);
        $total = (int)$stmt->fetchColumn();

        // Fetch
        // We might want to join with users/companies to get names, but since target_type varies, it's complex.
        // For simplicity, we'll just fetch raw reports and maybe fetch names if needed or let frontend handle it/lazy load.
        // OR: we can do left joins on both tables if we know the schema.
        // Let's try to get names if possible.
        
        $sql = "
            SELECT r.*,
                   u.full_name as reporter_name,
                   CASE 
                       WHEN r.target_type = 'user' THEN tu.full_name
                       WHEN r.target_type = 'company' THEN tc.legal_name
                       ELSE r.target_id
                   END as target_name
            FROM moderation_reports r
            LEFT JOIN users u ON r.reporter_id = u.id
            LEFT JOIN users tu ON r.target_type = 'user' AND r.target_id = tu.id
            LEFT JOIN companies tc ON r.target_type = 'company' AND r.target_id = tc.id
            $whereSql
            ORDER BY r.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $data,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage)
            ]
        ]);
    }

    private function store(string $reporterId): void
    {
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (empty($input['target_type']) || empty($input['target_id']) || empty($input['reason'])) {
            Response::error('Faltan campos obligatorios', 400);
            return;
        }

        $stmt = $this->pdo->prepare("
            INSERT INTO moderation_reports (target_type, target_id, reporter_id, reason, status)
            VALUES (:type, :tid, :rid, :reason, 'open')
        ");
        
        $stmt->execute([
            ':type' => $input['target_type'],
            ':tid' => $input['target_id'],
            ':rid' => $reporterId,
            ':reason' => $input['reason']
        ]);
        
        $reportId = $this->pdo->lastInsertId();

        $this->audit->log('moderation_report_created', 'moderation_report', $reportId, [
            'target_type' => $input['target_type'],
            'target_id' => $input['target_id'],
            'reason' => $input['reason']
        ]);

        Response::json(['message' => 'Reporte creado', 'id' => $reportId], 201);
    }

    private function update(string $id, string $adminId): void
    {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $fields = [];
        $params = [':id' => $id];

        if (isset($input['status'])) {
            $fields[] = "status = :status";
            $params[':status'] = $input['status'];
        }
        if (isset($input['action_taken'])) {
            $fields[] = "action_taken = :action";
            $params[':action'] = $input['action_taken'];
        }
        if (isset($input['admin_notes'])) {
            $fields[] = "admin_notes = :notes";
            $params[':notes'] = $input['admin_notes'];
        }

        if (empty($fields)) {
            Response::error('No hay campos para actualizar', 400);
            return;
        }

        $sql = "UPDATE moderation_reports SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        
        $this->audit->log('moderation_report_updated', 'moderation_report', $id, [
            'admin_id' => $adminId,
            'changes' => $input
        ]);

        // Execute actual logic if action_taken implies something (e.g. block user)
        // This is where "business logic" for blocking would go.
        if (isset($input['action_taken'])) {
            $this->performModerationAction($id, $input['action_taken']);
        }

        Response::json(['message' => 'Reporte actualizado']);
    }

    private function performModerationAction(string $reportId, string $action): void
    {
        // Fetch report details
        $stmt = $this->pdo->prepare("SELECT * FROM moderation_reports WHERE id = ?");
        $stmt->execute([$reportId]);
        $report = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$report) return;

        if ($action === 'block_user' && $report['target_type'] === 'user') {
            // Update user status
            // Assuming users table has a status or suspended_at
            // Let's check users table schema later. For now, try to update status.
            try {
                // Check if 'status' column exists or use 'suspended_at'
                // Assuming 'status' = 'active' | 'suspended'
                $this->pdo->prepare("UPDATE users SET status = 'locked' WHERE id = ?")->execute([$report['target_id']]);
                // Invalidate sessions
                $this->pdo->prepare("UPDATE user_sessions SET is_active = 0 WHERE user_id = ?")->execute([$report['target_id']]);
            } catch (\Exception $e) {
                // log error
            }
        } elseif ($action === 'block_company' && $report['target_type'] === 'company') {
             try {
                $this->pdo->prepare("UPDATE companies SET status = 'suspended' WHERE id = ?")->execute([$report['target_id']]);
            } catch (\Exception $e) {
                // log error
            }
        }
    }
}
