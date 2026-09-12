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
        $userId = $_GET['user_id'] ?? $user['id'];
        
        // Only admin/finance can see others
        if ($userId !== $user['id'] && !in_array($user['platform_role'], ['admin', 'finance', 'support'])) {
            Response::error('Unauthorized', 403);
            return;
        }

        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;

        $stmt = $this->pdo->prepare("
            SELECT * FROM salary_advances 
            WHERE user_id LIKE :uid 
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':uid', $userId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Count
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM salary_advances WHERE user_id = :uid");
        $countStmt->execute([':uid' => $userId]);
        $total = (int)$countStmt->fetchColumn();

        Response::json([
            'data' => $items,
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => ceil($total / $limit)
            ]
        ]);
    }

    private function show(string $id): void
    {
        $user = Auth::user();
        
        $stmt = $this->pdo->prepare("SELECT * FROM salary_advances WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$item) {
            Response::error('Advance not found', 404);
            return;
        }

        if ($item['user_id'] !== $user['id'] && !in_array($user['platform_role'], ['admin', 'finance', 'support'])) {
            Response::error('Unauthorized', 403);
            return;
        }

        Response::json(['data' => $item]);
    }

    private function store(): void
    {
        $user = Auth::user();
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['amount']) || empty($data['repayment_date'])) {
            Response::error('Amount and repayment date are required', 422);
            return;
        }

        // Logic to calculate fee? For now static or 0
        $amount = (float)$data['amount'];
        $fee = $amount * 0.02; // 2% fee example

        $id = $this->uuid();
        
        $stmt = $this->pdo->prepare("
            INSERT INTO salary_advances (id, user_id, amount, fee, repayment_date, status, reason)
            VALUES (:id, :uid, :amount, :fee, :date, 'pending', :reason)
        ");

        $stmt->execute([
            ':id' => $id,
            ':uid' => $user['id'],
            ':amount' => $amount,
            ':fee' => $fee,
            ':date' => $data['repayment_date'],
            ':reason' => $data['reason'] ?? null
        ]);

        Response::json(['message' => 'Advance requested successfully', 'id' => $id], 201);
    }

    private function update(string $id): void
    {
        $user = Auth::user();
        // Only admin/finance can approve/reject
        if (!in_array($user['platform_role'], ['admin', 'finance'])) {
            Response::error('Unauthorized', 403);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $status = $data['status'] ?? null;

        if ($status && in_array($status, ['approved', 'rejected', 'paid', 'overdue'])) {
            $stmt = $this->pdo->prepare("UPDATE salary_advances SET status = :status WHERE id LIKE :id");
            $stmt->execute([':status' => $status, ':id' => $id]);
            Response::json(['message' => 'Advance updated']);
        } else {
            Response::error('Invalid status', 422);
        }
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
