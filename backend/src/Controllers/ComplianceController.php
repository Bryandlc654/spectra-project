<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class ComplianceController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function ensureTables(): void
    {
        // Patch: Ensure contract_templates has docusign_template_id for country-specific integration
        // This is a proactive fix for "Firmas Digitales Avanzadas" requirement
        try {
            $this->pdo->exec("ALTER TABLE contract_templates ADD COLUMN docusign_template_id VARCHAR(100) NULL AFTER variables_schema");
        } catch (\PDOException $e) {
            // Ignore if exists
        }

        // Compliance Requirements (Country-specific)
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS compliance_requirements (
                id CHAR(36) PRIMARY KEY,
                country_id INT NOT NULL,
                document_type VARCHAR(100) NOT NULL, -- e.g., 'passport', 'tax_residency_cert'
                is_mandatory BOOLEAN DEFAULT TRUE,
                description TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // User Compliance Documents
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS user_compliance_documents (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                requirement_id CHAR(36) NOT NULL,
                file_path VARCHAR(255) NOT NULL,
                status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
                expiry_date DATE NULL,
                rejection_reason TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (requirement_id) REFERENCES compliance_requirements(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/compliance/requirements
        // /api/compliance/documents

        $resource = $segments[2] ?? null;
        $id = $segments[3] ?? null;

        if ($resource === 'requirements') {
            $this->handleRequirements($method, $id);
        } elseif ($resource === 'documents') {
            $this->handleDocuments($method, $id);
        } else {
            Response::error('Resource not found', 404);
        }
    }

    private function handleRequirements(string $method, ?string $id): void
    {
        switch ($method) {
            case 'GET':
                if ($id) {
                    $this->showRequirement($id);
                } else {
                    $this->listRequirements();
                }
                break;
            case 'POST':
                // Admin only check could go here
                $this->storeRequirement();
                break;
            case 'PUT':
            case 'PATCH':
                if ($id) $this->updateRequirement($id);
                break;
            case 'DELETE':
                if ($id) $this->deleteRequirement($id);
                break;
            default:
                Response::error('Method not allowed', 405);
        }
    }

    private function listRequirements(): void
    {
        $countryId = $_GET['country_id'] ?? null;
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;
        
        // Auto-seed if empty for this country (Proactive Fix for Production)
        if ($countryId) {
            $checkStmt = $this->pdo->prepare("SELECT COUNT(*) FROM compliance_requirements WHERE country_id = ?");
            $checkStmt->execute([$countryId]);
            if ($checkStmt->fetchColumn() == 0) {
                $this->seedDefaults($countryId);
            }
        }

        $where = ["1=1"];
        $params = [];

        if ($countryId) {
            $where[] = "r.country_id = :country_id";
            $params[':country_id'] = $countryId;
        }

        $whereSql = implode(" AND ", $where);
        
        // Count
        $countSql = "SELECT COUNT(*) FROM compliance_requirements r JOIN countries c ON r.country_id = c.id WHERE $whereSql";
        $stmtCount = $this->pdo->prepare($countSql);
        foreach ($params as $k => $v) $stmtCount->bindValue($k, $v);
        $stmtCount->execute();
        $total = (int)$stmtCount->fetchColumn();

        // Fetch
        $sql = "SELECT r.*, c.name as country_name 
                FROM compliance_requirements r
                JOIN countries c ON r.country_id = c.id
                WHERE $whereSql
                ORDER BY c.name, r.document_type
                LIMIT :limit OFFSET :offset";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
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

    private function seedDefaults(string $countryId): void
    {
        // Get country code to know what to seed
        $stmt = $this->pdo->prepare("SELECT iso2 FROM countries WHERE id = ?");
        $stmt->execute([$countryId]);
        $iso = $stmt->fetchColumn();

        $defaults = [];
        if ($iso === 'PE') {
            $defaults = [
                ['DNI', 1, 'Documento Nacional de Identidad (Ambas caras)'],
                ['Antecedentes Policiales', 0, 'Certificado de Antecedentes Policiales (Vigencia 3 meses)'],
                ['Recibo de Servicios', 1, 'Recibo de Luz, Agua o Teléfono (Menor a 2 meses)']
            ];
        } elseif ($iso === 'US') {
            $defaults = [
                ['Passport', 1, 'Valid US Passport'],
                ['W-9 Form', 1, 'Request for Taxpayer Identification Number'],
                ['State ID', 0, 'Driver License or State ID']
            ];
        } else {
            // Generic fallback
            $defaults = [
                ['Passport / ID', 1, 'National ID or Passport'],
                ['Proof of Address', 1, 'Utility Bill or Bank Statement']
            ];
        }

        $insert = $this->pdo->prepare("INSERT INTO compliance_requirements (id, country_id, document_type, is_mandatory, description) VALUES (:id, :cid, :doc, :mand, :desc)");
        foreach ($defaults as $req) {
            $insert->execute([
                ':id' => \App\Support\Str::uuid(),
                ':cid' => $countryId,
                ':doc' => $req[0],
                ':mand' => $req[1],
                ':desc' => $req[2],
            ]);
        }
    }

    private function showRequirement(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM compliance_requirements WHERE id LIKE :id");
        $stmt->execute([':id' => $id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$item) {
            Response::error('Requirement not found', 404);
            return;
        }
        Response::json($item);
    }

    private function storeRequirement(): void
    {
        $input = json_decode(file_get_contents('php://input'), true);
        
        // Validation
        if (empty($input['country_id']) || empty($input['document_type'])) {
            Response::error('Missing required fields', 400);
            return;
        }

        $stmt = $this->pdo->prepare("
            INSERT INTO compliance_requirements (id, country_id, document_type, is_mandatory, description)
            VALUES (:id, :country_id, :document_type, :is_mandatory, :description)
        ");
        
        $stmt->execute([
            ':id' => \App\Support\Str::uuid(),
            ':country_id' => $input['country_id'],
            ':document_type' => $input['document_type'],
            ':is_mandatory' => $input['is_mandatory'] ?? 1,
            ':description' => $input['description'] ?? null
        ]);

        Response::json(['message' => 'Requirement created successfully'], 201);
    }

    private function updateRequirement(string $id): void
    {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $fields = [];
        $params = [':id' => $id];
        
        if (isset($input['document_type'])) {
            $fields[] = "document_type = :document_type";
            $params[':document_type'] = $input['document_type'];
        }
        if (isset($input['is_mandatory'])) {
            $fields[] = "is_mandatory = :is_mandatory";
            $params[':is_mandatory'] = $input['is_mandatory'];
        }
        if (isset($input['description'])) {
            $fields[] = "description = :description";
            $params[':description'] = $input['description'];
        }

        if (empty($fields)) {
            Response::json(['message' => 'No changes']);
            return;
        }

        $sql = "UPDATE compliance_requirements SET " . implode(', ', $fields) . " WHERE id LIKE :id";
        $this->pdo->prepare($sql)->execute($params);

        Response::json(['message' => 'Requirement updated successfully']);
    }

    private function deleteRequirement(string $id): void
    {
        $this->pdo->prepare("DELETE FROM compliance_requirements WHERE id = :id")->execute([':id' => $id]);
        Response::json(['message' => 'Requirement deleted successfully']);
    }

    private function handleDocuments(string $method, ?string $id): void
    {
        switch ($method) {
            case 'GET':
                $this->listDocuments();
                break;
            case 'POST':
                $this->uploadDocument();
                break;
            case 'PUT': // Update status (verify/reject)
                if ($id) $this->updateDocumentStatus($id);
                break;
            default:
                Response::error('Method not allowed', 405);
        }
    }

    private function listDocuments(): void
    {
        $currentUser = Auth::user();
        $isAdmin = in_array($currentUser['platform_role'], ['super_admin', 'admin', 'legal', 'support']);
        $userId = $_GET['user_id'] ?? null;

        if (!$isAdmin && $userId && $userId != $currentUser['id']) {
            Response::error('Unauthorized', 403);
            return;
        }

        // If not admin, always force user_id to be current user
        if (!$isAdmin && !$userId) {
            $userId = $currentUser['id'];
        }
        // If admin and no user_id provided, we list all (don't set userId)

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        $params = [];
        $whereConditions = ["1=1"];

        if ($userId) {
            $whereConditions[] = "d.user_id = :user_id";
            $params[':user_id'] = $userId;
        }

        // Status Filter
        $status = $_GET['status'] ?? null;
        if ($status && in_array($status, ['pending', 'verified', 'rejected'])) {
            $whereConditions[] = "d.status = :status";
            $params[':status'] = $status;
        }

        $whereSql = implode(" AND ", $whereConditions);

        // Count total
        $countSql = "SELECT COUNT(*) 
                     FROM user_compliance_documents d
                     JOIN compliance_requirements r ON d.requirement_id = r.id
                     JOIN countries c ON r.country_id = c.id
                     JOIN users u ON d.user_id = u.id
                     WHERE $whereSql";
        
        $stmtCount = $this->pdo->prepare($countSql);
        foreach ($params as $key => $val) {
            $stmtCount->bindValue($key, $val);
        }
        $stmtCount->execute();
        $total = $stmtCount->fetchColumn();

        // Fetch data
        $sql = "SELECT d.*, r.document_type, r.description, r.is_mandatory, c.name as country_name,
                       u.full_name, u.email
                FROM user_compliance_documents d
                JOIN compliance_requirements r ON d.requirement_id = r.id
                JOIN countries c ON r.country_id = c.id
                JOIN users u ON d.user_id = u.id
                WHERE $whereSql
                ORDER BY d.updated_at DESC
                LIMIT :limit OFFSET :offset";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $key => $val) {
            $stmt->bindValue($key, $val);
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

    private function uploadDocument(): void
    {
        // Handle file upload + DB entry
        if (empty($_POST['requirement_id']) || empty($_FILES['file'])) {
            Response::error('Missing requirement_id or file', 400);
            return;
        }

        $user = Auth::user();
        $requirementId = $_POST['requirement_id'];
        
        // Upload logic (simplified)
        $uploadDir = __DIR__ . '/../../public/uploads/compliance/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0777, true);
        
        $fileName = uniqid() . '_' . basename($_FILES['file']['name']);
        $targetPath = $uploadDir . $fileName;
        
        if (move_uploaded_file($_FILES['file']['tmp_name'], $targetPath)) {
            $webPath = '/uploads/compliance/' . $fileName;
            
            // Check if document already exists for this requirement, update it if so
            $stmt = $this->pdo->prepare("SELECT id FROM user_compliance_documents WHERE user_id = :uid AND requirement_id = :rid");
            $stmt->execute([':uid' => $user['id'], ':rid' => $requirementId]);
            $existing = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($existing) {
                $updateStmt = $this->pdo->prepare("
                    UPDATE user_compliance_documents 
                    SET file_path = :path, status = 'pending', updated_at = NOW() 
                    WHERE id = :id
                ");
                $updateStmt->execute([':path' => $webPath, ':id' => $existing['id']]);
            } else {
                $insertStmt = $this->pdo->prepare("
                    INSERT INTO user_compliance_documents (id, user_id, requirement_id, file_path, status)
                    VALUES (:id, :uid, :rid, :path, 'pending')
                ");
                $insertStmt->execute([
                    ':id' => \App\Support\Str::uuid(),
                    ':uid' => $user['id'],
                    ':rid' => $requirementId,
                    ':path' => $webPath
                ]);
            }
            
            Response::json(['message' => 'Document uploaded successfully', 'path' => $webPath]);
        } else {
            Response::error('Failed to upload file', 500);
        }
    }

    private function updateDocumentStatus(string $id): void
    {
        // Admin/Legal only
        $user = Auth::user();
        if (!in_array($user['platform_role'], ['super_admin', 'admin', 'legal', 'support'])) {
            Response::error('Unauthorized', 403);
            return;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $status = $input['status'] ?? null;
        
        if (!in_array($status, ['verified', 'rejected'])) {
            Response::error('Invalid status', 400);
            return;
        }

        $params = [':id' => $id, ':status' => $status];
        $sql = "UPDATE user_compliance_documents SET status = :status";
        
        if ($status === 'rejected' && !empty($input['reason'])) {
            $sql .= ", rejection_reason = :reason";
            $params[':reason'] = $input['reason'];
        }
        
        if (!empty($input['expiry_date'])) {
            $sql .= ", expiry_date = :expiry";
            $params[':expiry'] = $input['expiry_date'];
        }

        $sql .= " WHERE id LIKE :id";
        
        $this->pdo->prepare($sql)->execute($params);
        
        Response::json(['message' => 'Document status updated']);
    }
}
