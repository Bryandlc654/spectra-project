<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class LegalEntityController
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
            CREATE TABLE IF NOT EXISTS legal_entities (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                name VARCHAR(200) NOT NULL,
                registration_number VARCHAR(100),
                tax_id VARCHAR(100),
                address TEXT,
                country VARCHAR(100),
                city VARCHAR(100),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_company (company_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/legal-entities
        // /api/legal-entities/{id}

        $id = $segments[2] ?? null;

        if ($method === 'GET') {
            if ($id) {
                $this->show($id);
            } else {
                $this->index();
            }
        } elseif ($method === 'POST') {
            $this->store();
        } elseif ($method === 'PUT' && $id) {
            $this->update($id);
        } elseif ($method === 'DELETE' && $id) {
            $this->destroy($id);
        } else {
            Response::error('Método no soportado', 405);
        }
    }

    private function index(): void
    {
        $companyId = $_GET['company_id'] ?? null;
        if ($companyId) {
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
            $offset = ($page - 1) * $limit;

            $stmt = $this->pdo->prepare("
                SELECT * FROM legal_entities 
                WHERE company_id = :cid
                LIMIT :limit OFFSET :offset
            ");
            $stmt->bindValue(':cid', $companyId);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM legal_entities WHERE company_id = :cid");
            $countStmt->execute([':cid' => $companyId]);
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
            Response::error('company_id requerido', 400);
        }
    }

    private function show(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM legal_entities WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $entity = $stmt->fetch(PDO::FETCH_ASSOC);
        $entity ? Response::json($entity) : Response::error('Entidad legal no encontrada', 404);
    }

    private function store(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $this->pdo->prepare("
            INSERT INTO legal_entities (id, company_id, name, registration_number, tax_id, address, country, city)
            VALUES (UUID(), :cid, :name, :reg, :tax, :addr, :country, :city)
        ")->execute([
            ':cid' => $data['company_id'],
            ':name' => $data['name'],
            ':reg' => $data['registration_number'] ?? null,
            ':tax' => $data['tax_id'] ?? null,
            ':addr' => $data['address'] ?? null,
            ':country' => $data['country'] ?? null,
            ':city' => $data['city'] ?? null
        ]);
        Response::json(['message' => 'Entidad legal creada'], 201);
    }

    private function update(string $id): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $this->pdo->prepare("
            UPDATE legal_entities 
            SET name = :name, registration_number = :reg, tax_id = :tax, address = :addr, country = :country, city = :city
            WHERE id = :id
        ")->execute([
            ':name' => $data['name'],
            ':reg' => $data['registration_number'] ?? null,
            ':tax' => $data['tax_id'] ?? null,
            ':addr' => $data['address'] ?? null,
            ':country' => $data['country'] ?? null,
            ':city' => $data['city'] ?? null,
            ':id' => $id
        ]);
        Response::json(['message' => 'Entidad legal actualizada']);
    }

    private function destroy(string $id): void
    {
        $this->pdo->prepare("DELETE FROM legal_entities WHERE id LIKE :id")->execute([':id' => $id]);
        Response::json(['message' => 'Entidad legal eliminada']);
    }
}
