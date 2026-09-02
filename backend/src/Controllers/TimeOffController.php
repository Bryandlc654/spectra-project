<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class TimeOffController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->ensureTables();
    }

    private function ensureTables(): void
    {
        // Policies
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS time_off_policies (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                name VARCHAR(100) NOT NULL,
                type VARCHAR(50) NOT NULL,
                days_per_year INT DEFAULT 0,
                carry_over_days INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_company (company_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Balances
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS time_off_balances (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                policy_id CHAR(36) NOT NULL,
                total_days DECIMAL(5,2) DEFAULT 0,
                used_days DECIMAL(5,2) DEFAULT 0,
                remaining_days DECIMAL(5,2) DEFAULT 0,
                year INT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_balance (user_id, policy_id, year),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (policy_id) REFERENCES time_off_policies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Requests
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS time_off_requests (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                policy_id CHAR(36) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                days_requested DECIMAL(5,2) NOT NULL,
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                reason TEXT,
                approver_id VARCHAR(36) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (policy_id) REFERENCES time_off_policies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/time-off/policies
        // /api/time-off/requests
        // /api/time-off/balances

        $resource = $segments[2] ?? null;
        $id = $segments[3] ?? null;

        if (!$resource) {
            Response::error('Recurso no especificado (policies, requests, balances)', 400);
            return;
        }

        switch ($resource) {
            case 'policies':
                $this->handlePolicies($method, $id);
                break;
            case 'requests':
                $this->handleRequests($method, $id);
                break;
            case 'balances':
                $this->handleBalances($method, $id);
                break;
            default:
                Response::error('Recurso inválido', 404);
        }
    }

    private function handlePolicies(string $method, ?string $id): void
    {
        if ($method === 'GET') {
            if ($id) {
                // Show policy
                $stmt = $this->pdo->prepare("SELECT * FROM time_off_policies WHERE id LIKE :id");
                $stmt->execute([':id' => $id]);
                $policy = $stmt->fetch(PDO::FETCH_ASSOC);
                $policy ? Response::json($policy) : Response::error('Política no encontrada', 404);
            } else {
                // List policies with pagination
                $companyId = $_GET['company_id'] ?? null;
                if (!$companyId) {
                    Response::error('company_id requerido', 400);
                    return;
                }

                $page = max(1, (int)($_GET['page'] ?? 1));
                $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
                $offset = ($page - 1) * $limit;

                // Data query
                $stmt = $this->pdo->prepare("
                    SELECT * FROM time_off_policies 
                    WHERE company_id LIKE :cid 
                    ORDER BY name ASC 
                    LIMIT :limit OFFSET :offset
                ");
                $stmt->bindValue(':cid', $companyId);
                $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                $stmt->execute();
                $policies = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // Count query
                $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM time_off_policies WHERE company_id LIKE :cid");
                $countStmt->execute([':cid' => $companyId]);
                $total = (int)$countStmt->fetchColumn();

                Response::json([
                    'data' => $policies,
                    'pagination' => [
                        'total' => $total,
                        'page' => $page,
                        'limit' => $limit,
                        'total_pages' => ceil($total / $limit)
                    ]
                ]);
            }
        } elseif ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            $this->pdo->prepare("
                INSERT INTO time_off_policies (id, company_id, name, type, days_per_year, carry_over_days)
                VALUES (UUID(), :cid, :name, :type, :days, :carry)
            ")->execute([
                ':cid' => $data['company_id'],
                ':name' => $data['name'],
                ':type' => $data['type'],
                ':days' => $data['days_per_year'],
                ':carry' => $data['carry_over_days'] ?? 0
            ]);
            Response::json(['message' => 'Política creada'], 201);
        } elseif ($method === 'PUT' && $id) {
            $data = json_decode(file_get_contents('php://input'), true);
            $this->pdo->prepare("
                UPDATE time_off_policies 
                SET name = :name, type = :type, days_per_year = :days, carry_over_days = :carry 
                WHERE id LIKE :id
            ")->execute([
                ':name' => $data['name'],
                ':type' => $data['type'],
                ':days' => $data['days_per_year'],
                ':carry' => $data['carry_over_days'] ?? 0,
                ':id' => $id
            ]);
            Response::json(['message' => 'Política actualizada']);
        } elseif ($method === 'DELETE' && $id) {
            $this->pdo->prepare("DELETE FROM time_off_policies WHERE id LIKE :id")->execute([':id' => $id]);
            Response::json(['message' => 'Política eliminada']);
        }
    }

    private function handleRequests(string $method, ?string $id): void
    {
        if ($method === 'GET') {
             $userId = $_GET['user_id'] ?? null;
             $mode = $_GET['mode'] ?? null;
             $managerId = $_GET['manager_id'] ?? null;
             
             $page = max(1, (int)($_GET['page'] ?? 1));
             $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
             $offset = ($page - 1) * $limit;

             if ($mode === 'team' && $managerId) {
                 // Fetch requests for direct reports of this manager
                 $sql = "
                    SELECT r.*, u.full_name, p.name as policy_name 
                    FROM time_off_requests r 
                    JOIN users u ON r.user_id = u.id 
                    JOIN time_off_policies p ON r.policy_id = p.id
                    WHERE u.manager_id LIKE :mid 
                    ORDER BY r.created_at DESC
                    LIMIT :limit OFFSET :offset
                 ";
                 $stmt = $this->pdo->prepare($sql);
                 $stmt->bindValue(':mid', $managerId);
                 $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                 $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                 $stmt->execute();
                 $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

                 // Count
                 $countSql = "
                    SELECT COUNT(*) 
                    FROM time_off_requests r 
                    JOIN users u ON r.user_id = u.id 
                    WHERE u.manager_id LIKE :mid
                 ";
                 $countStmt = $this->pdo->prepare($countSql);
                 $countStmt->execute([':mid' => $managerId]);
                 $total = (int)$countStmt->fetchColumn();

                 Response::json([
                    'data' => $data,
                    'pagination' => [
                        'total' => $total,
                        'page' => $page,
                        'limit' => $limit,
                        'total_pages' => ceil($total / $limit)
                    ]
                 ]);

             } elseif ($userId) {
                 $sql = "
                    SELECT r.*, p.name as policy_name 
                    FROM time_off_requests r
                    JOIN time_off_policies p ON r.policy_id = p.id
                    WHERE r.user_id LIKE :uid 
                    ORDER BY r.created_at DESC
                    LIMIT :limit OFFSET :offset
                 ";
                 $stmt = $this->pdo->prepare($sql);
                 $stmt->bindValue(':uid', $userId);
                 $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                 $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                 $stmt->execute();
                 $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

                 // Count
                 $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM time_off_requests WHERE user_id LIKE :uid");
                 $countStmt->execute([':uid' => $userId]);
                 $total = (int)$countStmt->fetchColumn();

                 Response::json([
                    'data' => $data,
                    'pagination' => [
                        'total' => $total,
                        'page' => $page,
                        'limit' => $limit,
                        'total_pages' => ceil($total / $limit)
                    ]
                 ]);
             } else {
                 Response::json(['data' => [], 'pagination' => ['total' => 0, 'page' => 1, 'limit' => $limit, 'total_pages' => 0]]);
             }
        } elseif ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            $this->pdo->prepare("
                INSERT INTO time_off_requests (id, user_id, policy_id, start_date, end_date, days_requested, reason)
                VALUES (UUID(), :uid, :pid, :start, :end, :days, :reason)
            ")->execute([
                ':uid' => $data['user_id'],
                ':pid' => $data['policy_id'],
                ':start' => $data['start_date'],
                ':end' => $data['end_date'],
                ':days' => $data['days_requested'],
                ':reason' => $data['reason'] ?? null
            ]);
            Response::json(['message' => 'Solicitud creada'], 201);
        } elseif ($method === 'PUT' && $id) {
            // Approve/Reject logic
            $data = json_decode(file_get_contents('php://input'), true);
            $status = $data['status'] ?? null;
            $approverId = $data['approver_id'] ?? null;

            if (!in_array($status, ['approved', 'rejected'])) {
                Response::error('Estado inválido', 400);
                return;
            }

            $this->pdo->beginTransaction();
            try {
                // Update request
                $stmt = $this->pdo->prepare("
                    UPDATE time_off_requests 
                    SET status = :status, approver_id = :aid, updated_at = NOW() 
                    WHERE id LIKE :id
                ");
                $stmt->execute([':status' => $status, ':aid' => $approverId, ':id' => $id]);

                // If approved, update balance
                if ($status === 'approved') {
                    // Get request details
                    $stmt = $this->pdo->prepare("SELECT user_id, policy_id, days_requested FROM time_off_requests WHERE id LIKE :id");
                    $stmt->execute([':id' => $id]);
                    $req = $stmt->fetch(PDO::FETCH_ASSOC);

                    if ($req) {
                        $year = date('Y'); // Assuming current year for balance
                        // Deduct from balance
                        $upd = $this->pdo->prepare("
                            UPDATE time_off_balances 
                            SET used_days = used_days + :days, 
                                remaining_days = remaining_days - :days 
                            WHERE user_id LIKE :uid AND policy_id LIKE :pid AND year = :year
                        ");
                        $upd->execute([
                            ':days' => $req['days_requested'], 
                            ':uid' => $req['user_id'], 
                            ':pid' => $req['policy_id'],
                            ':year' => $year
                        ]);
                    }
                }
                
                $this->pdo->commit();
                Response::json(['message' => 'Solicitud actualizada']);
            } catch (\Exception $e) {
                $this->pdo->rollBack();
                Response::error('Error al actualizar solicitud: ' . $e->getMessage(), 500);
            }
        }
    }

    private function handleBalances(string $method, ?string $id): void
    {
        if ($method === 'GET') {
             $userId = $_GET['user_id'] ?? null;
             if ($userId) {
                 $page = max(1, (int)($_GET['page'] ?? 1));
                 $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
                 $offset = ($page - 1) * $limit;

                 $stmt = $this->pdo->prepare("
                    SELECT b.*, p.name as policy_name 
                    FROM time_off_balances b
                    JOIN time_off_policies p ON b.policy_id = p.id
                    WHERE b.user_id LIKE :uid
                    LIMIT :limit OFFSET :offset
                 ");
                 $stmt->bindValue(':uid', $userId);
                 $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                 $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                 $stmt->execute();
                 $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

                 $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM time_off_balances WHERE user_id LIKE :uid");
                 $countStmt->execute([':uid' => $userId]);
                 $total = (int)$countStmt->fetchColumn();

                 Response::json([
                    'data' => $data,
                    'pagination' => [
                        'total' => $total,
                        'page' => $page,
                        'limit' => $limit,
                        'total_pages' => ceil($total / $limit)
                    ]
                 ]);
             } else {
                 Response::error('user_id requerido', 400);
             }
        }
    }
}
