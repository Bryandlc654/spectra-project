<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class ImmigrationController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->ensureTables();
    }

    private function ensureTables(): void
    {
        // Visa Applications
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS visa_applications (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                country_id BIGINT UNSIGNED NOT NULL,
                type VARCHAR(50) NOT NULL, -- Work Permit, Residence, Business Visa
                status ENUM('pending', 'approved', 'rejected', 'info_needed') DEFAULT 'pending',
                expiry_date DATE NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user (user_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Immigration Documents
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS immigration_documents (
                id CHAR(36) PRIMARY KEY,
                application_id CHAR(36) NOT NULL,
                document_type VARCHAR(50) NOT NULL,
                file_path VARCHAR(255) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (application_id) REFERENCES visa_applications(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/immigration/visas
        // /api/immigration/visas/{id}
        // /api/immigration/documents

        $resource = $segments[2] ?? null;
        $id = $segments[3] ?? null;

        if (!$resource) {
            Response::error('Recurso no especificado (visas, documents)', 400);
            return;
        }

        switch ($resource) {
            case 'visas':
                $this->handleVisas($method, $id);
                break;
            case 'documents':
                $this->handleDocuments($method, $id);
                break;
            default:
                Response::error('Recurso inválido', 404);
        }
    }

    private function handleVisas(string $method, ?string $id): void
    {
        if ($method === 'GET') {
            if ($id) {
                $stmt = $this->pdo->prepare("SELECT * FROM visa_applications WHERE id = :id");
                $stmt->execute([':id' => $id]);
                $visa = $stmt->fetch(PDO::FETCH_ASSOC);
                $visa ? Response::json($visa) : Response::error('Visa no encontrada', 404);
            } else {
                $userId = $_GET['user_id'] ?? null;
                $page = max(1, (int)($_GET['page'] ?? 1));
                $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
                $offset = ($page - 1) * $limit;

                if ($userId) {
                    $stmt = $this->pdo->prepare("
                        SELECT * FROM visa_applications 
                        WHERE user_id = :uid 
                        LIMIT :limit OFFSET :offset
                    ");
                    $stmt->bindValue(':uid', $userId);
                    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                    $stmt->execute();
                    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

                    $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM visa_applications WHERE user_id = :uid");
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
                    // Admin view: list all
                    $stmt = $this->pdo->prepare("SELECT * FROM visa_applications LIMIT :limit OFFSET :offset");
                    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                    $stmt->execute();
                    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

                    $countStmt = $this->pdo->query("SELECT COUNT(*) FROM visa_applications");
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
            }
        } elseif ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            $this->pdo->prepare("
                INSERT INTO visa_applications (id, user_id, country_id, type, status, expiry_date)
                VALUES (UUID(), :uid, :country, :type, :status, :expiry)
            ")->execute([
                ':uid' => $data['user_id'],
                ':country' => $data['country_id'],
                ':type' => $data['type'],
                ':status' => $data['status'] ?? 'pending',
                ':expiry' => $data['expiry_date'] ?? null
            ]);
            Response::json(['message' => 'Solicitud de visa creada'], 201);
        } elseif ($method === 'PATCH' && $id) {
            $data = json_decode(file_get_contents('php://input'), true);
            $this->pdo->prepare("UPDATE visa_applications SET status = :status WHERE id LIKE :id")
                 ->execute([':status' => $data['status'], ':id' => $id]);
            Response::json(['message' => 'Estado de visa actualizado']);
        }
    }

    private function handleDocuments(string $method, ?string $id): void
    {
        // Simple attachment logic
        if ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            $this->pdo->prepare("
                INSERT INTO immigration_documents (id, application_id, document_type, file_path)
                VALUES (UUID(), :app_id, :type, :path)
            ")->execute([
                ':app_id' => $data['application_id'],
                ':type' => $data['document_type'],
                ':path' => $data['file_path']
            ]);
            Response::json(['message' => 'Documento adjuntado'], 201);
        }
    }
}
