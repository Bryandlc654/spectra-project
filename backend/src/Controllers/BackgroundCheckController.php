<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class BackgroundCheckController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS background_checks (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                candidate_email VARCHAR(191) NOT NULL,
                package VARCHAR(50) NOT NULL, -- standard, comprehensive, criminal
                status ENUM('pending', 'processing', 'clear', 'consider', 'canceled') DEFAULT 'pending',
                provider VARCHAR(50) DEFAULT 'Checkr_Simulated',
                eta DATETIME NULL,
                report_url VARCHAR(255) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user (user_id),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/background-checks
        // /api/background-checks/:id
        // /api/background-checks/simulate-webhook

        $id = $segments[2] ?? null;

        if ($id === 'simulate-webhook') {
            $this->simulateWebhook();
            return;
        }

        if ($method === 'GET') {
            if ($id) {
                $this->show($id);
            } else {
                $this->index();
            }
        } elseif ($method === 'POST') {
            $this->create();
        } elseif ($method === 'PUT' && $id) {
            // Maybe cancel?
        }
    }

    private function getCandidates(): void
    {
        $currentUser = Auth::user();
        $isCompanyAdmin = ($currentUser['platform_role'] ?? '') === 'company_admin';
        $isSuperAdmin = ($currentUser['platform_role'] ?? '') === 'super_admin';
        $companyId = $currentUser['company_id'] ?? null;

        $q = trim((string)($_GET['q'] ?? ''));
        $limit = max(1, min(50, (int)($_GET['limit'] ?? 10)));

        $sql = "SELECT id, full_name, email FROM users WHERE status = 'active'";
        $params = [];

        if (!$isSuperAdmin) {
            if ($isCompanyAdmin && $companyId) {
                $sql .= " AND EXISTS (SELECT 1 FROM company_users cu WHERE cu.user_id = users.id AND cu.company_id LIKE ? AND cu.status = 'active')";
                $params[] = $companyId;
            } else {
                $sql .= " AND id LIKE ?";
                $params[] = $currentUser['id'];
            }
        }

        if ($q !== '') {
            $sql .= " AND (full_name LIKE ? OR email LIKE ?)";
            $params[] = "%$q%";
            $params[] = "%$q%";
        }

        $sql .= " ORDER BY full_name ASC LIMIT ?";
        $params[] = $limit;
        
        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $i => $val) {
            $stmt->bindValue($i + 1, $val, is_int($val) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stmt->execute();
        Response::json($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    private function index(): void
    {
        $currentUser = Auth::user();
        $userId = $_GET['user_id'] ?? null;

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        $baseSql = "FROM background_checks bc 
                    LEFT JOIN users u ON bc.user_id = u.id 
                    WHERE 1=1";
        $params = [];

        // If not admin, can only see own checks (or checks requested for them)
        $isCompanyAdmin = ($currentUser['platform_role'] ?? '') === 'company_admin';
        $isSuperAdmin = ($currentUser['platform_role'] ?? '') === 'super_admin';
        
        if (!$isSuperAdmin) {
             // If company admin, filter by company users
             if ($isCompanyAdmin && isset($currentUser['company_id'])) {
                 $baseSql .= " AND bc.user_id IN (SELECT id FROM users WHERE company_id LIKE ?)";
                 $params[] = $currentUser['company_id'];
             } else {
                 // Regular user, only see own
                 $baseSql .= " AND bc.user_id LIKE ?";
                 $params[] = $currentUser['id'];
             }
        }

        if ($userId) {
            $baseSql .= " AND bc.user_id = ?";
            $params[] = $userId;
        }

        // Count
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) " . $baseSql);
        $countStmt->execute($params);
        $total = $countStmt->fetchColumn();

        // Fetch
        $sql = "SELECT bc.*, u.full_name as candidate_name " . $baseSql . " ORDER BY bc.created_at DESC LIMIT :limit OFFSET :offset";
        
        $stmt = $this->pdo->prepare($sql);
        // Bind params first
        foreach ($params as $i => $val) {
            $stmt->bindValue($i + 1, $val);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        Response::json([
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
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
        $stmt = $this->pdo->prepare("SELECT * FROM background_checks WHERE id LIKE ?");
        $stmt->execute([$id]);
        $check = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$check) Response::error('Background check not found', 404);
        
        Response::json($check);
    }

    private function create(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        
        $userId = $data['user_id'] ?? null;
        $package = $data['package'] ?? 'standard';
        
        if (!$userId) Response::error('User ID required', 400);

        // Fetch candidate email
        $stmt = $this->pdo->prepare("SELECT email FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $email = $stmt->fetchColumn();

        if (!$email) Response::error('User not found', 404);

        $id = \App\Support\Str::uuid();
        
        // Mock ETA: 3 days from now
        $eta = date('Y-m-d H:i:s', strtotime('+3 days'));

        $stmt = $this->pdo->prepare("
            INSERT INTO background_checks (id, user_id, candidate_email, package, status, provider, eta)
            VALUES (?, ?, ?, ?, 'pending', 'Checkr_Simulated', ?)
        ");
        
        $stmt->execute([$id, $userId, $email, $package, $eta]);
        
        // Simulate immediate "processing" status update (or we could wait for webhook)
        // Let's keep it pending, and use the simulate-webhook to advance it.

        Response::json([
            'message' => 'Background check requested',
            'id' => $id,
            'status' => 'pending',
            'eta' => $eta
        ], 201);
    }

    private function simulateWebhook(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $checkId = $data['check_id'] ?? null;
        $newStatus = $data['status'] ?? 'clear'; // clear, consider

        if (!$checkId) Response::error('Check ID required', 400);

        $reportUrl = "https://checkr-simulated.com/reports/" . $checkId;

        $stmt = $this->pdo->prepare("
            UPDATE background_checks 
            SET status = ?, report_url = ? 
            WHERE id LIKE ?
        ");
        $stmt->execute([$newStatus, $reportUrl, $checkId]);

        Response::json(['message' => 'Webhook simulated, status updated']);
    }
}
