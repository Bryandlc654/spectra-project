<?php
namespace App\Controllers;

use App\Database;
use PDO;

class ExpenseController {
    private $pdo;

    public function __construct(Database $database) {
        $this->pdo = $database->pdo();
        $this->ensureTables();
    }

    private function ensureTables() {
        // expense_categories
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS expense_categories (
                id CHAR(36) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                policy_limit DECIMAL(15, 2) DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // expenses
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS expenses (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                currency CHAR(3) DEFAULT 'USD',
                category_id VARCHAR(36) NULL,
                receipt_url VARCHAR(255) NULL,
                status ENUM('pending', 'approved', 'rejected', 'reimbursed') DEFAULT 'pending',
                payroll_run_id VARCHAR(36) NULL,
                description TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Seed some categories if empty
        $stmt = $this->pdo->query("SELECT COUNT(*) FROM expense_categories");
        if ($stmt->fetchColumn() == 0) {
            $this->seedCategories();
        }

        // Update existing tables
        try {
            $this->pdo->exec("ALTER TABLE expenses ADD COLUMN payroll_run_id VARCHAR(36) NULL AFTER status");
        } catch (\Exception $e) {
            // Ignore if exists
        }
    }

    private function seedCategories() {
        $categories = [
            ['name' => 'Travel', 'limit' => 1000.00],
            ['name' => 'Meals', 'limit' => 50.00],
            ['name' => 'Office Supplies', 'limit' => 200.00],
            ['name' => 'Software', 'limit' => 500.00]
        ];
        
        $stmt = $this->pdo->prepare("INSERT INTO expense_categories (id, name, policy_limit) VALUES (?, ?, ?)");
        foreach ($categories as $cat) {
            $stmt->execute([$this->generateUuid(), $cat['name'], $cat['limit']]);
        }
    }

    public function handle($segments, $method) {
        // /api/expenses
        // /api/expenses/categories
        
        $resource = $segments[0] ?? null;

        if ($resource === 'categories') {
            return $this->handleCategories($method);
        } else {
            // Assume expenses root
            return $this->handleExpenses($method, $resource);
        }
    }

    private function handleCategories($method) {
        if ($method === 'GET') {
            $stmt = $this->pdo->prepare("SELECT * FROM expense_categories ORDER BY name ASC");
            $stmt->execute();
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        }
    }

    private function handleExpenses($method, $id) {
        if ($method === 'GET') {
            $userId = $_GET['user_id'] ?? null;
            $mode = $_GET['mode'] ?? null;
            $managerId = $_GET['manager_id'] ?? null;
            
            // Pagination parameters
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
            $offset = ($page - 1) * $limit;

            $params = [];
            $sql = "SELECT e.*, ec.name as category_name, u.full_name 
                    FROM expenses e 
                    LEFT JOIN users u ON e.user_id = u.id
                    LEFT JOIN expense_categories ec ON e.category_id = ec.id";
            
            $whereClauses = [];

            if ($mode === 'team' && $managerId) {
                $whereClauses[] = "u.manager_id LIKE :mid";
                $params[':mid'] = $managerId;
            } elseif ($userId) {
                $whereClauses[] = "e.user_id LIKE :uid";
                $params[':uid'] = $userId;
            }
            
            if (!empty($whereClauses)) {
                $sql .= " WHERE " . implode(' AND ', $whereClauses);
            }
            
            $sql .= " ORDER BY e.created_at DESC LIMIT :limit OFFSET :offset";
            
            // Prepare and bind manually for limit/offset (PDO sometimes needs explicit int binding)
            $stmt = $this->pdo->prepare($sql);
            foreach ($params as $k => $v) {
                $stmt->bindValue($k, $v);
            }
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Count total
            $countSql = "SELECT COUNT(*) FROM expenses e LEFT JOIN users u ON e.user_id = u.id";
            if (!empty($whereClauses)) {
                $countSql .= " WHERE " . implode(' AND ', $whereClauses);
            }
            $countStmt = $this->pdo->prepare($countSql);
            foreach ($params as $k => $v) {
                $countStmt->bindValue($k, $v);
            }
            $countStmt->execute();
            $total = (int)$countStmt->fetchColumn();

            echo json_encode([
                'data' => $data,
                'pagination' => [
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => ceil($total / $limit)
                ]
            ]);
        } elseif ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            $uuid = $this->generateUuid();
            $stmt = $this->pdo->prepare("INSERT INTO expenses (id, user_id, amount, currency, category_id, receipt_url, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $uuid,
                $data['user_id'],
                $data['amount'],
                $data['currency'] ?? 'USD',
                $data['category_id'] ?? null,
                $data['receipt_url'] ?? null,
                $data['description'] ?? '',
                $data['status'] ?? 'pending'
            ]);
            echo json_encode(['message' => 'Expense submitted', 'id' => $uuid]);
        } elseif ($method === 'PUT' && $id) {
            // Update/Approve
            $data = json_decode(file_get_contents('php://input'), true);
            $status = $data['status'] ?? null;
            
            if ($status && in_array($status, ['approved', 'rejected', 'reimbursed'])) {
                $stmt = $this->pdo->prepare("UPDATE expenses SET status = ?, updated_at = NOW() WHERE id LIKE ?");
                $stmt->execute([$status, $id]);
                echo json_encode(['message' => 'Expense updated']);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid status']);
            }
        }
    }

    private function generateUuid() {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
}
