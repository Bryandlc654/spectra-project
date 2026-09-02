<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;
use Throwable;

class LaborLawAlertController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->ensureTables();
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS labor_law_alerts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                country_code VARCHAR(2) NULL,
                title VARCHAR(255) NOT NULL,
                summary TEXT,
                details LONGTEXT,
                severity ENUM('info', 'warning', 'critical') DEFAULT 'info',
                effective_date DATE,
                source_url VARCHAR(255) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_country (country_code),
                INDEX idx_effective_date (effective_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/compliance/labor-law-alerts
        // /api/compliance/labor-law-alerts/{id}

        $id = $segments[3] ?? null; // segments: api, compliance, labor-law-alerts, [id]

        if ($id === 'broadcast') {
            if ($method === 'POST') {
                $data = json_decode(file_get_contents('php://input'), true);
                $this->broadcast($data['id'] ?? null);
                return;
            }
        }

        try {
            if ($id === null || $id === '') {
                if ($method === 'GET') {
                    $this->index();
                    return;
                }
                if ($method === 'POST') {
                    $this->store();
                    return;
                }
            } else {
                if ($method === 'GET') {
                    $this->show($id);
                    return;
                }
                if ($method === 'PUT') {
                    $this->update($id);
                    return;
                }
                if ($method === 'DELETE') {
                    $this->destroy($id);
                    return;
                }
            }

            Response::error('Method not allowed', 405);
        } catch (Throwable $e) {
            error_log("LaborLawAlertController Error: " . $e->getMessage());
            Response::error('Internal Server Error', 500, ['message' => $e->getMessage()]);
        }
    }

    private function index(): void
    {
        $countryCode = $_GET['country_code'] ?? null;
        $severity = $_GET['severity'] ?? null;
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        $baseSql = "FROM labor_law_alerts WHERE 1=1";
        $params = [];

        if ($countryCode) {
            $baseSql .= " AND (country_code = ? OR country_code IS NULL)";
            $params[] = $countryCode;
        }

        if ($severity) {
            $baseSql .= " AND severity = ?";
            $params[] = $severity;
        }

        // Count
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) " . $baseSql);
        $countStmt->execute($params);
        $total = $countStmt->fetchColumn();

        // Fetch
        $sql = "SELECT * " . $baseSql . " ORDER BY effective_date DESC, created_at DESC LIMIT :limit OFFSET :offset";
        $stmt = $this->pdo->prepare($sql);
        
        // Bind params
        foreach ($params as $i => $val) {
            $stmt->bindValue($i + 1, $val);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $alerts = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $alerts,
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ]);
    }

    private function show(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM labor_law_alerts WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $alert = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$alert) {
            Response::error('Alert not found', 404);
            return;
        }

        Response::json($alert);
    }

    private function broadcast($id): void
    {
        $this->checkPermission();

        if (!$id) {
            Response::error('Alert ID required', 400);
            return;
        }

        $stmt = $this->pdo->prepare("SELECT * FROM labor_law_alerts WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $alert = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$alert) {
            Response::error('Alert not found', 404);
            return;
        }

        // Find target users (Company Admins in the affected country)
        $sql = "
            SELECT DISTINCT u.id 
            FROM users u
            JOIN company_users cu ON u.id = cu.user_id
            JOIN companies c ON cu.company_id = c.id
            JOIN countries ctry ON c.country_id = ctry.id
            WHERE u.platform_role = 'company_admin'
            AND u.status = 'active'
        ";
        
        $params = [];
        if (!empty($alert['country_code'])) {
            $sql .= " AND ctry.code = :country_code";
            $params[':country_code'] = $alert['country_code'];
        }

        $stmtUsers = $this->pdo->prepare($sql);
        $stmtUsers->execute($params);
        $users = $stmtUsers->fetchAll(PDO::FETCH_COLUMN);

        if (empty($users)) {
            Response::json(['message' => 'No target users found to notify']);
            return;
        }

        // Bulk Insert Notifications
        $values = [];
        $insertParams = [];
        $now = date('Y-m-d H:i:s');
        
        foreach ($users as $userId) {
            // Generate UUID for notification
            $uuid = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000,
                mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
            );
            
            $values[] = "(?, ?, ?, ?, ?, ?, 0, ?)";
            $insertParams[] = $uuid;
            $insertParams[] = $userId;
            $insertParams[] = null; // company_id
            $insertParams[] = ($alert['severity'] === 'critical') ? 'warning' : 'info';
            $insertParams[] = "Labor Law Alert: " . $alert['title'];
            $insertParams[] = $alert['summary'];
            $insertParams[] = $now;
        }

        if (!empty($values)) {
            $sqlInsert = "INSERT INTO notifications (id, user_id, company_id, type, title, message, is_read, created_at) VALUES " . implode(', ', $values);
            $stmtInsert = $this->pdo->prepare($sqlInsert);
            $stmtInsert->execute($insertParams);
        }

        Response::json(['message' => 'Broadcasted to ' . count($users) . ' admins']);
    }

    private function store(): void
    {
        $this->checkPermission();

        $data = json_decode(file_get_contents('php://input'), true);

        // Validation
        if (empty($data['title']) || empty($data['effective_date'])) {
            Response::error('Title and effective date are required', 400);
            return;
        }

        $stmt = $this->pdo->prepare("
            INSERT INTO labor_law_alerts (country_code, title, summary, details, severity, effective_date, source_url)
            VALUES (:country_code, :title, :summary, :details, :severity, :effective_date, :source_url)
        ");

        $stmt->execute([
            ':country_code' => $data['country_code'] ?? null,
            ':title' => $data['title'],
            ':summary' => $data['summary'] ?? '',
            ':details' => $data['details'] ?? '',
            ':severity' => $data['severity'] ?? 'info',
            ':effective_date' => $data['effective_date'],
            ':source_url' => $data['source_url'] ?? null,
        ]);

        Response::json(['message' => 'Alert created', 'id' => $this->pdo->lastInsertId()], 201);
    }

    private function update(string $id): void
    {
        $this->checkPermission();

        $data = json_decode(file_get_contents('php://input'), true);

        $fields = [];
        $params = [':id' => $id];

        if (isset($data['country_code'])) { $fields[] = "country_code = :country_code"; $params[':country_code'] = $data['country_code']; }
        if (isset($data['title'])) { $fields[] = "title = :title"; $params[':title'] = $data['title']; }
        if (isset($data['summary'])) { $fields[] = "summary = :summary"; $params[':summary'] = $data['summary']; }
        if (isset($data['details'])) { $fields[] = "details = :details"; $params[':details'] = $data['details']; }
        if (isset($data['severity'])) { $fields[] = "severity = :severity"; $params[':severity'] = $data['severity']; }
        if (isset($data['effective_date'])) { $fields[] = "effective_date = :effective_date"; $params[':effective_date'] = $data['effective_date']; }
        if (isset($data['source_url'])) { $fields[] = "source_url = :source_url"; $params[':source_url'] = $data['source_url']; }

        if (empty($fields)) {
            Response::json(['message' => 'No changes provided']);
            return;
        }

        $sql = "UPDATE labor_law_alerts SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        Response::json(['message' => 'Alert updated']);
    }

    private function destroy(string $id): void
    {
        $this->checkPermission();

        $stmt = $this->pdo->prepare("DELETE FROM labor_law_alerts WHERE id = :id");
        $stmt->execute([':id' => $id]);

        Response::json(['message' => 'Alert deleted']);
    }

    private function checkPermission(): void
    {
        $user = Auth::user();
        // Only internal roles can manage alerts
        $allowedRoles = ['super_admin', 'admin', 'legal', 'support'];
        
        if (!in_array($user['platform_role'] ?? '', $allowedRoles)) {
            Response::error('Unauthorized', 403);
        }
    }
}
