<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;
use Exception;

class VendorController
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
        $id = $segments[2] ?? null;

        if ($id) {
            if ($method === 'GET') $this->show($id);
            elseif ($method === 'PUT' || $method === 'PATCH') $this->update($id);
            elseif ($method === 'DELETE') $this->delete($id);
            else Response::error('Method not allowed', 405);
            return;
        }

        if ($method === 'GET') $this->index();
        elseif ($method === 'POST') $this->store();
        else Response::error('Method not allowed', 405);
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS vendors (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                name VARCHAR(200) NOT NULL,
                tax_id VARCHAR(50),
                contact_name VARCHAR(100),
                email VARCHAR(100),
                phone VARCHAR(50),
                address TEXT,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_company (company_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Lazy migrations for columns that might be missing
        try { $this->pdo->exec("ALTER TABLE vendors ADD COLUMN contact_name VARCHAR(100)"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE vendors ADD COLUMN email VARCHAR(100)"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE vendors ADD COLUMN phone VARCHAR(50)"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE vendors ADD COLUMN address TEXT"); } catch (\Throwable $e) {}
    }

    private function index(): void
    {
        $companyId = $this->getCompanyId();
        $role = Auth::user()['platform_role'] ?? '';
        $isPlatform = in_array($role, ['super_admin', 'admin', 'finance', 'legal'], true);
        if (!$companyId && !$isPlatform) { Response::error('company_id required', 400); return; }
        
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;

        $where = $companyId ? 'WHERE company_id = :cid' : '';
        $binds = $companyId ? [':cid' => $companyId] : [];

        // Count
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM vendors $where");
        $countStmt->execute($binds);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("SELECT * FROM vendors $where ORDER BY name ASC LIMIT :limit OFFSET :offset");
        foreach ($binds as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        Response::json([
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => ceil($total / $limit)
            ]
        ]);
    }

    private function store(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) { Response::error('Invalid JSON body', 400); return; }
        $companyId = $data['company_id'] ?? $this->getCompanyId();
        
        if (empty($data['name']) || !$companyId) { Response::error('Name and company_id required', 400); return; }
        
        $id = $this->uuid();
        $stmt = $this->pdo->prepare("
            INSERT INTO vendors (id, company_id, name, tax_id, contact_name, email, phone, address, status)
            VALUES (:id, :cid, :name, :tax, :contact, :email, :phone, :addr, 'active')
        ");
        $stmt->execute([
            ':id' => $id,
            ':cid' => $companyId,
            ':name' => $data['name'],
            ':tax' => $data['tax_id'] ?? null,
            ':contact' => $data['contact_name'] ?? null,
            ':email' => $data['email'] ?? null,
            ':phone' => $data['phone'] ?? null,
            ':addr' => $data['address'] ?? null
        ]);
        Response::json(['message' => 'Vendor created', 'id' => $id], 201);
    }

    private function show(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM vendors WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $vendor = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$vendor) { Response::error('Vendor not found', 404); return; }

        $companyId = $this->getCompanyId();
        if ($companyId && ($vendor['company_id'] ?? null) !== $companyId) {
            Response::error('Vendor not found', 404);
            return;
        }
        Response::json($vendor);
    }

    private function assertVendorInCompany(string $id): void
    {
        $companyId = $this->getCompanyId();
        if (!$companyId) return;
        $stmt = $this->pdo->prepare("SELECT company_id FROM vendors WHERE id LIKE :id");
        $stmt->execute([':id' => $id]);
        $owner = $stmt->fetchColumn();
        if ($owner !== false && $owner !== $companyId) {
            Response::error('Vendor not found', 404);
            exit;
        }
    }

    private function update(string $id): void
    {
        $this->assertVendorInCompany($id);
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) { Response::error('Invalid JSON body', 400); return; }
        
        if (empty($data['name'])) { Response::error('Name is required', 400); return; }

        $stmt = $this->pdo->prepare("
            UPDATE vendors 
            SET name = :name, 
                tax_id = :tax, 
                contact_name = :contact, 
                email = :email, 
                phone = :phone, 
                address = :addr,
                status = :status,
                updated_at = NOW()
            WHERE id = :id
        ");
        
        $stmt->execute([
            ':name' => $data['name'],
            ':tax' => $data['tax_id'] ?? null,
            ':contact' => $data['contact_name'] ?? null,
            ':email' => $data['email'] ?? null,
            ':phone' => $data['phone'] ?? null,
            ':addr' => $data['address'] ?? null,
            ':status' => $data['status'] ?? 'active',
            ':id' => $id
        ]);

        Response::json(['message' => 'Vendor updated']);
    }

    private function delete(string $id): void
    {
        $this->assertVendorInCompany($id);
        $stmt = $this->pdo->prepare("DELETE FROM vendors WHERE id LIKE :id");
        $stmt->execute([':id' => $id]);
        Response::json(['message' => 'Vendor deleted']);
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
