<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use App\Support\AuditLogger;
use PDO;

class GlobalContractController
{
    private PDO $pdo;
    private AuditLogger $audit;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->audit = new AuditLogger();
    }

    public function handle(string $method, ?string $id = null): void
    {
        $user = Auth::user();
        if (($user['platform_role'] ?? '') === 'support' && $id !== 'support-view') {
            Response::error('Acceso denegado', 403);
            return;
        }

        // /api/global-contracts/support-view
        if ($id === 'support-view') {
            if ($method === 'GET') {
                $this->supportViewIndex();
                return;
            }
            Response::error('Method not allowed', 405);
            return;
        }

        // /api/global-contracts/ensure-demo
        if ($id === 'ensure-demo') {
            if ($method === 'POST') {
                $this->ensureDemoContract();
                return;
            }
            Response::error('Method not allowed', 405);
            return;
        }

        if ($id === 'ensure-peru-demo') {
            if ($method === 'POST') {
                $this->ensurePeruDemoContract();
                return;
            }
            Response::error('Method not allowed', 405);
            return;
        }

        // Only allow GET for now (listing)
        if ($method === 'GET') {
            $this->index();
            return;
        }
        
        Response::error('Method not allowed', 405);
    }

    private function supportViewIndex(): void
    {
        $user = Auth::user();
        if (!in_array($user['platform_role'] ?? '', ['super_admin', 'support'])) {
            Response::error('Acceso denegado', 403);
            return;
        }

        $this->index(); // Reuse index logic for now, but strict role check passed
    }

    private function index(): void
    {
        try {
            // Check if contracts table exists
            $stmt = $this->pdo->query("SHOW TABLES LIKE 'contracts'");
            if ($stmt->rowCount() === 0) {
                Response::json([
                    'data' => [],
                    'meta' => [
                        'page' => 1,
                        'per_page' => 10,
                        'total' => 0,
                        'total_pages' => 1
                    ]
                ]);
                return;
            }

            $page = max(1, (int)($_GET['page'] ?? 1));
            $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 10)));
            $q = trim((string)($_GET['q'] ?? ''));
            $offset = ($page - 1) * $perPage;

            // Base query joining companies to show tenant name
            // Assuming contracts table has company_id
            
            $where = [];
            $params = [];

            if ($this->tableHasColumn('contracts', 'deleted_at')) {
                $where[] = 'c.deleted_at IS NULL';
            }

            if (!empty($_GET['status'])) {
                $where[] = 'c.status = :status';
                $params[':status'] = $_GET['status'];
            }

            if (!empty($_GET['freelancer_id'])) {
                $where[] = 'c.freelancer_id = :fid';
                $params[':fid'] = $_GET['freelancer_id'];
            }

            if ($q !== '') {
                $where[] = '(c.title LIKE :q OR comp.legal_name LIKE :q)';
                $params[':q'] = "%$q%";
            }

            $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

            // Count
            $sqlCount = "
                SELECT COUNT(*) 
                FROM contracts c 
                LEFT JOIN companies comp ON c.company_id = comp.id
                $whereSql
            ";
            
            $stmt = $this->pdo->prepare($sqlCount);
            $stmt->execute($params);
            $total = (int)$stmt->fetchColumn();

            // Fetch
            $sql = "
                SELECT c.*, comp.legal_name as company_name,
                       env.id as envelope_db_id, env.envelope_id as docusign_id, 
                       env.status as envelope_status, env.provider as envelope_provider
                FROM contracts c 
                LEFT JOIN companies comp ON c.company_id = comp.id
                LEFT JOIN docusign_envelopes env ON env.id = (
                    SELECT e.id FROM docusign_envelopes e
                    WHERE e.contract_id = c.id
                    ORDER BY e.created_at DESC, e.id DESC
                    LIMIT 1
                )
                $whereSql
                ORDER BY c.created_at DESC 
                LIMIT :limit OFFSET :offset
            ";
            
            $stmt = $this->pdo->prepare($sql);
            foreach ($params as $k => $v) $stmt->bindValue($k, $v);
            $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

            Response::json([
                'data' => $data,
                'meta' => [
                    'page' => $page,
                    'per_page' => $perPage,
                    'total' => $total,
                    'total_pages' => ceil($total / $perPage)
                ]
            ]);
        } catch (\Throwable $e) {
            Response::error('Error fetching global contracts: ' . $e->getMessage(), 500);
        }
    }

    private function tableHasColumn(string $table, string $column): bool
    {
        try {
            $stmt = $this->pdo->prepare("SHOW COLUMNS FROM `$table` LIKE '$column'");
            $stmt->execute();
            return $stmt->fetchColumn() !== false;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function ensureDemoContract(): void
    {
        $user = Auth::user();
        if (!in_array($user['platform_role'] ?? '', ['super_admin'])) {
            Response::error('Acceso denegado', 403);
            return;
        }

        try {
            // Ensure contracts table exists (minimal shape)
            $this->pdo->exec("
                CREATE TABLE IF NOT EXISTS contracts (
                    id CHAR(36) PRIMARY KEY,
                    company_id CHAR(36) NOT NULL,
                    freelancer_id CHAR(36) NULL,
                    template_id CHAR(36) NULL,
                    title VARCHAR(200) NOT NULL,
                    type ENUM('fixed', 'hourly', 'milestone', 'retainer', 'eor_employee') NOT NULL DEFAULT 'fixed',
                    status ENUM('draft', 'active', 'pending', 'expired', 'terminated') NOT NULL DEFAULT 'draft',
                    start_date DATE NOT NULL,
                    end_date DATE NULL,
                    currency_id INT NOT NULL,
                    rate DECIMAL(15, 2) DEFAULT 0,
                    payment_frequency VARCHAR(50) DEFAULT 'monthly',
                    scope_of_work TEXT NULL,
                    special_clause TEXT NULL,
                    notice_period INT DEFAULT 0,
                    country VARCHAR(2) NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at DATETIME NULL,
                    INDEX idx_company (company_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            $cnt = (int)$this->pdo->query("SELECT COUNT(*) FROM contracts")->fetchColumn();
            if ($cnt > 0) {
                Response::json(['message' => 'Ya existen contratos', 'total' => $cnt]);
                return;
            }

            // Get a company
            $companyId = $this->pdo->query("SELECT id FROM companies ORDER BY created_at ASC LIMIT 1")->fetchColumn();
            if (!$companyId) {
                Response::error('No hay tenants disponibles. Crea un tenant primero.', 409);
                return;
            }

            // Get a freelancer
            $freelancerId = $this->pdo->query("
                SELECT id FROM users 
                WHERE platform_role IN ('freelancer','freelance') 
                ORDER BY created_at ASC LIMIT 1
            ")->fetchColumn();
            if (!$freelancerId) {
                Response::error('No hay freelancers disponibles. Crea/invita un freelancer primero.', 409);
                return;
            }

            // Currency (fallback 1 if table empty or missing)
            $currencyId = (int)($this->pdo->query("SELECT id FROM currencies ORDER BY id ASC LIMIT 1")->fetchColumn() ?: 1);

            $id = $this->uuid();
            $today = date('Y-m-d');

            $stmt = $this->pdo->prepare("
                INSERT INTO contracts (
                    id, company_id, freelancer_id, title, type, status, 
                    start_date, currency_id, rate, created_at
                ) VALUES (
                    :id, :cid, :fid, :title, 'fixed', 'draft',
                    :start, :cur, :rate, NOW()
                )
            ");
            $stmt->execute([
                ':id' => $id,
                ':cid' => $companyId,
                ':fid' => $freelancerId,
                ':title' => 'Contrato inicial',
                ':start' => $today,
                ':cur' => $currencyId,
                ':rate' => 1000.00
            ]);

            try { $this->audit->log('tenant.contract.created', 'contract', $id, ['company_id' => $companyId]); } catch (\Throwable $e) {}

            Response::json(['message' => 'Contrato demo creado', 'id' => $id], 201);
        } catch (\Throwable $e) {
            Response::error('No se pudo crear contrato demo: ' . $e->getMessage(), 500);
        }
    }

    private function ensurePeruDemoContract(): void
    {
        $user = Auth::user();
        if (!in_array($user['platform_role'] ?? '', ['super_admin', 'admin'])) {
            Response::error('Acceso denegado', 403);
            return;
        }

        try {
            $this->pdo->exec("
                CREATE TABLE IF NOT EXISTS contracts (
                    id CHAR(36) PRIMARY KEY,
                    company_id CHAR(36) NOT NULL,
                    freelancer_id CHAR(36) NULL,
                    template_id CHAR(36) NULL,
                    title VARCHAR(200) NOT NULL,
                    type ENUM('fixed', 'hourly', 'milestone', 'retainer', 'eor_employee') NOT NULL DEFAULT 'fixed',
                    status ENUM('draft', 'active', 'pending', 'expired', 'terminated') NOT NULL DEFAULT 'draft',
                    start_date DATE NOT NULL,
                    end_date DATE NULL,
                    currency_id INT NOT NULL,
                    rate DECIMAL(15, 2) DEFAULT 0,
                    payment_frequency VARCHAR(50) DEFAULT 'monthly',
                    scope_of_work TEXT NULL,
                    special_clause TEXT NULL,
                    notice_period INT DEFAULT 0,
                    country VARCHAR(2) NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at DATETIME NULL,
                    INDEX idx_company (company_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            $companyStmt = $this->pdo->prepare("
                SELECT c.id, COALESCE(c.default_currency_id, 0) as currency_id
                FROM companies c
                JOIN countries co ON co.id = c.country_id
                WHERE co.iso2 = 'PE'
                ORDER BY c.created_at ASC
                LIMIT 1
            ");
            $companyStmt->execute();
            $company = $companyStmt->fetch(PDO::FETCH_ASSOC);

            if (!$company) {
                Response::error('No hay tenants peruanos disponibles. Crea un tenant de Perú primero.', 409);
                return;
            }

            $freelancerStmt = $this->pdo->prepare("
                SELECT u.id
                FROM users u
                LEFT JOIN freelancer_profiles fp ON fp.user_id = u.id
                WHERE (u.platform_role = 'freelancer' OR u.platform_role = 'freelance')
                  AND (
                      fp.country = 'Perú' OR fp.country = 'Peru' OR UPPER(u.nationality) = 'PE'
                  )
                ORDER BY u.created_at ASC
                LIMIT 1
            ");
            $freelancerStmt->execute();
            $freelancerId = $freelancerStmt->fetchColumn();

            if (!$freelancerId) {
                Response::error('No hay freelancers peruanos disponibles. Crea un freelancer de Perú primero.', 409);
                return;
            }

            $existsStmt = $this->pdo->prepare("
                SELECT id FROM contracts
                WHERE company_id = :cid AND freelancer_id = :fid
                LIMIT 1
            ");
            $existsStmt->execute([
                ':cid' => $company['id'],
                ':fid' => $freelancerId
            ]);
            $existingId = $existsStmt->fetchColumn();

            if ($existingId) {
                Response::json(['message' => 'Ya existe un contrato para este tenant peruano y freelancer', 'id' => $existingId]);
                return;
            }

            $currencyId = (int)$company['currency_id'];
            if ($currencyId <= 0) {
                $currencyId = (int)($this->pdo->query("SELECT id FROM currencies ORDER BY id ASC LIMIT 1")->fetchColumn() ?: 1);
            }

            $id = $this->uuid();
            $today = date('Y-m-d');

            $stmt = $this->pdo->prepare("
                INSERT INTO contracts (
                    id, company_id, freelancer_id, title, type, status,
                    start_date, currency_id, rate, created_at
                ) VALUES (
                    :id, :cid, :fid, :title, 'fixed', 'draft',
                    :start, :cur, :rate, NOW()
                )
            ");
            $stmt->execute([
                ':id' => $id,
                ':cid' => $company['id'],
                ':fid' => $freelancerId,
                ':title' => 'Contrato demo Perú',
                ':start' => $today,
                ':cur' => $currencyId,
                ':rate' => 1000.00
            ]);

            try {
                $this->audit->log('tenant.contract.created', 'contract', $id, ['company_id' => $company['id']]);
            } catch (\Throwable $e) {
            }

            Response::json(['message' => 'Contrato demo Perú creado', 'id' => $id], 201);
        } catch (\Throwable $e) {
            Response::error('No se pudo crear contrato demo Perú: ' . $e->getMessage(), 500);
        }
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
