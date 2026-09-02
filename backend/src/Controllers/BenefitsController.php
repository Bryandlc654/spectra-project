<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class BenefitsController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->ensureTables();
    }

    private function ensureTables(): void
    {
        // Benefits Plans
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS benefits_plans (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                provider VARCHAR(100) NOT NULL,
                type VARCHAR(50) NOT NULL, -- Health, Life, Dental, Vision
                country_id BIGINT UNSIGNED NULL,
                name VARCHAR(150) NOT NULL,
                cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                currency_id INT NOT NULL DEFAULT 1,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_company (company_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Employee Benefits
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS employee_benefits (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                plan_id CHAR(36) NOT NULL,
                status ENUM('pending', 'active', 'cancelled') DEFAULT 'pending',
                enrollment_date DATE DEFAULT CURRENT_DATE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_enrollment (user_id, plan_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (plan_id) REFERENCES benefits_plans(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/benefits/plans
        // /api/benefits/enrollments

        $resource = $segments[2] ?? null;
        $id = $segments[3] ?? null;

        if (!$resource) {
            Response::error('Recurso no especificado (plans, enrollments)', 400);
            return;
        }

        switch ($resource) {
            case 'plans':
                $this->handlePlans($method, $id);
                break;
            case 'enrollments':
                $this->handleEnrollments($method, $id);
                break;
            default:
                Response::error('Recurso inválido', 404);
        }
    }

    private function handlePlans(string $method, ?string $id): void
    {
        if ($method === 'GET') {
            if ($id) {
                $stmt = $this->pdo->prepare("SELECT * FROM benefits_plans WHERE id LIKE :id");
                $stmt->execute([':id' => $id]);
                $plan = $stmt->fetch(PDO::FETCH_ASSOC);
                $plan ? Response::json($plan) : Response::error('Plan no encontrado', 404);
            } else {
                $companyId = $_GET['company_id'] ?? null;
                $countryId = $_GET['country_id'] ?? null;
                
                $page = max(1, (int)($_GET['page'] ?? 1));
                $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
                $offset = ($page - 1) * $limit;

                $sql = "SELECT * FROM benefits_plans WHERE 1=1";
                $countSql = "SELECT COUNT(*) FROM benefits_plans WHERE 1=1";
                $params = [];
                
                if ($companyId) {
                    $sql .= " AND company_id LIKE :cid";
                    $countSql .= " AND company_id LIKE :cid";
                    $params[':cid'] = $companyId;
                }
                if ($countryId) {
                    $sql .= " AND country_id = :country";
                    $countSql .= " AND country_id = :country";
                    $params[':country'] = $countryId;
                }
                
                $sql .= " LIMIT :limit OFFSET :offset";

                $stmt = $this->pdo->prepare($sql);
                foreach ($params as $key => $value) {
                    $stmt->bindValue($key, $value);
                }
                $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                $stmt->execute();
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

                $countStmt = $this->pdo->prepare($countSql);
                foreach ($params as $key => $value) {
                    $countStmt->bindValue($key, $value);
                }
                $countStmt->execute();
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
            }
        } elseif ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            $this->pdo->prepare("
                INSERT INTO benefits_plans (id, company_id, provider, type, country_id, name, cost, currency_id, description)
                VALUES (UUID(), :cid, :provider, :type, :country, :name, :cost, :currency, :desc)
            ")->execute([
                ':cid' => $data['company_id'],
                ':provider' => $data['provider'],
                ':type' => $data['type'],
                ':country' => $data['country_id'] ?? null,
                ':name' => $data['name'],
                ':cost' => $data['cost'],
                ':currency' => $data['currency_id'] ?? 1,
                ':desc' => $data['description'] ?? null
            ]);
            Response::json(['message' => 'Plan de beneficios creado'], 201);
        } elseif ($method === 'DELETE' && $id) {
            $this->pdo->prepare("DELETE FROM benefits_plans WHERE id = :id")->execute([':id' => $id]);
            Response::json(['message' => 'Plan eliminado']);
        }
    }

    private function handleEnrollments(string $method, ?string $id): void
    {
        if ($method === 'GET') {
            $userId = $_GET['user_id'] ?? null;
            if ($userId) {
                $page = max(1, (int)($_GET['page'] ?? 1));
                $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
                $offset = ($page - 1) * $limit;

                $stmt = $this->pdo->prepare("
                    SELECT e.*, p.name as plan_name, p.type, p.provider, p.cost, p.currency_id 
                    FROM employee_benefits e
                    JOIN benefits_plans p ON e.plan_id = p.id
                    WHERE e.user_id = :uid
                    LIMIT :limit OFFSET :offset
                ");
                $stmt->bindValue(':uid', $userId);
                $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                $stmt->execute();
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

                $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM employee_benefits WHERE user_id = :uid");
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
        } elseif ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            $this->pdo->prepare("
                INSERT INTO employee_benefits (id, user_id, plan_id, status)
                VALUES (UUID(), :uid, :pid, :status)
            ")->execute([
                ':uid' => $data['user_id'],
                ':pid' => $data['plan_id'],
                ':status' => $data['status'] ?? 'pending'
            ]);
            Response::json(['message' => 'Inscripción realizada'], 201);
        } elseif ($method === 'PATCH' && $id) {
            $data = json_decode(file_get_contents('php://input'), true);
            $this->pdo->prepare("UPDATE employee_benefits SET status = :status WHERE id LIKE :id")
                 ->execute([':status' => $data['status'], ':id' => $id]);
            Response::json(['message' => 'Estado actualizado']);
        }
    }
}
