<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;
use Exception;

class TimesheetController
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
        // Lazy migration for rejection_reason
        try {
            $this->pdo->exec("ALTER TABLE timesheets ADD COLUMN rejection_reason TEXT AFTER notes");
        } catch (Exception $e) { }

        // Lazy migration for entry details
        try {
            $this->pdo->exec("ALTER TABLE timesheet_entries ADD COLUMN start_time TIME NULL, ADD COLUMN end_time TIME NULL, ADD COLUMN break_time INT DEFAULT 0");
        } catch (Exception $e) { }

        $id = $segments[2] ?? null;

        if ($id) {
            // Handle sub-resources
            if (isset($segments[3]) && $segments[3] === 'entries') {
                if ($method === 'POST') {
                    $this->storeEntry($id);
                    return;
                }
            }

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

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS timesheets (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                user_id CHAR(36) NOT NULL,
                project_id CHAR(36) NULL,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                total_hours DECIMAL(10, 2) DEFAULT 0,
                status ENUM('draft', 'submitted', 'approved', 'rejected') DEFAULT 'draft',
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_company (company_id),
                INDEX idx_user (user_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS timesheet_entries (
                id CHAR(36) PRIMARY KEY,
                timesheet_id CHAR(36) NOT NULL,
                date DATE NOT NULL,
                hours DECIMAL(5, 2) NOT NULL,
                description VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (timesheet_id) REFERENCES timesheets(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    private function index(): void
    {
        $companyId = $this->getCompanyId();
        if (!$companyId) {
            Response::error('company_id required', 400);
            return;
        }
        
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;

        // Count
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM timesheets WHERE company_id LIKE :cid");
        $countStmt->execute([':cid' => $companyId]);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("SELECT * FROM timesheets WHERE company_id LIKE :cid ORDER BY created_at DESC LIMIT :limit OFFSET :offset");
        $stmt->bindValue(':cid', $companyId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        Response::json([
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => ceil($total / $limit)
            ]
        ]);
    }

    private function store(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $companyId = $data['company_id'] ?? $this->getCompanyId();
        $userId = $data['user_id'] ?? Auth::userId();

        if (!$companyId || !$userId) {
            Response::error('company_id and user_id required', 400);
            return;
        }
        
        $id = $this->uuid();
        $stmt = $this->pdo->prepare("
            INSERT INTO timesheets (id, company_id, user_id, project_id, period_start, period_end, status)
            VALUES (:id, :cid, :uid, :pid, :start, :end, 'draft')
        ");
        $stmt->execute([
            ':id' => $id,
            ':cid' => $companyId,
            ':uid' => $userId,
            ':pid' => $data['project_id'] ?? null,
            ':start' => $data['period_start'],
            ':end' => $data['period_end']
        ]);
        
        Response::json(['message' => 'Timesheet created', 'id' => $id], 201);
    }
    
    private function show(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM timesheets WHERE id LIKE :id");
        $stmt->execute([':id' => $id]);
        $ts = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$ts) { Response::error('Timesheet not found', 404); return; }
        
        $stmtEntries = $this->pdo->prepare("SELECT * FROM timesheet_entries WHERE timesheet_id LIKE :tid");
        $stmtEntries->execute([':tid' => $id]);
        $ts['entries'] = $stmtEntries->fetchAll(PDO::FETCH_ASSOC);
        
        Response::json($ts);
    }

    private function update(string $id): void 
    {
        $data = json_decode(file_get_contents('php://input'), true);
        if (isset($data['status'])) {
            $sql = "UPDATE timesheets SET status = :status";
            $params = [':status' => $data['status'], ':id' => $id];

            if (isset($data['rejection_reason'])) {
                $sql .= ", rejection_reason = :reason";
                $params[':reason'] = $data['rejection_reason'];
            }

            $sql .= " WHERE id = :id";
            
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
        }
        Response::json(['message' => 'Updated']);
    }

    private function storeEntry(string $timesheetId): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $this->uuid();
        
        $stmt = $this->pdo->prepare("
            INSERT INTO timesheet_entries (id, timesheet_id, date, hours, start_time, end_time, break_time, description)
            VALUES (:id, :tid, :date, :hours, :start, :end, :break, :desc)
        ");
        
        $stmt->execute([
            ':id' => $id,
            ':tid' => $timesheetId,
            ':date' => $data['date'],
            ':hours' => $data['hours'],
            ':start' => $data['start_time'] ?? null,
            ':end' => $data['end_time'] ?? null,
            ':break' => $data['break_time'] ?? 0,
            ':desc' => $data['description'] ?? ''
        ]);
        
        // Update total hours
        $this->updateTotalHours($timesheetId);
        
        Response::json(['message' => 'Entry added', 'id' => $id]);
    }

    private function updateTotalHours(string $timesheetId): void
    {
        $stmt = $this->pdo->prepare("SELECT SUM(hours) FROM timesheet_entries WHERE timesheet_id = ?");
        $stmt->execute([$timesheetId]);
        $total = $stmt->fetchColumn() ?: 0;
        
        $stmt = $this->pdo->prepare("UPDATE timesheets SET total_hours = ? WHERE id = ?");
        $stmt->execute([$total, $timesheetId]);
    }

    private function getOvertimeRules(): void
    {
        $stmt = $this->pdo->query("SELECT * FROM overtime_rules");
        Response::json(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    private function storeOvertimeRule(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $this->uuid();
        
        $stmt = $this->pdo->prepare("
            INSERT INTO overtime_rules (id, country_code, daily_limit, weekly_limit, rate_multiplier)
            VALUES (:id, :cc, :dl, :wl, :rm)
            ON DUPLICATE KEY UPDATE daily_limit = :dl, weekly_limit = :wl, rate_multiplier = :rm
        ");
        
        $stmt->execute([
            ':id' => $id,
            ':cc' => $data['country_code'],
            ':dl' => $data['daily_limit'] ?? 8.00,
            ':wl' => $data['weekly_limit'] ?? 40.00,
            ':rm' => $data['rate_multiplier'] ?? 1.50
        ]);
        
        Response::json(['message' => 'Rule saved']);
    }

    private function delete(string $id): void
    {
        $stmt = $this->pdo->prepare("DELETE FROM timesheets WHERE id LIKE :id");
        $stmt->execute([':id' => $id]);
        Response::json(['message' => 'Deleted']);
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
