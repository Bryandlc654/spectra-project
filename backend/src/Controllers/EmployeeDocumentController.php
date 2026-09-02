<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class EmployeeDocumentController
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
            CREATE TABLE IF NOT EXISTS employee_documents (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                title VARCHAR(200) NOT NULL,
                document_type VARCHAR(50) NOT NULL, -- contract, id, tax, etc.
                file_path VARCHAR(255) NOT NULL,
                expiry_date DATE NULL,
                status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
                uploaded_by VARCHAR(36) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user (user_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/employee-documents
        // /api/employee-documents/{id}

        $id = $segments[2] ?? null;

        if ($method === 'GET') {
            if ($id) {
                $this->show($id);
            } else {
                $this->index();
            }
        } elseif ($method === 'POST') {
            $this->store();
        } elseif ($method === 'DELETE' && $id) {
            $this->destroy($id);
        } else {
            Response::error('Método no soportado', 405);
        }
    }

    private function index(): void
    {
        $userId = $_GET['user_id'] ?? null;
        if (!$userId) {
            Response::error('user_id requerido para listar documentos', 400);
            return;
        }

        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM employee_documents WHERE user_id LIKE :uid");
        $countStmt->execute([':uid' => $userId]);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("SELECT * FROM employee_documents WHERE user_id LIKE :uid ORDER BY created_at DESC LIMIT :limit OFFSET :offset");
        $stmt->bindValue(':uid', $userId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

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

    private function show(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM employee_documents WHERE id LIKE :id");
        $stmt->execute([':id' => $id]);
        $doc = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$doc) {
            Response::error('Documento no encontrado', 404);
            return;
        }
        Response::json($doc);
    }

    private function store(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Simple validation
        if (empty($data['user_id']) || empty($data['title']) || empty($data['file_path'])) {
            Response::error('Faltan campos requeridos', 400);
            return;
        }

        $this->pdo->prepare("
            INSERT INTO employee_documents (id, user_id, title, document_type, file_path, expiry_date, uploaded_by)
            VALUES (UUID(), :uid, :title, :type, :path, :expiry, :uploader)
        ")->execute([
            ':uid' => $data['user_id'],
            ':title' => $data['title'],
            ':type' => $data['document_type'] ?? 'other',
            ':path' => $data['file_path'],
            ':expiry' => $data['expiry_date'] ?? null,
            ':uploader' => $data['uploaded_by'] ?? $data['user_id'] // Self-upload fallback
        ]);

        Response::json(['message' => 'Documento registrado correctamente'], 201);
    }

    private function destroy(string $id): void
    {
        $stmt = $this->pdo->prepare("DELETE FROM employee_documents WHERE id LIKE :id");
        $stmt->execute([':id' => $id]);
        Response::json(['message' => 'Documento eliminado']);
    }
}
