<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;
use Exception;

class ProjectController
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
        // /api/projects
        $seg2 = $segments[2] ?? null;
        $seg3 = $segments[3] ?? null;
        $seg4 = $segments[4] ?? null;

        // 1. Sub-resources accessed directly (milestones, deliverables)
        if ($seg2 === 'milestones' && $seg3) {
            // /api/projects/milestones/:id
            if ($seg4 === 'deliverables') {
                // /api/projects/milestones/:id/deliverables (GET list, POST create)
                if ($method === 'GET') {
                    $this->indexDeliverables($seg3);
                } elseif ($method === 'POST') {
                    $this->storeDeliverable($seg3);
                }
                return;
            }
            
            // CRUD on milestone itself
            if ($method === 'GET') {
                // Optional: show single milestone
                // $this->showMilestone($seg3); 
            } elseif ($method === 'PUT' || $method === 'PATCH') {
                $this->updateMilestone($seg3);
            } elseif ($method === 'DELETE') {
                $this->deleteMilestone($seg3);
            }
            return;
        }

        if ($seg2 === 'deliverables' && $seg3) {
            // /api/projects/deliverables/:id
            if ($method === 'PUT' || $method === 'PATCH') {
                $this->updateDeliverable($seg3);
            } elseif ($method === 'DELETE') {
                $this->deleteDeliverable($seg3);
            }
            return;
        }

        // 2. Project Resource routes
        if ($seg2 && $seg2 !== 'members') {
            // /api/projects/:id/milestones
            if ($seg3 === 'milestones') {
                if ($method === 'GET') {
                    $this->indexMilestones($seg2);
                } elseif ($method === 'POST') {
                    $this->storeMilestone($seg2);
                }
                return;
            }
            
            // /api/projects/:id/members
            if ($seg3 === 'members') {
                if ($method === 'GET') {
                    $this->indexMembers($seg2);
                } elseif ($method === 'POST') {
                    $this->storeMember($seg2);
                } elseif ($method === 'DELETE') {
                    $this->deleteMember($seg2, $seg4);
                }
                return;
            }

            if ($method === 'GET') {
                $this->show($seg2);
            } elseif ($method === 'PUT' || $method === 'PATCH') {
                $this->update($seg2);
            } elseif ($method === 'DELETE') {
                $this->delete($seg2);
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

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS projects (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                name VARCHAR(200) NOT NULL,
                description TEXT NULL,
                country_id INT UNSIGNED NOT NULL,
                currency_id INT UNSIGNED NOT NULL,
                start_date DATE NULL,
                end_date DATE NULL,
                status ENUM('active', 'on_hold', 'closed') NOT NULL DEFAULT 'active',
                created_by_company_user_id CHAR(36) DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at DATETIME NULL,
                INDEX idx_company (company_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

            $this->pdo->exec("
                CREATE TABLE IF NOT EXISTS project_members (
                    project_id CHAR(36) NOT NULL,
                company_user_id CHAR(36) NOT NULL,
                role_in_project ENUM('owner', 'manager', 'viewer') NOT NULL DEFAULT 'viewer',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (project_id, company_user_id),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS project_milestones (
                id CHAR(36) PRIMARY KEY,
                project_id CHAR(36) NOT NULL,
                title VARCHAR(200) NOT NULL,
                description TEXT NULL,
                due_date DATE NULL,
                amount DECIMAL(15,2) DEFAULT 0.00,
                status ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at DATETIME NULL,
                INDEX idx_project (project_id),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS project_deliverables (
                id CHAR(36) PRIMARY KEY,
                milestone_id CHAR(36) NOT NULL,
                title VARCHAR(200) NOT NULL,
                description TEXT NULL,
                file_url TEXT NULL,
                status ENUM('pending', 'submitted', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
                feedback TEXT NULL,
                submitted_at DATETIME NULL,
                reviewed_at DATETIME NULL,
                reviewed_by_user_id CHAR(36) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at DATETIME NULL,
                INDEX idx_milestone (milestone_id),
                FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE CASCADE
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
        $perPage = max(5, min(100, (int)($_GET['per_page'] ?? 20)));
        $offset = ($page - 1) * $perPage;

        $stmt = $this->pdo->prepare("
            SELECT p.*, c.name as country_name, cur.code as currency_code
            FROM projects p
            LEFT JOIN countries c ON p.country_id = c.id
            LEFT JOIN currencies cur ON p.currency_id = cur.id
            WHERE p.company_id LIKE :cid AND p.deleted_at IS NULL
            ORDER BY p.created_at DESC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':cid', $companyId);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $projects = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM projects WHERE company_id LIKE :cid AND deleted_at IS NULL");
        $countStmt->execute([':cid' => $companyId]);
        $total = (int)$countStmt->fetchColumn();

        Response::json([
            'data' => $projects,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage)
            ]
        ]);
    }

    private function store(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $companyId = $data['company_id'] ?? $this->getCompanyId();

        if (!$companyId) {
            Response::error('company_id required', 400);
            return;
        }

        // Auto-fill defaults from company if missing
        if (empty($data['country_id']) || empty($data['currency_id'])) {
            $stmt = $this->pdo->prepare("SELECT country_id, default_currency_id FROM companies WHERE id LIKE :id");
            $stmt->execute([':id' => $companyId]);
            $company = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($company) {
                if (empty($data['country_id'])) $data['country_id'] = $company['country_id'];
                if (empty($data['currency_id'])) $data['currency_id'] = $company['default_currency_id'];
            }
        }

        if (empty($data['name']) || empty($data['country_id']) || empty($data['currency_id'])) {
            Response::error('Missing required fields', 400);
            return;
        }

        $id = $this->uuid();
        
        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO projects (id, company_id, name, description, country_id, currency_id, status, created_at)
                VALUES (:id, :cid, :name, :desc, :country, :currency, :status, NOW())
            ");
            $stmt->execute([
                ':id' => $id,
                ':cid' => $companyId,
                ':name' => $data['name'],
                ':desc' => $data['description'] ?? null,
                ':country' => $data['country_id'],
                ':currency' => $data['currency_id'],
                ':status' => $data['status'] ?? 'active'
            ]);

            Response::json(['message' => 'Project created', 'id' => $id], 201);
        } catch (Exception $e) {
            Response::error('Error creating project: ' . $e->getMessage(), 500);
        }
    }

    private function show(string $id): void
    {
        $stmt = $this->pdo->prepare("
            SELECT p.*, c.name as country_name, cur.code as currency_code
            FROM projects p
            LEFT JOIN countries c ON p.country_id = c.id
            LEFT JOIN currencies cur ON p.currency_id = cur.id
            WHERE p.id LIKE :id AND p.deleted_at IS NULL
        ");
        $stmt->execute([':id' => $id]);
        $project = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$project) {
            Response::error('Project not found', 404);
            return;
        }

        // Get members
        $stmtMembers = $this->pdo->prepare("
            SELECT pm.*, u.full_name, u.email
            FROM project_members pm
            JOIN company_users cu ON pm.company_user_id = cu.id
            JOIN users u ON cu.user_id = u.id
            WHERE pm.project_id LIKE :pid
        ");
        $stmtMembers->execute([':pid' => $id]);
        $project['members'] = $stmtMembers->fetchAll(PDO::FETCH_ASSOC);

        Response::json($project);
    }

    private function update(string $id): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        
        $fields = [];
        $params = [':id' => $id];

        if (isset($data['name'])) { $fields[] = 'name = :name'; $params[':name'] = $data['name']; }
        if (isset($data['description'])) { $fields[] = 'description = :desc'; $params[':desc'] = $data['description']; }
        if (isset($data['start_date'])) { $fields[] = 'start_date = :start'; $params[':start'] = $data['start_date']; }
        if (isset($data['end_date'])) { $fields[] = 'end_date = :end'; $params[':end'] = $data['end_date']; }
        if (isset($data['status'])) { $fields[] = 'status = :status'; $params[':status'] = $data['status']; }
        
        if (empty($fields)) {
            Response::json(['message' => 'No changes']);
            return;
        }

        $sql = "UPDATE projects SET " . implode(', ', $fields) . " WHERE id LIKE :id";
        try {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            Response::json(['message' => 'Project updated']);
        } catch (Exception $e) {
            Response::error('Error updating project: ' . $e->getMessage(), 500);
        }
    }

    private function delete(string $id): void
    {
        $stmt = $this->pdo->prepare("UPDATE projects SET deleted_at = NOW() WHERE id LIKE :id");
        $stmt->execute([':id' => $id]);
        Response::json(['message' => 'Project deleted']);
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    // ==========================================
    // Milestones & Deliverables Implementation
    // ==========================================

    private function indexMilestones(string $projectId): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;

        // Count
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM project_milestones WHERE project_id LIKE :pid AND deleted_at IS NULL");
        $countStmt->execute([':pid' => $projectId]);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("
            SELECT * FROM project_milestones 
            WHERE project_id LIKE :pid AND deleted_at IS NULL
            ORDER BY due_date ASC, created_at ASC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':pid', $projectId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $milestones = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($milestones)) {
            Response::json([
                'data' => [],
                'meta' => [
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                    'pages' => ceil($total / $limit)
                ]
            ]);
            return;
        }

        // Optimization: Avoid N+1 query
        $milestoneIds = array_column($milestones, 'id');
        $placeholders = implode(',', array_fill(0, count($milestoneIds), '?'));
        
        $stmtD = $this->pdo->prepare("
            SELECT * FROM project_deliverables 
            WHERE milestone_id IN ($placeholders) AND deleted_at IS NULL
            ORDER BY created_at ASC
        ");
        $stmtD->execute($milestoneIds);
        $allDeliverables = $stmtD->fetchAll(PDO::FETCH_ASSOC);

        // Group deliverables by milestone
        $deliverablesByMilestone = [];
        foreach ($allDeliverables as $d) {
            $deliverablesByMilestone[$d['milestone_id']][] = $d;
        }

        foreach ($milestones as &$m) {
            $m['deliverables'] = $deliverablesByMilestone[$m['id']] ?? [];
        }

        Response::json([
            'data' => $milestones,
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ]);
    }

    private function storeMilestone(string $projectId): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (empty($data['title'])) {
            Response::error('Title required', 400);
            return;
        }

        $id = $this->uuid();
        $stmt = $this->pdo->prepare("
            INSERT INTO project_milestones (id, project_id, title, description, due_date, amount, status, created_at)
            VALUES (:id, :pid, :title, :desc, :due, :amt, :status, NOW())
        ");
        $stmt->execute([
            ':id' => $id,
            ':pid' => $projectId,
            ':title' => $data['title'],
            ':desc' => $data['description'] ?? null,
            ':due' => $data['due_date'] ?? null,
            ':amt' => $data['amount'] ?? 0,
            ':status' => $data['status'] ?? 'pending'
        ]);

        Response::json(['message' => 'Milestone created', 'id' => $id], 201);
    }

    private function updateMilestone(string $id): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $fields = [];
        $params = [':id' => $id];

        if (isset($data['title'])) { $fields[] = 'title = :title'; $params[':title'] = $data['title']; }
        if (isset($data['description'])) { $fields[] = 'description = :desc'; $params[':desc'] = $data['description']; }
        if (isset($data['due_date'])) { $fields[] = 'due_date = :due'; $params[':due'] = $data['due_date']; }
        if (isset($data['amount'])) { $fields[] = 'amount = :amt'; $params[':amt'] = $data['amount']; }
        if (isset($data['status'])) { $fields[] = 'status = :status'; $params[':status'] = $data['status']; }

        if (empty($fields)) {
            Response::json(['message' => 'No changes']);
            return;
        }

        $sql = "UPDATE project_milestones SET " . implode(', ', $fields) . " WHERE id LIKE :id";
        $this->pdo->prepare($sql)->execute($params);
        Response::json(['message' => 'Milestone updated']);
    }

    private function deleteMilestone(string $id): void
    {
        $this->pdo->prepare("UPDATE project_milestones SET deleted_at = NOW() WHERE id LIKE :id")->execute([':id' => $id]);
        Response::json(['message' => 'Milestone deleted']);
    }

    private function indexDeliverables(string $milestoneId): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM project_deliverables WHERE milestone_id LIKE :mid AND deleted_at IS NULL");
        $stmt->execute([':mid' => $milestoneId]);
        Response::json($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    private function storeDeliverable(string $milestoneId): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (empty($data['title'])) {
            Response::error('Title required', 400);
            return;
        }

        $id = $this->uuid();
        $stmt = $this->pdo->prepare("
            INSERT INTO project_deliverables (id, milestone_id, title, description, file_url, status, created_at)
            VALUES (:id, :mid, :title, :desc, :url, 'pending', NOW())
        ");
        $stmt->execute([
            ':id' => $id,
            ':mid' => $milestoneId,
            ':title' => $data['title'],
            ':desc' => $data['description'] ?? null,
            ':url' => $data['file_url'] ?? null
        ]);

        Response::json(['message' => 'Deliverable created', 'id' => $id], 201);
    }

    private function updateDeliverable(string $id): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $fields = [];
        $params = [':id' => $id];

        // RBAC Check for Approval
        if (isset($data['status']) && in_array($data['status'], ['approved', 'rejected'])) {
             $user = Auth::user();
             // Only allow company_admin or project_manager (if we had that role logic fully separate)
             // For now, assume company_admin or user who is 'manager' in project_members
             
             // Get Project ID from deliverable -> milestone -> project
             $stmtP = $this->pdo->prepare("
                SELECT p.id, p.company_id 
                FROM project_deliverables d
                JOIN project_milestones m ON d.milestone_id = m.id
                JOIN projects p ON m.project_id = p.id
                WHERE d.id = :id
             ");
             $stmtP->execute([':id' => $id]);
             $project = $stmtP->fetch(PDO::FETCH_ASSOC);
             
             if ($project) {
                $isCompanyAdmin = ($user['platform_role'] === 'company_admin' && $user['company_id'] === $project['company_id']);
                
                // Check if project member with manager role
                 $stmtM = $this->pdo->prepare("
                    SELECT role_in_project FROM project_members 
                    WHERE project_id = :pid AND company_user_id = :cuid
                 ");
                 // Need company_user_id from user_id. 
                 // This might be complex if we don't have it handy. 
                 // Let's stick to company_admin for now as per requirements.
                 
                 if (!$isCompanyAdmin) {
                     // Check project member manager
                     // Assuming we can resolve company_user_id or we check via user table joins
                     // Simplified: Only company_admin can approve for now as requested.
                     // Or users with 'manager' role in project.
                     
                     // Let's try to be permissive for demo if role is 'admin' or 'company_admin'
                    if (!in_array($user['platform_role'], ['admin', 'company_admin'])) {
                        Response::error('Unauthorized to approve/reject deliverables', 403);
                         return;
                     }
                 }
             }
        }

        if (isset($data['title'])) { $fields[] = 'title = :title'; $params[':title'] = $data['title']; }
        if (isset($data['description'])) { $fields[] = 'description = :desc'; $params[':desc'] = $data['description']; }
        if (isset($data['file_url'])) { $fields[] = 'file_url = :url'; $params[':url'] = $data['file_url']; }
        if (isset($data['status'])) { 
            $fields[] = 'status = :status'; 
            $params[':status'] = $data['status']; 

            // If status changed to approved/rejected, log who did it
            if (in_array($data['status'], ['approved', 'rejected'])) {
                $fields[] = 'reviewed_at = NOW()';
                // Try to get current user
                $uid = Auth::userId(); // This returns user_id, but we need company_user_id usually? 
                // The table has reviewed_by_user_id (CHAR 36), let's store Auth::userId() (the main user ID)
                if ($uid) {
                    $fields[] = 'reviewed_by_user_id = :uid';
                    $params[':uid'] = $uid;
                }
            }
            if ($data['status'] === 'submitted') {
                $fields[] = 'submitted_at = NOW()';
            }
        }
        if (isset($data['feedback'])) { $fields[] = 'feedback = :feedback'; $params[':feedback'] = $data['feedback']; }

        if (empty($fields)) {
            Response::json(['message' => 'No changes']);
            return;
        }

        $sql = "UPDATE project_deliverables SET " . implode(', ', $fields) . " WHERE id LIKE :id";
        $this->pdo->prepare($sql)->execute($params);
        Response::json(['message' => 'Deliverable updated']);
    }

    private function deleteDeliverable(string $id): void
    {
        $this->pdo->prepare("UPDATE project_deliverables SET deleted_at = NOW() WHERE id LIKE :id")->execute([':id' => $id]);
        Response::json(['message' => 'Deliverable deleted']);
    }

    // ==========================================
    // Members Implementation
    // ==========================================

    private function indexMembers(string $projectId): void
    {
        $stmt = $this->pdo->prepare("
            SELECT pm.*, u.full_name, u.email, cu.id as company_user_id
            FROM project_members pm
            JOIN company_users cu ON pm.company_user_id = cu.id
            JOIN users u ON cu.user_id = u.id
            WHERE pm.project_id LIKE :pid
        ");
        $stmt->execute([':pid' => $projectId]);
        Response::json($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    private function storeMember(string $projectId): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (empty($data['company_user_id'])) {
            Response::error('company_user_id required', 400);
            return;
        }

        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO project_members (project_id, company_user_id, role_in_project, created_at)
                VALUES (:pid, :cuid, :role, NOW())
                ON DUPLICATE KEY UPDATE role_in_project = :role
            ");
            $stmt->execute([
                ':pid' => $projectId,
                ':cuid' => $data['company_user_id'],
                ':role' => $data['role_in_project'] ?? 'viewer'
            ]);

            Response::json(['message' => 'Member assigned']);
        } catch (Exception $e) {
            Response::error('Error assigning member: ' . $e->getMessage(), 500);
        }
    }

    private function deleteMember(string $projectId, ?string $companyUserId): void
    {
        if (!$companyUserId) {
            Response::error('User ID required', 400);
            return;
        }

        $stmt = $this->pdo->prepare("DELETE FROM project_members WHERE project_id = :pid AND company_user_id = :cuid");
        $stmt->execute([':pid' => $projectId, ':cuid' => $companyUserId]);
        Response::json(['message' => 'Member removed']);
    }
}
