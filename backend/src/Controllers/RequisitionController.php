<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;
use Exception;

class RequisitionController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function getCompanyId(): ?string
    {
        $companyId = $_GET['company_id'] ?? null;
        if ($companyId) return $companyId;

        $userId = Auth::userId();
        if (!$userId) return null;

        $stmt = $this->pdo->prepare("SELECT company_id FROM company_users WHERE user_id LIKE :uid LIMIT 1");
        $stmt->execute([':uid' => $userId]);
        return $stmt->fetchColumn() ?: null;
    }

    public function handle(array $segments, string $method): void
    {
        $id = $segments[2] ?? null;
        $action = $segments[3] ?? null;

        if ($id && $action === 'approve') {
            if ($method === 'POST') $this->handleApproval($id);
            else Response::error('Method not allowed', 405);
            return;
        }

        if ($id && ($action === 'create-po' || $action === 'emit-po')) {
            if ($method === 'POST') $this->emitPO($id);
            else Response::error('Method not allowed', 405);
            return;
        }

        if ($id && ($action === 'confirm-grn' || $action === 'confirm-receipt')) {
            if ($method === 'POST') $this->confirmReceipt($id);
            else Response::error('Method not allowed', 405);
            return;
        }

        if ($id) {
            if ($method === 'GET') $this->show($id);
            elseif ($method === 'PUT' || $method === 'PATCH') $this->update($id);
            elseif ($method === 'DELETE') $this->delete($id);
            else Response::error('Method not allowed', 405);
            return;
        }

        if ($method === 'GET') $this->index();
        elseif ($method === 'POST') $this->store();
        else Response::error('Method not allowed', 405);
    }

    /**
     * Asegura columnas de progreso (PO/GRN) y el enum 'received'.
     * El DDL canónico no las incluye; se agregan de forma perezosa y cacheada.
     */
    private function ensureRequisitionProgressColumns(): void
    {
        if (\App\Support\Cache::get('requisition_progress_cols_v1') !== null) {
            return;
        }
        try { $this->pdo->exec("ALTER TABLE requisitions MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'ordered', 'received') DEFAULT 'pending'"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE requisitions ADD COLUMN po_number VARCHAR(50) NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE requisitions ADD COLUMN ordered_at DATETIME NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE requisitions ADD COLUMN received_at DATETIME NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE requisitions ADD COLUMN received_by CHAR(36) NULL"); } catch (\Throwable $e) {}
        \App\Support\Cache::set('requisition_progress_cols_v1', time(), 86400 * 365);
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS requisitions (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                requester_id CHAR(36) NOT NULL,
                project_id CHAR(36) NULL,
                vendor_id CHAR(36) NULL,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                amount DECIMAL(15, 2) NOT NULL,
                currency_id INT NOT NULL,
                status ENUM('pending', 'approved', 'rejected', 'ordered', 'received') DEFAULT 'pending',
                po_number VARCHAR(50) NULL,
                ordered_at DATETIME NULL,
                received_at DATETIME NULL,
                received_by CHAR(36) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_company (company_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS requisition_approvals (
                id CHAR(36) PRIMARY KEY,
                requisition_id CHAR(36) NOT NULL,
                step_number INT NOT NULL,
                role_required VARCHAR(50) NOT NULL,
                status ENUM('pending', 'approved', 'rejected', 'skipped') DEFAULT 'pending',
                reviewed_by_user_id CHAR(36) NULL,
                reviewed_at DATETIME NULL,
                comments TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_req_step (requisition_id, step_number),
                FOREIGN KEY (requisition_id) REFERENCES requisitions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Optimizations / Indexes
        try {
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_requisitions_company_status ON requisitions(company_id, status)");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_requisitions_requester ON requisitions(requester_id)");
        } catch (\Exception $e) { /* Ignore if exists or not supported */ }
    }

    private function index(): void
    {
        $companyId = $this->getCompanyId();
        $role = Auth::user()['platform_role'] ?? '';
        $isPlatform = in_array($role, ['super_admin', 'admin', 'finance', 'legal'], true);
        if (!$companyId && !$isPlatform) { Response::error('company_id required', 400); return; }

        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        $whereCount = $companyId ? 'WHERE company_id LIKE :cid' : '';
        $whereReq = $companyId ? 'WHERE r.company_id LIKE :cid' : '';

        // Count total
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM requisitions $whereCount");
        $countStmt->execute($companyId ? [':cid' => $companyId] : []);
        $total = (int)$countStmt->fetchColumn();
        
        // Fetch requisitions with requester info
        $sql = "
            SELECT r.*, 
                   SUBSTRING_INDEX(u.full_name, ' ', 1) as first_name,
                   CASE WHEN LOCATE(' ', u.full_name) > 0 THEN SUBSTRING(u.full_name, LOCATE(' ', u.full_name) + 1) ELSE '' END as last_name,
                   u.email,
                   (SELECT COUNT(*) FROM requisition_approvals ra WHERE ra.requisition_id = r.id AND ra.status = 'pending') as pending_steps_count,
                   (SELECT role_required FROM requisition_approvals ra WHERE ra.requisition_id = r.id AND ra.status = 'pending' ORDER BY ra.step_number ASC LIMIT 1) as current_required_role
            FROM requisitions r
            LEFT JOIN users u ON r.requester_id = u.id
            $whereReq 
            ORDER BY r.created_at DESC
            LIMIT :limit OFFSET :offset
        ";
        
        $stmt = $this->pdo->prepare($sql);
        if ($companyId) $stmt->bindValue(':cid', $companyId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $requisitions = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Enhance with current user approval ability
        $userId = Auth::userId();
        $userRoles = [];
        if ($companyId) {
            // Get user roles for this company
            $rolesStmt = $this->pdo->prepare("
                SELECT r.name 
                FROM roles r
                JOIN user_roles ur ON ur.role_id = r.id
                JOIN company_users cu ON cu.id = ur.company_user_id
                WHERE cu.user_id LIKE :uid AND cu.company_id LIKE :cid
            ");
            $rolesStmt->execute([':uid' => $userId, ':cid' => $companyId]);
            $userRoles = array_map('strtolower', $rolesStmt->fetchAll(PDO::FETCH_COLUMN));
        }
        
        // Also check if user is platform super admin or similar if needed, but let's stick to company roles
        // Map simplified roles if necessary. Assuming roles stored are 'admin', 'finance', 'user', 'company_admin'
        
        foreach ($requisitions as &$req) {
            $req['can_approve'] = false;
            if ($req['status'] === 'pending' && $req['current_required_role']) {
                $required = strtolower($req['current_required_role']);
                // Check if user has this role
                // Special mapping: 'manager' -> 'admin' for now? Or strictly matching strings.
                // Let's assume roles in DB match required roles: 'admin', 'finance', 'company_admin'
                
                // Allow 'company_admin' to approve everything? Maybe not, strict flow.
                // But usually 'company_admin' has all powers.
                
                if (in_array($required, $userRoles) || in_array('company_admin', $userRoles) || in_array('company admin', $userRoles)) {
                     $req['can_approve'] = true;
                }
            }
        }

        Response::json([
            'data' => $requisitions,
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => ceil($total / $limit)
            ]
        ]);
    }

    private function update(string $id): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            Response::error('Invalid JSON body', 400);
            return;
        }

        $stmt = $this->pdo->prepare("SELECT * FROM requisitions WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$req) { Response::error('Requisition not found', 404); return; }
        if ($req['status'] !== 'pending') { Response::error('Cannot edit a requisition that is not pending', 400); return; }
        
        $userId = Auth::userId();
        // Allow requester or admin/company_admin
        if ($req['requester_id'] !== $userId && !$this->hasRole('admin') && !$this->hasRole('company_admin')) {
             Response::error('Unauthorized', 403); return;
        }

        $title = $data['title'] ?? $req['title'];
        $desc = $data['description'] ?? $req['description'];
        $amount = isset($data['amount']) ? (float)$data['amount'] : $req['amount'];
        $currency = $data['currency_id'] ?? $req['currency_id'];
        $vendor = $data['vendor_id'] ?? $req['vendor_id'];
        $project = $data['project_id'] ?? $req['project_id'];

        $upd = $this->pdo->prepare("
            UPDATE requisitions 
            SET title = :title, description = :desc, amount = :amount, currency_id = :curr, 
                vendor_id = :vend, project_id = :proj, updated_at = NOW()
            WHERE id = :id
        ");
        $upd->execute([
            ':title' => $title,
            ':desc' => $desc,
            ':amount' => $amount,
            ':curr' => $currency,
            ':vend' => $vendor,
            ':proj' => $project,
            ':id' => $id
        ]);

        Response::json(['message' => 'Requisition updated']);
    }

    private function delete(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM requisitions WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$req) { Response::error('Requisition not found', 404); return; }
        if ($req['status'] !== 'pending') { Response::error('Cannot delete a requisition that is not pending', 400); return; }
        
        $userId = Auth::userId();
        if ($req['requester_id'] !== $userId && !$this->hasRole('admin') && !$this->hasRole('company_admin')) {
             Response::error('Unauthorized', 403); return;
        }

        $this->pdo->prepare("DELETE FROM requisitions WHERE id = :id")->execute([':id' => $id]);
        Response::json(['message' => 'Requisition deleted']);
    }

    private function store(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            Response::error('Invalid JSON body', 400);
            return;
        }
        $companyId = $data['company_id'] ?? $this->getCompanyId();
        $requesterId = $data['requester_id'] ?? Auth::userId();
        
        if (!$companyId || !$requesterId) { Response::error('company_id and requester_id required', 400); return; }

        if (empty($data['title']) || !isset($data['amount']) || empty($data['currency_id'])) {
            Response::error('title, amount y currency_id son requeridos', 422);
            return;
        }
        if ((float)$data['amount'] <= 0) {
            Response::error('amount debe ser mayor a 0', 422);
            return;
        }

        $id = $this->uuid();
        $amount = (float)($data['amount'] ?? 0);
        
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO requisitions (id, company_id, requester_id, title, description, amount, currency_id, vendor_id, project_id, status)
                VALUES (:id, :cid, :req, :title, :desc, :amount, :curr, :vend, :proj, 'pending')
            ");
            $stmt->execute([
                ':id' => $id,
                ':cid' => $companyId,
                ':req' => $requesterId,
                ':title' => $data['title'],
                ':desc' => $data['description'] ?? null,
                ':amount' => $amount,
                ':curr' => $data['currency_id'],
                ':vend' => $data['vendor_id'] ?? null,
                ':proj' => $data['project_id'] ?? null
            ]);

            // Generate Approval Steps based on Rules
            // Rule 1: Always Admin/Manager approval (Level 1)
            $this->createApprovalStep($id, 1, 'admin');

            // Rule 2: > 1000 -> Finance
            if ($amount >= 1000) {
                $this->createApprovalStep($id, 2, 'finance');
            }

            // Rule 3: > 5000 -> Company Admin (CFO/CEO level)
            if ($amount >= 5000) {
                $this->createApprovalStep($id, 3, 'company_admin');
            }

            $this->pdo->commit();
            Response::json(['message' => 'Requisition created', 'id' => $id], 201);
        } catch (Exception $e) {
            $this->pdo->rollBack();
            Response::error('Failed to create requisition: ' . $e->getMessage(), 500);
        }
    }

    private function createApprovalStep($reqId, $step, $role) {
        $stmt = $this->pdo->prepare("
            INSERT INTO requisition_approvals (id, requisition_id, step_number, role_required, status)
            VALUES (:id, :rid, :step, :role, 'pending')
        ");
        $stmt->execute([
            ':id' => $this->uuid(),
            ':rid' => $reqId,
            ':step' => $step,
            ':role' => $role
        ]);
    }

    private function show(string $id): void
    {
        $stmt = $this->pdo->prepare("
            SELECT r.*, 
                   SUBSTRING_INDEX(u.full_name, ' ', 1) as first_name,
                   CASE WHEN LOCATE(' ', u.full_name) > 0 THEN SUBSTRING(u.full_name, LOCATE(' ', u.full_name) + 1) ELSE '' END as last_name
            FROM requisitions r
            LEFT JOIN users u ON r.requester_id = u.id
            WHERE r.id LIKE :id
        ");
        $stmt->execute([':id' => $id]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$req) { Response::error('Requisition not found', 404); return; }

        $companyId = $this->getCompanyId();
        if ($companyId && ($req['company_id'] ?? null) !== $companyId) {
            Response::error('Requisition not found', 404);
            return;
        }

        // Fetch approvals
        $stmtApp = $this->pdo->prepare("
            SELECT ra.*, 
                   SUBSTRING_INDEX(u.full_name, ' ', 1) as reviewer_first_name,
                   CASE WHEN LOCATE(' ', u.full_name) > 0 THEN SUBSTRING(u.full_name, LOCATE(' ', u.full_name) + 1) ELSE '' END as reviewer_last_name
            FROM requisition_approvals ra
            LEFT JOIN users u ON ra.reviewed_by_user_id = u.id
            WHERE ra.requisition_id LIKE :rid
            ORDER BY ra.step_number ASC
        ");
        $stmtApp->execute([':rid' => $id]);
        $req['approvals'] = $stmtApp->fetchAll(PDO::FETCH_ASSOC);

        Response::json($req);
    }

    private function handleApproval(string $id): void 
    {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            Response::error('Invalid JSON body', 400);
            return;
        }
        $status = $data['status'] ?? null; // 'approved' or 'rejected'
        $comments = $data['comments'] ?? '';
        $userId = Auth::userId();
        $companyId = $this->getCompanyId();

        if (!in_array($status, ['approved', 'rejected'])) {
            Response::error('Invalid status', 400);
            return;
        }

        // Get current pending step
        $stmt = $this->pdo->prepare("
            SELECT * FROM requisition_approvals 
            WHERE requisition_id LIKE :rid AND status = 'pending' 
            ORDER BY step_number ASC LIMIT 1
        ");
        $stmt->execute([':rid' => $id]);
        $step = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$step) {
            Response::error('No pending approvals for this requisition', 400);
            return;
        }

        // Check permissions
        // Get user roles
        $rolesStmt = $this->pdo->prepare("
            SELECT r.name 
            FROM roles r
            JOIN user_roles ur ON ur.role_id = r.id
            JOIN company_users cu ON cu.id = ur.company_user_id
            WHERE cu.user_id LIKE :uid AND cu.company_id LIKE :cid
        ");
        $rolesStmt->execute([':uid' => $userId, ':cid' => $companyId]);
        $userRoles = $rolesStmt->fetchAll(PDO::FETCH_COLUMN);
        $userRoles = array_map('strtolower', $userRoles);

        // Logic: User must have the required role OR be admin/company_admin (override)
        // But if required role IS company_admin, then they must be company_admin.
        $required = strtolower($step['role_required']);
        $isOverride = in_array('admin', $userRoles) || in_array('company_admin', $userRoles) || in_array('company admin', $userRoles);

        if (!in_array($required, $userRoles) && !$isOverride) {
            Response::error('You do not have the required role (' . $step['role_required'] . ') to approve this step', 403);
            return;
        }

        $this->pdo->beginTransaction();
        try {
            // Update step
            $updStmt = $this->pdo->prepare("
                UPDATE requisition_approvals 
                SET status = :status, reviewed_by_user_id = :uid, reviewed_at = NOW(), comments = :comments
                WHERE id LIKE :id
            ");
            $updStmt->execute([
                ':status' => $status,
                ':uid' => $userId,
                ':comments' => $comments,
                ':id' => $step['id']
            ]);

            if ($status === 'rejected') {
                // If rejected, the whole requisition is rejected
                $this->pdo->prepare("UPDATE requisitions SET status = 'rejected' WHERE id LIKE :rid")
                     ->execute([':rid' => $id]);
            } else {
                // If approved, check if there are more steps
                $countStmt = $this->pdo->prepare("
                    SELECT COUNT(*) FROM requisition_approvals 
                    WHERE requisition_id LIKE :rid AND status LIKE 'pending'
                ");
                $countStmt->execute([':rid' => $id]);
                $remaining = $countStmt->fetchColumn();

                if ($remaining == 0) {
                    // All steps approved
                    $this->pdo->prepare("UPDATE requisitions SET status = 'approved' WHERE id LIKE :rid")
                         ->execute([':rid' => $id]);
                }
            }

            $this->pdo->commit();
            Response::json(['message' => 'Approval processed']);
        } catch (Exception $e) {
            $this->pdo->rollBack();
            Response::error('Error processing approval', 500);
        }
    }

    private function emitPO(string $id): void
    {
        $this->checkPermission('company_admin'); // Only admins/procurement managers can emit PO
        $this->ensureRequisitionProgressColumns();

        $stmt = $this->pdo->prepare("SELECT * FROM requisitions WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$req) Response::error('Requisition not found', 404);
        if ($req['status'] !== 'approved') Response::error('Requisition must be approved before emitting PO', 400);

        $poNumber = 'PO-' . date('Ym') . '-' . substr(hexdec(substr($id, 0, 8)), 0, 6);
        
        $upd = $this->pdo->prepare("
            UPDATE requisitions 
            SET status = 'ordered', po_number = :po, ordered_at = NOW() 
            WHERE id = :id
        ");
        $upd->execute([':po' => $poNumber, ':id' => $id]);

        Response::json(['message' => 'Purchase Order Emitted', 'po_number' => $poNumber]);
    }

    private function confirmReceipt(string $id): void
    {
        $this->ensureRequisitionProgressColumns();
        // Any employee can confirm receipt? Or just requester/admin?
        // Let's allow requester and admin.
        $userId = Auth::userId();
        
        $stmt = $this->pdo->prepare("SELECT * FROM requisitions WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$req) Response::error('Requisition not found', 404);
        if ($req['status'] !== 'ordered') Response::error('Requisition must be ordered to confirm receipt', 400);

        // Permission check: Requester OR Admin
        $isAdmin = $this->hasRole('company_admin') || $this->hasRole('admin');
        if ($req['requester_id'] !== $userId && !$isAdmin) {
            Response::error('Only the requester or admin can confirm receipt', 403);
        }

        $upd = $this->pdo->prepare("
            UPDATE requisitions 
            SET status = 'received', received_at = NOW(), received_by = :uid
            WHERE id = :id
        ");
        $upd->execute([':uid' => $userId, ':id' => $id]);

        Response::json(['message' => 'Goods/Services Receipt Confirmed']);
    }

    private function checkPermission(string $role): void
    {
        if (!$this->hasRole($role)) {
            Response::error('Unauthorized', 403);
        }
    }

    private function hasRole(string $role): bool
    {
        $userId = Auth::userId();
        $companyId = $this->getCompanyId();
        
        $stmt = $this->pdo->prepare("
            SELECT COUNT(*) 
            FROM company_users cu
            JOIN user_roles ur ON cu.id = ur.company_user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE cu.user_id = :uid AND cu.company_id = :cid AND r.name = :role
        ");
        $stmt->execute([':uid' => $userId, ':cid' => $companyId, ':role' => $role]);
        return $stmt->fetchColumn() > 0;
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
