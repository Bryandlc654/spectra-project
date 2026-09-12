<?php

namespace App\Controllers;

use App\Database;
use App\Support\Auth;
use App\Support\Cache;
use App\Support\Response;
use App\Support\SMTP;
use App\Support\TaxEngine;
use App\Support\Str;
use Dompdf\Dompdf;
use PDO;
use Throwable;

final class TenantController
{
    private PDO $pdo;
    private Database $database;

    /** @var array<string, array<int, string>> */
    private array $columnsCache = [];

    public function __construct(Database $database)
    {
        $this->database = $database;
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS companies (
                id VARCHAR(36) PRIMARY KEY,
                legal_name VARCHAR(255) NOT NULL,
                trade_name VARCHAR(255) NULL,
                country_id INT NULL,
                default_currency_id INT NULL,
                timezone_id INT NULL,
                status VARCHAR(50) DEFAULT 'active',
                logo_url VARCHAR(255) NULL,
                read_only_mode BOOLEAN DEFAULT FALSE,
                deleted_at DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (status),
                INDEX (deleted_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS currencies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(10) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                symbol VARCHAR(10) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS timezones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS wallets (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL UNIQUE,
                currency_id INT NOT NULL,
                balance DECIMAL(15,2) DEFAULT 0.00,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS company_settings (
                company_id CHAR(36) PRIMARY KEY,
                default_language VARCHAR(10) DEFAULT 'es',
                tax_id VARCHAR(50) NULL,
                read_only_mode BOOLEAN DEFAULT FALSE,
                unpaid_leave_days_allowed INT DEFAULT 0,
                invoice_series VARCHAR(20) NULL,
                invoice_number_next INT DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        try { $this->pdo->exec("ALTER TABLE company_settings ADD COLUMN read_only_mode BOOLEAN DEFAULT FALSE AFTER tax_id"); } catch (\Throwable $e) {}

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS company_users (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                status VARCHAR(50) DEFAULT 'active',
                job_title VARCHAR(255) NULL,
                department VARCHAR(100) NULL,
                active_company BOOLEAN DEFAULT FALSE,
                deleted_at DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (company_id),
                INDEX (user_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        try { $this->pdo->exec("ALTER TABLE company_users ADD COLUMN active_company BOOLEAN DEFAULT FALSE AFTER department"); } catch (\Throwable $e) {}

        $this->ensureCompanySubscriptionsTable();
        $this->ensureCompanyFeeRulesTable();
        $this->ensurePayrollsTable();
        $this->ensureWalletTransactionsTable();
        $this->ensureAmendmentsTable();
        $this->ensureContractsTable();
        $this->ensureContractLegalObservationsTable();
        $this->ensureProjectsTable();
        $this->ensureContractTemplatesTable();
        $this->ensureInvoicesTable();
    }

    /**
     * GET    /api/tenants
     * POST   /api/tenants
     * GET    /api/tenants/{id}
     * PUT    /api/tenants/{id}
     * PATCH  /api/tenants/{id}
     *
     * POST   /api/tenants/{id}/suspend
     * POST   /api/tenants/{id}/activate
     *
     * GET    /api/tenants/{id}/settings
     * PUT    /api/tenants/{id}/settings
     *
     * GET    /api/tenants/{id}/contacts
     * POST   /api/tenants/{id}/contacts
     * PUT    /api/tenants/{id}/contacts/{contactId}
     * DELETE /api/tenants/{id}/contacts/{contactId}
     *
     * GET    /api/tenants/{id}/wallet
     * GET    /api/tenants/{id}/invoices
     * GET    /api/tenants/{id}/payroll
     * GET    /api/tenants/{id}/projects
     * GET    /api/tenants/{id}/contracts
     *
     * POST   /api/tenants/{id}/impersonate
     */
    public function handle(array $segments, string $method): void
    {
        try {
            // segments: ["api","tenants", ...]
            $tenantId = $segments[2] ?? null;
            $sub = $segments[3] ?? null;
            $subId = $segments[4] ?? null;

            $user = Auth::user();
            $role = $user['platform_role'] ?? '';
            $isAdmin = in_array($role, ['super_admin', 'admin'], true);
            $isSupportView = ($role === 'support' && $tenantId === 'support-view');
            if (!$isAdmin && !$isSupportView) {
                Response::error('Acceso denegado: se requieren privilegios de administrador', 403);
                return;
            }

            // Normalización retroactiva de status fuera de whitelist (legacy)
            try {
                $stmtSt = $this->pdo->prepare("SELECT COUNT(*) FROM companies WHERE status NOT IN ('active','suspended') AND deleted_at IS NULL");
                $stmtSt->execute();
                if ((int)$stmtSt->fetchColumn() > 0) {
                    $this->pdo->exec("UPDATE companies SET status = 'active' WHERE status NOT IN ('active','suspended') AND deleted_at IS NULL");
                }
            } catch (\Throwable $e) {}

            if ($tenantId === 'wizard') {
                if ($method === 'POST') { $this->wizard(); return; }
                Response::error('Método no permitido', 405);
                return;
            }

            if ($tenantId === 'export') {
                if ($method === 'GET') { $this->exportList(); return; }
                Response::error('Método no permitido', 405);
                return;
            }

            if ($tenantId === 'create') {
                if ($method === 'POST') { $this->store(); return; }
                Response::error('Método no permitido', 405);
                return;
            }

            if ($tenantId === 'support-view') {
                if ($method === 'GET') { $this->supportViewIndex(); return; }
                Response::error('Método no permitido', 405);
                return;
            }

            if ($tenantId === 'subscription') {
                $subSubscription = $segments[3] ?? null;
                if ($subSubscription === 'stats' && $method === 'GET') { $this->subscriptionStats(); return; }
                if ($method === 'GET') { $this->subscriptionsIndex(); return; }
                Response::error('Método no permitido', 405);
                return;
            }

            if ($tenantId === null || $tenantId === '') {
                if ($method === 'GET') { $this->index(); return; }
                if ($method === 'POST') { $this->store(); return; }
                Response::error('Método no permitido', 405);
                return;
            }

            // Enforce Company Status & Read Only Mode
            if ($method !== 'GET') {
                $allowedActions = ['activate', 'suspend', 'readonly', 'impersonate', 'settings'];
                if (!in_array($sub, $allowedActions, true)) {
                    $stmtStatus = $this->pdo->prepare("SELECT status, read_only_mode FROM companies WHERE id = :id LIMIT 1");
                    $stmtStatus->execute([':id' => $tenantId]);
                    $companyStatus = $stmtStatus->fetch(PDO::FETCH_ASSOC);

                    if ($companyStatus) {
                        if ($companyStatus['status'] === 'suspended') {
                            Response::error('La empresa está suspendida. Acceso restringido.', 403);
                            return;
                        }
                        if ((int)($companyStatus['read_only_mode'] ?? 0) === 1) {
                            Response::error('Acción inhabilitada: Modo Solo Lectura', 423, [
                                'code' => 'read_only',
                                'hint' => 'Desactiva el modo desde Configuración del Tenant para operaciones de escritura'
                            ]);
                            return;
                        }
                    }
                }
            }

            // /api/tenants/{id}
            if ($sub === null || $sub === '') {
                if ($method === 'GET') { $this->show($tenantId); return; }
                if ($method === 'PUT' || $method === 'PATCH') { $this->update($tenantId); return; }
                if ($method === 'DELETE') { $this->destroy($tenantId); return; }
                Response::error('Método no permitido', 405);
                return;
            }

            // Stats
            if ($sub === 'stats' && $method === 'GET') { $this->getStats($tenantId); return; }

            // Acciones / subrecursos
            if ($sub === 'suspend' && $method === 'POST') { $this->suspend($tenantId); return; }
            if ($sub === 'activate' && $method === 'POST') { $this->activate($tenantId); return; }
            if ($sub === 'subscription') {
                if ($method === 'GET') { $this->getSubscription($tenantId); return; }
                if ($method === 'POST' || $method === 'PUT') { $this->updateSubscription($tenantId); return; }
                Response::error('Método no permitido', 405);
                return;
            }

            if ($sub === 'settings') {
                if ($method === 'GET') { $this->getSettings($tenantId); return; }
                if ($method === 'PUT' || $method === 'PATCH') { $this->updateSettings($tenantId); return; }
                Response::error('Método no permitido', 405);
                return;
            }

            if ($sub === 'members') {
                if ($subId === 'invite' && $method === 'POST') {
                    $this->membersInvite($tenantId);
                    return;
                }

                if ($subId === null) {
                    if ($method === 'GET') { $this->membersIndex($tenantId); return; }
                    if ($method === 'POST') { $this->membersStore($tenantId); return; }
                    Response::error('Método no permitido', 405);
                    return;
                }
                
                // Actions
                $action = $segments[5] ?? null;
                if ($action === 'resend-invite' && $method === 'POST') { $this->membersResendInvite($tenantId, $subId); return; }
                if ($action === 'toggle-access' && $method === 'POST') { $this->membersToggleAccess($tenantId, $subId); return; }
                if ($action === 'reset-role' && $method === 'POST') { $this->membersResetRole($tenantId, $subId); return; }
                if ($action === 'force-password-reset' && $method === 'POST') { $this->membersForcePasswordReset($tenantId, $subId); return; }
                
                if ($method === 'DELETE') { $this->membersDestroy($tenantId, $subId); return; }
                
                Response::error('Método no permitido', 405);
                return;
            }

            // Approval Policies
            if ($sub === 'approval-policies') {
                 if ($subId === null) {
                    if ($method === 'GET') { $this->approvalsList($tenantId); return; }
                 } else {
                     $action = $segments[5] ?? null;
                     if ($action === 'toggle' && $method === 'PUT') {
                         $this->approvalsToggle($tenantId, $subId);
                         return;
                     }
                 }
                 Response::error('Método no permitido', 405);
                 return;
            }
            if ($sub === 'approval-simulate' && $method === 'POST') {
                $this->approvalsSimulate($tenantId);
                return;
            }

            if ($sub === 'logs' && $method === 'GET') { $this->logsIndex($tenantId); return; }

            if ($sub === 'contacts') {
                if ($subId === null) {
                    if ($method === 'GET') { $this->contactsIndex($tenantId); return; }
                    if ($method === 'POST') { $this->contactsStore($tenantId); return; }
                    Response::error('Método no permitido', 405);
                    return;
                }
                if ($method === 'PUT' || $method === 'PATCH') { $this->contactsUpdate($tenantId, $subId); return; }
                if ($method === 'DELETE') { $this->contactsDestroy($tenantId, $subId); return; }
                Response::error('Método no permitido', 405);
                return;
            }

            if ($sub === 'wallet') {
                if ($method === 'GET') { $this->walletShow($tenantId); return; }
                if ($method === 'POST') { $this->walletDeposit($tenantId); return; }
                Response::error('Método no permitido', 405);
                return;
            }
            if ($sub === 'export' && $method === 'GET') { $this->exportData($tenantId); return; }
            
            if ($sub === 'kyb') {
                if ($method === 'GET') { $this->kybShow($tenantId); return; }
                
                // kyb/documents
                if ($subId === 'documents' && $method === 'POST') { $this->kybUploadDocument($tenantId); return; }
                
                // kyb/submit
                if ($subId === 'submit' && $method === 'POST') { $this->kybSubmit($tenantId); return; }

                Response::error('Método no permitido', 405);
                return;
            }

            if ($sub === 'invoices') {
                if ($subId === null) {
                    if ($method === 'GET') { $this->invoicesIndex($tenantId); return; }
                    if ($method === 'POST') { $this->invoicesStore($tenantId); return; }
                } else {
                    if ($method === 'GET') { $this->invoicesShow($tenantId, $subId); return; }
                    if ($method === 'PUT') { $this->invoicesUpdate($tenantId, $subId); return; }
                    if ($method === 'DELETE') { $this->invoicesDestroy($tenantId, $subId); return; }
                    
                    $action = $segments[5] ?? null;
                    if ($action === 'pay' && $method === 'POST') { $this->invoicesPay($tenantId, $subId); return; }
                    if ($action === 'pdf' && $method === 'GET') { $this->invoicesPdf($tenantId, $subId); return; }
                    if ($action === 'send' && $method === 'POST') { $this->invoicesSend($tenantId, $subId); return; }
                    if ($action === 'attachment') {
                        if ($method === 'POST') { $this->invoicesUploadAttachment($tenantId, $subId); return; }
                        if ($method === 'GET') { $this->invoicesAttachmentInfo($tenantId, $subId); return; }
                        if ($method === 'DELETE') { $this->invoicesDeleteAttachment($tenantId, $subId); return; }
                    }
                }
                Response::error('Método no permitido', 405);
                return;
            }
            if ($sub === 'payroll') {
                if ($subId === null) {
                    if ($method === 'GET') { $this->payrollIndex($tenantId); return; }
                    if ($method === 'POST') { $this->payrollStore($tenantId); return; }
                } else {
                    $action = $segments[5] ?? null;
                    if ($action === 'pay' && $method === 'POST') {
                        $this->payrollPay($tenantId, $subId);
                        return;
                    }
                }
                Response::error('Método no permitido', 405);
                return;
            }

            if ($sub === 'projects' && $method === 'GET') { $this->projectsIndex($tenantId); return; }

            if ($sub === 'integrations') {
                $controller = new \App\Controllers\IntegrationController($this->database);
                $controller->handle($method, ['company_id' => $tenantId]);
                return;
            }
            if ($sub === 'contracts') {
                // Special case for export-legal which looks like an ID but is an action on the collection
                if ($subId === 'export-legal' && $method === 'GET') {
                    $this->contractsExportLegal($tenantId);
                    return;
                }

                if ($subId === null) {
                    if ($method === 'GET') {
                         $this->contractsIndex($tenantId); 
                         return; 
                    }
                    if ($method === 'POST') { $this->contractsStore($tenantId); return; }
                } else {
                    if ($method === 'PUT' || $method === 'PATCH') { $this->contractsUpdate($tenantId, $subId); return; }
                    
                    $action = $segments[5] ?? null;
            if ($action === 'terminate' && $method === 'POST') {
              $this->contractsTerminate($tenantId, $subId);
              return;
            }
            if ($action === 'amend' && $method === 'POST') {
              $this->contractsAmend($tenantId, $subId);
              return;
            }
            if ($action === 'amendments' && $method === 'GET') {
              $this->contractsAmendmentsList($tenantId, $subId);
              return;
            }
            if ($action === 'assign-legal' && $method === 'POST') {
              $this->contractsAssignLegal($tenantId, $subId);
              return;
            }
            if ($action === 'legal-review' && $method === 'POST') {
              $this->contractsLegalReview($tenantId, $subId);
              return;
            }
            if ($action === 'legal-observations' && $method === 'GET') {
              $this->contractsLegalObservations($tenantId, $subId);
              return;
            }
                }
                Response::error('Método no permitido', 405);
                return;
            }

            if ($sub === 'contract-templates') {
                if ($subId === null) {
                    if ($method === 'GET') { $this->contractTemplatesIndex($tenantId); return; }
                    if ($method === 'POST') { $this->contractTemplatesStore($tenantId); return; }
                } else {
                    if ($method === 'GET') { $this->contractTemplatesShow($tenantId, $subId); return; }
                    if ($method === 'PUT' || $method === 'PATCH') { $this->contractTemplatesUpdate($tenantId, $subId); return; }
                    if ($method === 'DELETE') { $this->contractTemplatesDestroy($tenantId, $subId); return; }
                }
                Response::error('Método no permitido', 405);
                return;
            }

            if ($sub === 'impersonate' && $method === 'POST') { $this->impersonate($tenantId); return; }

            Response::error('Ruta no encontrada', 404);
            return;
        } catch (Throwable $e) {
            Response::error('Error interno', 500, [
                'message' => $e->getMessage(),
            ]);
        }
    }

    /* =========================
       TENANTS CRUD
       ========================= */

    private function index(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
            $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 50)));
            $q = trim((string)($_GET['q'] ?? ''));
        $status = trim((string)($_GET['status'] ?? ''));
        $countryId = (int)($_GET['country_id'] ?? 0);
        $date = trim((string)($_GET['date'] ?? ''));

        $where = ['c.deleted_at IS NULL'];
        $params = [];

        if ($status !== '' && in_array($status, ['active', 'suspended'], true)) {
            $where[] = 'c.status = :status';
            $params[':status'] = $status;
        }

        if ($countryId > 0) {
            $where[] = 'c.country_id = :country_id';
            $params[':country_id'] = $countryId;
        }

        if ($date !== '') {
            $where[] = 'DATE(c.created_at) = :date';
            $params[':date'] = $date;
        }

        if ($q !== '') {
            $where[] = '(c.legal_name LIKE :q1 OR c.trade_name LIKE :q2 OR c.id LIKE :q3)';
            $params[':q1'] = '%' . $q . '%';
            $params[':q2'] = '%' . $q . '%';
            $params[':q3'] = '%' . $q . '%';
        }

        $whereSql = implode(' AND ', $where);

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM companies c WHERE {$whereSql}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;

        // JOINs para devolver datos reales (no solo ids)
        $sql = "
            SELECT
                c.id,
                c.legal_name,
                c.trade_name,
                c.country_id,
                c.default_currency_id,
                c.timezone_id,
                c.status,
                c.created_at,

                co.iso2 AS country_iso2,
                co.name AS country_name,

                cu.code AS currency_code,
                cu.name AS currency_name,
                cu.symbol AS currency_symbol,

                tz.name AS timezone_name,

                cs.default_language,
                w.balance AS wallet_balance,
                w.currency_id AS wallet_currency_id,

                (SELECT COUNT(*) FROM company_users cu2 WHERE cu2.company_id = c.id AND cu2.deleted_at IS NULL) as users_count,
                
                (SELECT u.full_name 
                 FROM company_users cu3 
                 JOIN users u ON u.id = cu3.user_id 
                 WHERE cu3.company_id = c.id AND cu3.job_title = 'Company Admin' 
                 LIMIT 1) as owner_name

            FROM companies c
            LEFT JOIN countries co ON co.id = c.country_id
            LEFT JOIN currencies cu ON cu.id = c.default_currency_id
            LEFT JOIN timezones tz ON tz.id = c.timezone_id
            LEFT JOIN company_settings cs ON cs.company_id = c.id
            LEFT JOIN wallets w ON w.company_id = c.id

            WHERE {$whereSql}
            ORDER BY c.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $totalPages = max(1, (int)ceil($total / max(1, $perPage)));

        // Normaliza salida para el front (country/currency/timezone como objetos)
        $items = array_map(function (array $r) {
            return [
                'id' => $r['id'],
                'legal_name' => $r['legal_name'],
                'trade_name' => $r['trade_name'],
                'country_id' => $r['country_id'],
                'default_currency_id' => $r['default_currency_id'],
                'timezone_id' => $r['timezone_id'],
                'status' => $r['status'],
                'created_at' => $r['created_at'],
                'logo_url' => $r['logo_url'] ?? null,

                'country' => $r['country_id'] ? [
                    'id' => (int)$r['country_id'],
                    'iso2' => $r['country_iso2'] ?? null,
                    'name' => $r['country_name'] ?? null,
                ] : null,

                'currency' => $r['default_currency_id'] ? [
                    'id' => (int)$r['default_currency_id'],
                    'code' => $r['currency_code'] ?? null,
                    'name' => $r['currency_name'] ?? null,
                    'symbol' => $r['currency_symbol'] ?? null,
                ] : null,

                'timezone' => $r['timezone_id'] ? [
                    'id' => (int)$r['timezone_id'],
                    'name' => $r['timezone_name'] ?? null,
                ] : null,

                'settings' => [
                    'default_language' => $r['default_language'] ?? null,
                ],

                'wallet' => [
                    'balance' => $r['wallet_balance'] ?? null,
                    'currency_id' => $r['wallet_currency_id'] ?? null,
                ],

                'stats' => [
                    'users_count' => (int)($r['users_count'] ?? 0),
                    'freelancers_count' => 0, 
                ],

                'owner' => $r['owner_name'] ? ['name' => $r['owner_name']] : null,
            ];
        }, $rows);

        Response::json([
            'data' => $items,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => $totalPages,
            ],
        ]);
    }

    private function exportList(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 100)));
        $offset = ($page - 1) * $limit;

        $q = trim((string)($_GET['q'] ?? ''));
        $status = trim((string)($_GET['status'] ?? ''));
        $countryId = (int)($_GET['country_id'] ?? 0);
        $date = trim((string)($_GET['date'] ?? ''));

        $where = ['c.deleted_at IS NULL'];
        $params = [];

        if ($status !== '' && in_array($status, ['active', 'suspended'], true)) {
            $where[] = 'c.status = :status';
            $params[':status'] = $status;
        }

        if ($countryId > 0) {
            $where[] = 'c.country_id = :country_id';
            $params[':country_id'] = $countryId;
        }

        if ($date !== '') {
            $where[] = 'DATE(c.created_at) = :date';
            $params[':date'] = $date;
        }

        if ($q !== '') {
            $where[] = '(c.legal_name LIKE :q1 OR c.trade_name LIKE :q2 OR c.id LIKE :q3)';
            $params[':q1'] = '%' . $q . '%';
            $params[':q2'] = '%' . $q . '%';
            $params[':q3'] = '%' . $q . '%';
        }

        $whereSql = implode(' AND ', $where);

        $sql = "
            SELECT
                c.legal_name,
                c.trade_name,
                c.status,
                c.created_at,
                co.name AS country_name,
                cu.code AS currency_code,
                tz.name AS timezone_name,
                (SELECT COUNT(*) FROM company_users cu2 WHERE cu2.company_id = c.id AND cu2.deleted_at IS NULL) as users_count
            FROM companies c
            LEFT JOIN countries co ON co.id = c.country_id
            LEFT JOIN currencies cu ON cu.id = c.default_currency_id
            LEFT JOIN timezones tz ON tz.id = c.timezone_id
            WHERE {$whereSql}
            ORDER BY c.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        // Use fetch loop to save memory
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="empresas_export_p' . $page . '_' . date('Ymd_His') . '.csv"');
        
        $output = fopen('php://output', 'w');
        fputcsv($output, ['Razón Social', 'Nombre Comercial', 'Estado', 'Fecha Creación', 'País', 'Moneda', 'Zona Horaria', 'Usuarios']);

        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            fputcsv($output, [
                $row['legal_name'],
                $row['trade_name'],
                $row['status'],
                $row['created_at'],
                $row['country_name'],
                $row['currency_code'],
                $row['timezone_name'],
                $row['users_count']
            ]);
        }
        fclose($output);
    }

    private function subscriptionStats(): void
    {
        try {
            // 1. Total Tenants
            $stmt = $this->pdo->query("SELECT COUNT(*) FROM companies WHERE deleted_at IS NULL");
            $total = (int)$stmt->fetchColumn();

            // 2. Active Tenants
            $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM companies WHERE status = :status AND deleted_at IS NULL");
            $stmt->execute([':status' => 'active']);
            $active = (int)$stmt->fetchColumn();

            // 3. New This Month
            $stmt = $this->pdo->query("SELECT COUNT(*) FROM companies WHERE deleted_at IS NULL AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')");
            $newThisMonth = (int)$stmt->fetchColumn();

            // 4. By Status
            $stmt = $this->pdo->query("SELECT status, COUNT(*) as count FROM companies WHERE deleted_at IS NULL GROUP BY status");
            try {
                $byStatus = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
            } catch (\Throwable $e) {
                // Fallback if FETCH_KEY_PAIR fails
                $byStatus = [];
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($rows as $r) {
                    $byStatus[$r['status']] = $r['count'];
                }
            }

            // 5. Growth (Last 6 months)
            $growth = [];
            for ($i = 5; $i >= 0; $i--) {
                $month = date('Y-m', strtotime("-$i months"));
                $stmt = $this->pdo->prepare("
                    SELECT COUNT(*) FROM companies 
                    WHERE deleted_at IS NULL AND DATE_FORMAT(created_at, '%Y-%m') = :m
                ");
                $stmt->execute([':m' => $month]);
                $growth[] = [
                    'month' => $month,
                    'count' => (int)$stmt->fetchColumn()
                ];
            }

            Response::json([
                'data' => [
                    'total_tenants' => $total,
                    'active_tenants' => $active,
                    'new_this_month' => $newThisMonth,
                    'by_status' => $byStatus,
                    'growth' => $growth
                ]
            ]);
        } catch (\Throwable $e) {
            Response::error('Error calculating subscription stats: ' . $e->getMessage(), 500);
        }
    }

    private function supportViewIndex(): void
    {
        $user = Auth::user();
        if (!in_array($user['platform_role'] ?? '', ['super_admin', 'support'], true)) {
            Response::error('Acceso denegado', 403);
            return;
        }

        try {
            // Pagination
            $page = (int)($_GET['page'] ?? 1);
            $limit = (int)($_GET['limit'] ?? 20);
            $offset = ($page - 1) * $limit;
            $search = $_GET['search'] ?? '';

            // Base Query
            $sql = "
                SELECT 
                    c.id, c.legal_name, c.trade_name, c.logo_url, c.status,
                    (SELECT sp.name 
                     FROM company_subscriptions cs 
                     JOIN subscription_plans sp ON cs.plan_id = sp.id 
                     WHERE cs.company_id = c.id AND cs.status = 'active' 
                     LIMIT 1
                    ) as plan,
                    co.name as country_name,
                    (SELECT COUNT(*) FROM company_users cu WHERE cu.company_id = c.id AND cu.deleted_at IS NULL) as users_count,
                    (SELECT COUNT(*) FROM projects p WHERE p.company_id = c.id AND p.status = 'active' AND p.deleted_at IS NULL) as active_projects_count,
                    (SELECT COUNT(*) FROM support_tickets st WHERE st.company_id = c.id AND st.status != 'closed') as open_tickets_count,
                    (SELECT CASE WHEN EXISTS (
                        SELECT 1 FROM invoices i 
                        WHERE i.company_id = c.id 
                        AND i.status = 'overdue' 
                    ) THEN 'overdue' ELSE 'up_to_date' END) as payment_status
                FROM companies c
                LEFT JOIN countries co ON c.country_id = co.id
                WHERE c.deleted_at IS NULL
            ";

            $params = [];
            if ($search) {
                $sql .= " AND (c.legal_name LIKE :s OR c.trade_name LIKE :s)";
                $params[':s'] = "%$search%";
            }

            $sql .= " ORDER BY c.created_at DESC LIMIT $limit OFFSET $offset";

            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Count total for pagination
            $countSql = "SELECT COUNT(*) FROM companies c WHERE c.deleted_at IS NULL";
            if ($search) {
                $countSql .= " AND (c.legal_name LIKE :s OR c.trade_name LIKE :s)";
            }
            $stmtCount = $this->pdo->prepare($countSql);
            if ($search) $stmtCount->execute([':s' => "%$search%"]);
            else $stmtCount->execute();
            $total = (int)$stmtCount->fetchColumn();

            Response::json([
                'data' => $data,
                'meta' => [
                    'current_page' => $page,
                    'per_page' => $limit,
                    'total' => $total,
                    'last_page' => ceil($total / $limit)
                ]
            ]);
        } catch (\Throwable $e) {
            Response::error('Error loading support companies view: ' . $e->getMessage(), 500);
        }
    }

    private function store(): void
    {
        $payload = $this->readPayload();

        $legal = trim((string)($payload['legal_name'] ?? ''));
        $trade = trim((string)($payload['trade_name'] ?? ''));
        $countryId = (int)($payload['country_id'] ?? 0);
        $currencyId = (int)($payload['default_currency_id'] ?? 0);
        $timezoneId = (int)($payload['timezone_id'] ?? 0); // NUEVO
        $status = trim((string)($payload['status'] ?? 'active'));
        $lang = trim((string)($payload['default_language'] ?? 'es'));

        if ($legal === '' || $countryId <= 0 || $currencyId <= 0 || $timezoneId <= 0) {
            Response::error('legal_name, country_id, default_currency_id y timezone_id son requeridos', 422);
            return;
        }
        if (!in_array($status, ['active', 'suspended'], true)) $status = 'active';

        // Prevención duplicados nombre
        $stmt = $this->pdo->prepare("SELECT 1 FROM companies WHERE legal_name = :legal AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':legal' => $legal]);
        if ($stmt->fetch()) {
            Response::error("La Razón Social '$legal' ya existe", 409);
            return;
        }

        // Validación FK
        if (!$this->existsById('countries', $countryId)) { Response::error('country_id inválido', 422); return; }
        if (!$this->existsById('currencies', $currencyId)) { Response::error('default_currency_id inválido', 422); return; }
        
        // Validar timezone
        $stmtTz = $this->pdo->prepare("SELECT 1 FROM timezones WHERE id = :id LIMIT 1");
        $stmtTz->execute([':id' => $timezoneId]);
        if (!$stmtTz->fetchColumn()) { Response::error('timezone_id inválido', 422); return; }

        // Logo Upload
        $logoUrl = null;
        if (isset($_FILES['logo']) && $_FILES['logo']['error'] === UPLOAD_ERR_OK) {
            $allowed = ['image/jpeg', 'image/png', 'image/webp'];
            $finfo = new \finfo(FILEINFO_MIME_TYPE);
            $mime = $finfo->file($_FILES['logo']['tmp_name']);
            
            if (in_array($mime, $allowed)) {
                $ext = pathinfo($_FILES['logo']['name'], PATHINFO_EXTENSION);
                $filename = 'company_' . uniqid() . '.' . $ext;
                $uploadDir = __DIR__ . '/../../public/uploads/logos';
                if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
                
                if (move_uploaded_file($_FILES['logo']['tmp_name'], $uploadDir . '/' . $filename)) {
                    $logoUrl = '/uploads/logos/' . $filename;
                }
            }
        }

        $id = $this->uuid();

        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("
                INSERT INTO companies (id, legal_name, trade_name, country_id, default_currency_id, timezone_id, status, logo_url, created_at)
                VALUES (:id, :legal, :trade, :country, :currency, :tzid, :status, :logo, NOW())
            ");
            $stmt->execute([
                ':id' => $id,
                ':legal' => $legal,
                ':trade' => ($trade !== '' ? $trade : null),
                ':country' => $countryId,
                ':currency' => $currencyId,
                ':tzid' => $timezoneId,
                ':status' => $status,
                ':logo' => $logoUrl,
            ]);

            $this->ensureCompanySettings($id, $lang);
            $this->ensureWallet($id, $currencyId);

            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        }

        $this->audit('tenant.created', 'company', $id, [
            'legal_name' => $legal,
            'trade_name' => $trade,
            'country_id' => $countryId,
            'default_currency_id' => $currencyId,
            'timezone_id' => $timezoneId,
            'default_language' => $lang,
        ]);

        Response::json([
            'message' => 'Tenant creado',
            'data' => [
                'id' => $id,
            ],
        ], 201);
    }

    private function wizard(): void
    {
        $payload = $this->readPayload();

        // 1. Validate Basic Data
        $legal = trim((string)($payload['legal_name'] ?? ''));
        $trade = trim((string)($payload['trade_name'] ?? ''));
        $countryId = (int)($payload['country_id'] ?? 0);
        $currencyId = (int)($payload['default_currency_id'] ?? 0);
        $timezoneId = (int)($payload['timezone_id'] ?? 0);
        $status = trim((string)($payload['status'] ?? 'active'));
        
        // Settings
        $taxCountry = trim((string)($payload['tax_country'] ?? ''));
        $taxId = trim((string)($payload['tax_id'] ?? ''));
        $invoiceSeries = trim((string)($payload['invoice_series'] ?? ''));
        $invoiceNum = (int)($payload['invoice_number_start'] ?? 1);
        
        // Owner
        $ownerMode = $payload['owner_mode'] ?? 'create';
        $ownerEmail = strtolower(trim((string)($payload['owner_email'] ?? '')));
        $ownerName = trim((string)($payload['owner_name'] ?? ''));
        
        // Init
        $createRoles = (bool)($payload['create_default_roles'] ?? false);
        $activateTemplates = (bool)($payload['activate_templates'] ?? false);

        if ($legal === '' || $countryId <= 0 || $currencyId <= 0 || $timezoneId <= 0) {
            Response::error('Faltan datos básicos obligatorios', 422);
            return;
        }

        // Whitelist de status (coerción a active si no es válido)
        if (!in_array($status, ['active', 'suspended'], true)) $status = 'active';

        // Validación FK
        if (!$this->existsById('countries', $countryId)) { Response::error('country_id inválido', 422); return; }
        if (!$this->existsById('currencies', $currencyId)) { Response::error('default_currency_id inválido', 422); return; }

        // Whitelist de billing_cycle
        $billingCycle = isset($payload['billing_cycle']) ? (string)$payload['billing_cycle'] : 'monthly';
        if (!in_array($billingCycle, ['monthly', 'yearly'], true)) {
            Response::error('billing_cycle inválido (monthly|yearly)', 422);
            return;
        }
        
        if ($ownerEmail === '') {
             Response::error('Email del administrador es requerido', 422);
             return;
        }

        // Subfuncion: Validacion tax_id unico
        if ($taxId !== '') {
            $stmt = $this->pdo->prepare("SELECT 1 FROM company_settings WHERE tax_id = :tid LIMIT 1");
            $stmt->execute([':tid' => $taxId]);
            if ($stmt->fetch()) {
                Response::error("El Tax ID '$taxId' ya está registrado en otra empresa", 409);
                return;
            }
        }
        
        // Subfuncion: Prevencion duplicados nombre
        $stmt = $this->pdo->prepare("SELECT 1 FROM companies WHERE legal_name = :legal AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':legal' => $legal]);
        if ($stmt->fetch()) {
             Response::error("La Razón Social '$legal' ya existe", 409);
             return;
        }

        // Validar timezone
        $stmtTz = $this->pdo->prepare("SELECT 1 FROM timezones WHERE id = :id LIMIT 1");
        $stmtTz->execute([':id' => $timezoneId]);
        if (!$stmtTz->fetchColumn()) { Response::error('timezone_id inválido', 422); return; }

        // Logo Upload
        $logoUrl = null;
        if (isset($_FILES['logo']) && $_FILES['logo']['error'] === UPLOAD_ERR_OK) {
            $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
            $ext = strtolower(pathinfo($_FILES['logo']['name'], PATHINFO_EXTENSION));
            
            if (in_array($ext, $allowed)) {
                $uploadDir = __DIR__ . '/../../public/uploads/logos/';
                if (!is_dir($uploadDir)) {
                    @mkdir($uploadDir, 0755, true);
                }
                
                $filename = uniqid('logo_') . '.' . $ext;
                $targetPath = $uploadDir . $filename;
                
                if (move_uploaded_file($_FILES['logo']['tmp_name'], $targetPath)) {
                    $logoUrl = '/uploads/logos/' . $filename;
                }
            }
        }

        try {
            // Lazy Migration for logo_url
            try {
                $this->pdo->exec("ALTER TABLE companies ADD COLUMN logo_url VARCHAR(255) NULL AFTER trade_name");
            } catch (\Throwable $e) {}

            $this->ensureCompanySubscriptionsTable();
            $this->ensureCompanyFeeRulesTable();

            $this->pdo->beginTransaction();

            // 2. Create Company
            $companyId = $this->uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO companies (id, legal_name, trade_name, logo_url, country_id, default_currency_id, timezone_id, status, created_at)
                VALUES (:id, :legal, :trade, :logo, :country, :currency, :tzid, :status, NOW())
            ");
            $stmt->execute([
                ':id' => $companyId,
                ':legal' => $legal,
                ':trade' => ($trade !== '' ? $trade : null),
                ':logo' => $logoUrl,
                ':country' => $countryId,
                ':currency' => $currencyId,
                ':tzid' => $timezoneId,
                ':status' => $status,
            ]);

            // 3. Create Settings (Ajustado a Schema: sin tax_country, invoice_number_next)
            $stmt = $this->pdo->prepare("
                INSERT INTO company_settings (company_id, default_language, tax_id, invoice_series, invoice_number_next, created_at)
                VALUES (:cid, 'es', :tid, :ser, :num, NOW())
            ");
            $stmt->execute([
                ':cid' => $companyId,
                ':tid' => ($taxId !== '' ? $taxId : null),
                ':ser' => ($invoiceSeries !== '' ? $invoiceSeries : null),
                ':num' => $invoiceNum
            ]);

            // 3b. Create Subscription & Fee Rules (New Requirement)
            $planPrice = isset($payload['plan_price']) ? (float)$payload['plan_price'] : 99.00;
            $platformFee = isset($payload['platform_fee']) ? (float)$payload['platform_fee'] : 29.00;

            $this->createDefaultSubscription($companyId, $currencyId, $planPrice, $billingCycle);
            $this->createDefaultFeeRules($companyId, $currencyId, $platformFee);

            $perFee = isset($payload['per_freelancer_fee']) ? (float)$payload['per_freelancer_fee'] : 0.0;
            if ($perFee > 0) {
                $ruleId = $this->uuid();
                $stmt = $this->pdo->prepare("
                    INSERT INTO company_fee_rules (id, company_id, type, value, currency_id, active, created_at)
                    VALUES (:id, :cid, 'per_freelancer_fee', :val, :cur, 1, NOW())
                ");
                $stmt->execute([
                    ':id' => $ruleId,
                    ':cid' => $companyId,
                    ':val' => $perFee,
                    ':cur' => $currencyId
                ]);
            }

            // 4. Create Wallet
            $this->ensureWallet($companyId, $currencyId);

            // 5. Owner / User
            $userId = null;
            $generatedPassword = null;
            $stmt = $this->pdo->prepare("SELECT id FROM users WHERE email = :email");
            $stmt->execute([':email' => $ownerEmail]);
            $existingUser = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($existingUser) {
                $userId = $existingUser['id'];
            } else {
                $userId = $this->uuid();
                $pwdRaw = (string)($payload['owner_password'] ?? '');
                $pwdHash = null;
                if ($pwdRaw !== '') {
                    $pwdHash = password_hash($pwdRaw, PASSWORD_BCRYPT);
                } else {
                    $generatedPassword = bin2hex(random_bytes(8));
                    $pwdHash = password_hash($generatedPassword, PASSWORD_BCRYPT);
                }
                $stmt = $this->pdo->prepare("
                    INSERT INTO users (id, full_name, email, password_hash, status, platform_role, created_at)
                    VALUES (:id, :name, :email, :pwd, 'active', 'user', NOW())
                ");
                $stmt->execute([
                    ':id' => $userId,
                    ':name' => ($ownerName !== '' ? $ownerName : 'Usuario'),
                    ':email' => $ownerEmail,
                    ':pwd' => $pwdHash
                ]);
            }

            // 6. Membership
            $membershipId = $this->uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO company_users (id, company_id, user_id, status, job_title, created_at)
                VALUES (:id, :cid, :uid, 'active', 'Company Admin', NOW())
            ");
            $stmt->execute([
                ':id' => $membershipId,
                ':cid' => $companyId,
                ':uid' => $userId
            ]);

            // 7. Roles & Initialization
            $adminRoleId = null;
            $rolesToCreate = $createRoles ? [
                'Admin' => ['*'],
                'Finance' => ['invoices.*', 'wallets.*', 'payouts.*'],
                'HR' => ['users.*', 'contracts.*', 'payroll.*'],
                'IT Admin' => ['equipment.*', 'integrations.*'],
                'Approver' => ['requisitions.approve', 'expenses.approve'],
                'Viewer' => ['*.read']
            ] : ['Admin' => ['*']]; // Always create Admin role

            // Get permissions
            $stmt = $this->pdo->query("SELECT id, code FROM permissions");
            $allPerms = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $permMap = [];
            foreach ($allPerms as $p) $permMap[$p['code']] = $p['id'];
            $allPermIds = array_values($permMap);

            foreach ($rolesToCreate as $rName => $rPerms) {
                $rId = $this->uuid();
                if ($rName === 'Admin') $adminRoleId = $rId;

                $stmt = $this->pdo->prepare("INSERT INTO roles (id, company_id, name, created_at) VALUES (:id, :cid, :name, NOW())");
                $stmt->execute([':id' => $rId, ':cid' => $companyId, ':name' => $rName]);

                $pIds = [];
                if ($rPerms === ['*']) {
                    $pIds = $allPermIds;
                } else {
                    foreach ($rPerms as $pat) {
                        if (str_ends_with($pat, '.*')) {
                            $prefix = substr($pat, 0, -2);
                            foreach ($permMap as $code => $pid) {
                                if (str_starts_with($code, $prefix)) $pIds[] = $pid;
                            }
                        } else {
                            if (isset($permMap[$pat])) $pIds[] = $permMap[$pat];
                        }
                    }
                }
                $pIds = array_unique($pIds);
                
                if (!empty($pIds)) {
                    $sql = "INSERT INTO role_permissions (role_id, permission_id) VALUES ";
                    $vals = [];
                    $binds = [];
                    foreach ($pIds as $pid) {
                        $vals[] = "(?, ?)";
                        $binds[] = $rId;
                        $binds[] = $pid;
                    }
                    $this->pdo->prepare($sql . implode(', ', $vals))->execute($binds);
                }
            }

            if ($adminRoleId) {
                $this->pdo->prepare("INSERT INTO user_roles (company_user_id, role_id) VALUES (:cuid, :rid)")
                        ->execute([':cuid' => $membershipId, ':rid' => $adminRoleId]);
            }

            // 8. Templates Seeding
            if ($activateTemplates) {
                $this->seedTemplates($companyId, $countryId);
            }

            $this->audit('tenant.created_wizard', 'company', $companyId, ['legal_name' => $legal]);

            $this->pdo->commit();

            $respData = ['id' => $companyId];
            if ($generatedPassword !== null) {
                $respData['owner_password'] = $generatedPassword;
            }

            Response::json([
                'message' => 'Empresa creada y configurada exitosamente',
                'data' => $respData
            ], 201);

        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        }
    }

    private function show(string $id): void
    {
        $company = $this->fetchCompanyWithRelations($id);
        if (!$company) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $settings = $this->fetchSettings($id);
        $wallet = $this->fetchWallet($id);

        Response::json([
            'data' => [
                'company' => $company,
                'settings' => $settings,
                'wallet' => $wallet,
            ],
        ]);
    }

    private function update(string $id): void
    {
        if (!$this->fetchCompany($id)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $payload = $this->readPayload();

        $legal = array_key_exists('legal_name', $payload) ? trim((string)$payload['legal_name']) : null;
        $trade = array_key_exists('trade_name', $payload) ? trim((string)$payload['trade_name']) : null;
        $countryId = array_key_exists('country_id', $payload) ? (int)$payload['country_id'] : null;
        $currencyId = array_key_exists('default_currency_id', $payload) ? (int)$payload['default_currency_id'] : null;
        $timezoneId = array_key_exists('timezone_id', $payload) ? (int)$payload['timezone_id'] : null;
        $language = array_key_exists('default_language', $payload) ? trim((string)$payload['default_language']) : null;

        $sets = [];
        $params = [':id' => $id];

        // Handle Logo Upload
        if (isset($_FILES['logo']) && $_FILES['logo']['error'] === UPLOAD_ERR_OK) {
            $allowed = ['jpg', 'jpeg', 'png', 'webp'];
            $filename = $_FILES['logo']['name'];
            $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
            
            if (in_array($ext, $allowed)) {
                $uploadDir = __DIR__ . '/../../public/uploads/logos/';
                if (!is_dir($uploadDir)) {
                    @mkdir($uploadDir, 0755, true);
                }
                
                $newFilename = uniqid('logo_' . $id . '_') . '.' . $ext;
                $targetPath = $uploadDir . $newFilename;
                
                if (move_uploaded_file($_FILES['logo']['tmp_name'], $targetPath)) {
                    $logoUrl = '/uploads/logos/' . $newFilename;
                    $sets[] = 'logo_url = :logo';
                    $params[':logo'] = $logoUrl;
                }
            }
        }

        if ($legal !== null && $legal !== '') { $sets[] = 'legal_name = :legal'; $params[':legal'] = $legal; }
        if ($trade !== null) { $sets[] = 'trade_name = :trade'; $params[':trade'] = ($trade !== '' ? $trade : null); }

        if ($countryId !== null && $countryId > 0) {
            if (!$this->existsById('countries', $countryId)) { Response::error('country_id inválido', 422); return; }
            $sets[] = 'country_id = :country'; $params[':country'] = $countryId;
        }

        if ($currencyId !== null && $currencyId > 0) {
            if (!$this->existsById('currencies', $currencyId)) { Response::error('default_currency_id inválido', 422); return; }
            $sets[] = 'default_currency_id = :currency'; $params[':currency'] = $currencyId;
        }

        if ($timezoneId !== null && $timezoneId > 0) {
            if (!$this->existsById('timezones', $timezoneId)) { Response::error('timezone_id inválido', 422); return; }
            $sets[] = 'timezone_id = :tzid'; $params[':tzid'] = $timezoneId;
        }

        $updated = false;

        if ($sets) {
            $sql = "UPDATE companies SET " . implode(', ', $sets) . " WHERE id = :id AND deleted_at IS NULL";
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            $updated = true;
        }

        // Update Settings (Language)
        if ($language !== null) {
            $stmt = $this->pdo->prepare("SELECT 1 FROM company_settings WHERE company_id = :cid");
            $stmt->execute([':cid' => $id]);
            if ($stmt->fetchColumn()) {
                $stmt = $this->pdo->prepare("UPDATE company_settings SET default_language = :lang WHERE company_id = :cid");
                $stmt->execute([':lang' => $language, ':cid' => $id]);
            } else {
                $stmt = $this->pdo->prepare("INSERT INTO company_settings (company_id, default_language, created_at) VALUES (:cid, :lang, NOW())");
                $stmt->execute([':cid' => $id, ':lang' => $language]);
            }
            $updated = true;
        }

        if (!$updated) {
            Response::error('Nada para actualizar', 422);
            return;
        }

        if ($currencyId !== null && $currencyId > 0) {
            $this->ensureWallet($id, $currencyId);
        }

        $this->audit('tenant.updated', 'company', $id, $payload);

        Response::json(['message' => 'Tenant actualizado']);
    }

    private function suspend(string $id): void
    {
        if (!$this->fetchCompany($id)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $payload = $this->readPayload();
        $reason = trim((string)($payload['reason'] ?? ''));

        if ($reason === '') {
            Response::error('El motivo (reason) es requerido', 422);
            return;
        }

        $stmt = $this->pdo->prepare("UPDATE companies SET status = 'suspended' WHERE id = :id AND deleted_at IS NULL");
        $stmt->execute([':id' => $id]);

        $this->audit('tenant.suspended', 'company', $id, ['reason' => $reason]);

        Response::json(['message' => 'Tenant suspendido']);
    }

    private function activate(string $id): void
    {
        if (!$this->fetchCompany($id)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $payload = $this->readPayload();
        $reason = trim((string)($payload['reason'] ?? ''));

        $stmt = $this->pdo->prepare("UPDATE companies SET status = 'active' WHERE id = :id AND deleted_at IS NULL");
        $stmt->execute([':id' => $id]);

        $this->audit('tenant.activated', 'company', $id, ['reason' => ($reason !== '' ? $reason : null)]);

        Response::json(['message' => 'Tenant activado']);
    }

    private function toggleReadOnly(string $id): void
    {
        if (!$this->fetchCompany($id)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $payload = $this->readPayload();
        // 'enabled' param: boolean true/false or 1/0
        $enabled = (bool)($payload['enabled'] ?? false);
        $reason = trim((string)($payload['reason'] ?? ''));

        $val = $enabled ? 1 : 0;

        $stmt = $this->pdo->prepare("UPDATE companies SET read_only_mode = :val WHERE id = :id AND deleted_at IS NULL");
        $stmt->execute([':val' => $val, ':id' => $id]);

        $action = $enabled ? 'tenant.readonly.enabled' : 'tenant.readonly.disabled';
        $this->audit($action, 'company', $id, ['reason' => $reason]);

        Response::json(['message' => 'Modo solo lectura ' . ($enabled ? 'activado' : 'desactivado')]);
    }

    private function destroy(string $id): void
    {
        if (!$this->fetchCompany($id)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        // Fetch name for audit
        $stmtName = $this->pdo->prepare("SELECT legal_name FROM companies WHERE id = :id");
        $stmtName->execute([':id' => $id]);
        $companyName = $stmtName->fetchColumn() ?: 'Desconocida';

        $stmt = $this->pdo->prepare("UPDATE companies SET deleted_at = NOW() WHERE id = :id");
        $stmt->execute([':id' => $id]);

        $this->audit('tenant.deleted', 'company', $id, ['legal_name' => $companyName]);

        Response::json(['message' => 'Tenant eliminado']);
    }

    private function getStats(string $id): void
    {
        $company = $this->fetchCompany($id);
        if (!$company) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        // 1. Users
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM company_users WHERE company_id = :id AND status = 'active' AND deleted_at IS NULL");
        $stmt->execute([':id' => $id]);
        $activeUsers = (int)$stmt->fetchColumn();

        // 2. Projects
        $activeProjects = 0;
        if ($this->tableExists('projects')) {
            try {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM projects WHERE company_id = :id AND status = 'active' AND deleted_at IS NULL");
                $stmt->execute([':id' => $id]);
                $activeProjects = (int)$stmt->fetchColumn();
            } catch (Throwable $e) {}
        }

        // 3. Pending Requisitions
        $pendingRequisitions = 0;
        if ($this->tableExists('requisitions')) {
            try {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM requisitions WHERE company_id = :id AND status = 'pending'");
                $stmt->execute([':id' => $id]);
                $pendingRequisitions = (int)$stmt->fetchColumn();
            } catch (Throwable $e) {}
        } elseif ($this->tableExists('approval_requests')) {
             try {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM approval_requests WHERE company_id = :id AND status = 'pending'");
                $stmt->execute([':id' => $id]);
                $pendingRequisitions = (int)$stmt->fetchColumn();
            } catch (Throwable $e) {}
        }

        // 4. Active Vendors
        $activeVendors = 0;
        if ($this->tableExists('vendors')) {
            try {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM vendors WHERE company_id = :id AND status = 'active'");
                $stmt->execute([':id' => $id]);
                $activeVendors = (int)$stmt->fetchColumn();
            } catch (Throwable $e) {}
        }

        // 5. Active Contracts
        $activeContracts = 0;
        if ($this->tableExists('contracts')) {
            try {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM contracts WHERE company_id = :id AND status = 'active'");
                $stmt->execute([':id' => $id]);
                $activeContracts = (int)$stmt->fetchColumn();
            } catch (Throwable $e) {}
        }

        // 6. Active Freelancers (Distinct active contracts)
        $activeFreelancers = 0;
        if ($this->tableExists('contracts')) {
            try {
                $stmt = $this->pdo->prepare("SELECT COUNT(DISTINCT freelancer_id) FROM contracts WHERE company_id = :id AND status = 'active' AND freelancer_id IS NOT NULL");
                $stmt->execute([':id' => $id]);
                $activeFreelancers = (int)$stmt->fetchColumn();
                
                if ($activeFreelancers === 0) {
                     $stmt = $this->pdo->prepare("SELECT COUNT(DISTINCT user_id) FROM contracts WHERE company_id = :id AND status = 'active' AND user_id IS NOT NULL");
                     $stmt->execute([':id' => $id]);
                     $activeFreelancers = (int)$stmt->fetchColumn();
                }
            } catch (Throwable $e) {}
        }

        // 7. Unpaid Invoices
        $unpaidInvoices = 0;
        if ($this->tableExists('invoices')) {
             try {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM invoices WHERE company_id = :id AND status IN ('sent', 'overdue', 'draft')");
                $stmt->execute([':id' => $id]);
                $unpaidInvoices = (int)$stmt->fetchColumn();
             } catch (Throwable $e) {}
        }

        // 8. Pending Onboarding
        $pendingOnboarding = 0;
        try {
            $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM company_users WHERE company_id = :id AND status IN ('invited', 'pending')");
            $stmt->execute([':id' => $id]);
            $pendingOnboarding = (int)$stmt->fetchColumn();
        } catch (Throwable $e) {}

        // 9. Recent Activity
        $recentActivity = [];
        try {
            $logger = new \App\Support\AuditLogger();
            $result = $logger->getLogs(['company_id' => $id], 5, 0);
            $recentActivity = $result['data'];
            
            foreach ($recentActivity as &$act) {
                if (isset($act['actor_user_id'])) {
                    $act['user_id'] = $act['actor_user_id'];
                }
                if (empty($act['description'])) {
                    $act['description'] = $this->generateAuditDescription($act['action'], $act['metadata'] ?? []);
                }
            }
        } catch (\Throwable $e) {}

        Response::json([
            'data' => [
                'active_users' => $activeUsers,
                'active_projects' => $activeProjects,
                'active_vendors' => $activeVendors,
                'pending_requisitions' => $pendingRequisitions,
                'active_contracts' => $activeContracts,
                'active_freelancers' => $activeFreelancers,
                'unpaid_invoices' => $unpaidInvoices,
                'pending_onboarding' => $pendingOnboarding,
                'recent_activity' => $recentActivity
            ]
        ]);
    }

    /* =========================
       SETTINGS
       ========================= */

    private function getSettings(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $settings = $this->fetchSettings($companyId);
        if (!$settings) {
            $this->ensureCompanySettings($companyId, 'es');
            $settings = $this->fetchSettings($companyId);
        }

        Response::json(['data' => $settings]);
    }

    private function updateSettings(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        // Support multipart/form-data for Logo
        $payload = $_POST;
        if (empty($payload)) {
            $payload = $this->readPayload(); // Fallback for JSON
        }

        $this->ensureCompanySettings($companyId, (string)($payload['default_language'] ?? 'es'));

        // company_settings
        $cols = $this->tableColumns('company_settings');
        $allowed = array_flip($cols);

        $sets = [];
        $params = [':company_id' => $companyId];

        foreach ($payload as $k => $v) {
            if ($k === 'company_id') continue;
            if ($k === 'read_only_mode') continue; // se sincroniza aparte (con cast a int) para companies
            if (!isset($allowed[$k])) continue;

            $sets[] = "`{$k}` = :{$k}";
            $params[":{$k}"] = is_string($v) ? trim($v) : $v;
        }

        if ($sets) {
            $sql = "UPDATE company_settings SET " . implode(', ', $sets) . " WHERE company_id LIKE :company_id";
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
        }

        // companies: actualiza columnas base relacionadas
        $companySets = [];
        $companyParams = [':id' => $companyId];

        if (array_key_exists('country_id', $payload) && (int)$payload['country_id'] > 0) {
            $cid = (int)$payload['country_id'];
            if (!$this->existsById('countries', $cid)) { Response::error('country_id inválido', 422); return; }
            $companySets[] = "country_id = :country_id";
            $companyParams[':country_id'] = $cid;
        }

        if (array_key_exists('default_currency_id', $payload) && (int)$payload['default_currency_id'] > 0) {
            $cur = (int)$payload['default_currency_id'];
            if (!$this->existsById('currencies', $cur)) { Response::error('default_currency_id inválido', 422); return; }
            $companySets[] = "default_currency_id = :default_currency_id";
            $companyParams[':default_currency_id'] = $cur;
            $this->ensureWallet($companyId, $cur);
        }

        // timezone_id
        if (array_key_exists('timezone_id', $payload) && (int)$payload['timezone_id'] > 0) {
            $tz = (int)$payload['timezone_id'];
            if (!$this->existsById('timezones', $tz)) { Response::error('timezone_id inválido', 422); return; }
            $companySets[] = "timezone_id = :timezone_id";
            $companyParams[':timezone_id'] = $tz;
        }

        // Legal & Trade Name
        if (array_key_exists('legal_name', $payload)) {
            $companySets[] = "legal_name = :legal_name";
            $companyParams[':legal_name'] = trim($payload['legal_name']);
        }
        if (array_key_exists('trade_name', $payload)) {
            $companySets[] = "trade_name = :trade_name";
            $companyParams[':trade_name'] = trim($payload['trade_name']);
        }

        // Sync read_only_mode to companies if provided
        if (array_key_exists('read_only_mode', $payload)) {
            $val = (int)((bool)$payload['read_only_mode']);
            $companySets[] = "read_only_mode = :read_only_mode";
            $companyParams[':read_only_mode'] = $val;
            $this->audit($val ? 'tenant.readonly.enabled' : 'tenant.readonly.disabled', 'company', $companyId, []);

            // Sincroniza company_settings.read_only_mode (lo usan Auth y getSettings)
            $this->pdo->prepare("UPDATE company_settings SET read_only_mode = :val WHERE company_id LIKE :cid")
                ->execute([':val' => $val, ':cid' => $companyId]);
        }

        // Logo Upload
        if (isset($_FILES['logo']) && $_FILES['logo']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['logo'];
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
                Response::error('Formato de logo no válido (jpg, png, webp)', 422);
                return;
            }
            
            $uploadDir = __DIR__ . '/../../public/uploads/logos';
            if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
            
            $filename = $companyId . '_' . time() . '.' . $ext;
            $targetPath = $uploadDir . '/' . $filename;
            
            if (move_uploaded_file($file['tmp_name'], $targetPath)) {
                $logoUrl = '/uploads/logos/' . $filename;
                $companySets[] = "logo_url = :logo_url";
                $companyParams[':logo_url'] = $logoUrl;
            }
        }

        if ($companySets) {
            $sql = "UPDATE companies SET " . implode(', ', $companySets) . " WHERE id LIKE :id AND deleted_at IS NULL";
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($companyParams);
        }

        $this->audit('tenant.settings.updated', 'company', $companyId, $payload);

        Response::json(['message' => 'Settings actualizados']);
    }

    /* =========================
       CONTACTS CRUD (adaptativo)
       ========================= */

    private function contactsIndex(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(200, (int)($_GET['per_page'] ?? 10)));
        $type = trim((string)($_GET['type'] ?? ''));

        $offset = ($page - 1) * $perPage;

        $cols = $this->tableColumns('company_contacts');
        $where = ['company_id LIKE :cid'];
        $params = [':cid' => $companyId];

        if (in_array('deleted_at', $cols, true)) {
            $where[] = 'deleted_at IS NULL';
        }

        if ($type !== '' && in_array('type', $cols, true)) {
            $where[] = 'type LIKE :type';
            $params[':type'] = $type;
        }

        $whereSql = implode(' AND ', $where);

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM company_contacts WHERE {$whereSql}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("SELECT * FROM company_contacts WHERE {$whereSql} ORDER BY created_at DESC LIMIT :l OFFSET :o");
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':l', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':o', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll() ?: [];

        Response::json([
            'data' => $items,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int)ceil($total / max(1, $perPage))),
            ],
        ]);
    }

    private function contactsStore(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $payload = $this->readPayload();

        $cols = $this->tableColumns('company_contacts');
        if (!$cols) {
            Response::error('Tabla company_contacts no disponible', 500);
            return;
        }

        $data = [];
        $data['company_id'] = $companyId;

        foreach (['type','name','email','phone','role','position','notes'] as $k) {
            if (array_key_exists($k, $payload)) $data[$k] = is_string($payload[$k]) ? trim((string)$payload[$k]) : $payload[$k];
        }

        $insert = [];
        foreach ($data as $k => $v) {
            if (in_array($k, $cols, true)) $insert[$k] = $v;
        }

        if (in_array('id', $cols, true)) {
            $insert['id'] = $this->uuid();
        }
        if (in_array('created_at', $cols, true) && !isset($insert['created_at'])) {
            $insert['created_at'] = date('Y-m-d H:i:s');
        }

        if (!isset($insert['company_id'])) {
            Response::error('No se pudo construir payload para contacts (company_id faltante)', 500);
            return;
        }

        $fields = array_keys($insert);
        $place = array_map(fn($f) => ':' . $f, $fields);

        $sql = "INSERT INTO company_contacts (" . implode(',', $fields) . ") VALUES (" . implode(',', $place) . ")";
        $stmt = $this->pdo->prepare($sql);
        foreach ($insert as $k => $v) $stmt->bindValue(':' . $k, $v);
        $stmt->execute();

        $this->audit('tenant.contact.created', 'company_contact', $insert['id'] ?? null, [
            'company_id' => $companyId,
            'payload' => $payload,
        ]);

        Response::json(['message' => 'Contacto creado'], 201);
    }

    private function contactsUpdate(string $companyId, string $contactId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $payload = $this->readPayload();
        $cols = $this->tableColumns('company_contacts');

        $sets = [];
        $params = [
            ':id' => $contactId,
            ':cid' => $companyId,
        ];

        foreach ($payload as $k => $v) {
            if ($k === 'id' || $k === 'company_id') continue;
            if (!in_array($k, $cols, true)) continue;
            $sets[] = "`{$k}` = :{$k}";
            $params[":{$k}"] = is_string($v) ? trim((string)$v) : $v;
        }

        if (!$sets) {
            Response::error('Nada para actualizar', 422);
            return;
        }

        $sql = "UPDATE company_contacts SET " . implode(', ', $sets) . " WHERE id LIKE :id AND company_id LIKE :cid";
        if (in_array('deleted_at', $cols, true)) $sql .= " AND deleted_at IS NULL";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        $this->audit('tenant.contact.updated', 'company_contact', $contactId, [
            'company_id' => $companyId,
            'payload' => $payload,
        ]);

        Response::json(['message' => 'Contacto actualizado']);
    }

    private function contactsDestroy(string $companyId, string $contactId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $cols = $this->tableColumns('company_contacts');
        if (in_array('deleted_at', $cols, true)) {
            $stmt = $this->pdo->prepare("UPDATE company_contacts SET deleted_at = NOW() WHERE id LIKE :id AND company_id LIKE :cid");
            $stmt->execute([':id' => $contactId, ':cid' => $companyId]);
        } else {
            $stmt = $this->pdo->prepare("DELETE FROM company_contacts WHERE id LIKE :id AND company_id LIKE :cid");
            $stmt->execute([':id' => $contactId, ':cid' => $companyId]);
        }

        $this->audit('tenant.contact.deleted', 'company_contact', $contactId, [
            'company_id' => $companyId,
        ]);

        Response::json(['message' => 'Contacto eliminado']);
    }

    /* =========================
       MEMBERS (Company Users)
       ========================= */

    private function membersIndex(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(100, (int)($_GET['per_page'] ?? 20)));
        $offset = ($page - 1) * $perPage;

        // Count total
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM company_users WHERE company_id LIKE :cid AND deleted_at IS NULL");
        $countStmt->execute([':cid' => $companyId]);
        $total = (int)$countStmt->fetchColumn();

        $sql = "
            SELECT 
                cu.id,
                cu.user_id,
                cu.status,
                cu.job_title,
                cu.created_at,
                u.full_name as user_name,
                u.email as user_email,
                u.manager_id,
                m.full_name as manager_name,
                MAX(r.id) as role_id,
                MAX(r.name) as role_name
            FROM company_users cu
            JOIN users u ON u.id LIKE cu.user_id
            LEFT JOIN users m ON m.id LIKE u.manager_id
            LEFT JOIN user_roles ur ON ur.company_user_id LIKE cu.id
            LEFT JOIN roles r ON r.id LIKE ur.role_id
            WHERE cu.company_id LIKE :cid 
              AND cu.deleted_at IS NULL
            GROUP BY cu.id
            ORDER BY cu.created_at DESC
            LIMIT :limit OFFSET :offset
        ";
        
        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':cid', $companyId);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Normalize
        $items = array_map(function($r) {
            return [
                'id' => $r['id'],
                'user_id' => $r['user_id'],
                'active' => ($r['status'] === 'active'),
                'job_title' => $r['job_title'],
                'created_at' => $r['created_at'],
                'user' => [
                    'id' => $r['user_id'],
                    'full_name' => $r['user_name'],
                    'email' => $r['user_email']
                ],
                'role' => $r['role_id'] ? [
                    'id' => $r['role_id'],
                    'name' => $r['role_name']
                ] : null
            ];
        }, $rows);

        Response::json([
            'data' => $items,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int)ceil($total / $perPage)),
            ]
        ]);
    }

    private function membersStore(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $payload = $this->readPayload();
        $userId = $payload['user_id'] ?? null;
        $roleId = $payload['role_id'] ?? null;

        if (!$userId || !$roleId) {
            Response::error('user_id y role_id son requeridos', 422);
            return;
        }

        // Check if user exists
        if (!$this->existsById('users', $userId)) {
            Response::error('Usuario no encontrado', 404);
            return;
        }
        
        // Check if already member
        $stmt = $this->pdo->prepare("SELECT id FROM company_users WHERE company_id LIKE :cid AND user_id LIKE :uid AND deleted_at IS NULL");
        $stmt->execute([':cid' => $companyId, ':uid' => $userId]);
        if ($stmt->fetch()) {
            Response::error('El usuario ya es miembro de esta empresa', 409);
            return;
        }

        $this->pdo->beginTransaction();
        try {
            // Create member
            $memberId = $this->uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO company_users (id, company_id, user_id, status, created_at)
                VALUES (:id, :cid, :uid, 'active', NOW())
            ");
            $stmt->execute([':id' => $memberId, ':cid' => $companyId, ':uid' => $userId]);

            // Assign role
            $stmt = $this->pdo->prepare("
                INSERT INTO user_roles (company_user_id, role_id)
                VALUES (:mid, :rid)
            ");
            $stmt->execute([':mid' => $memberId, ':rid' => $roleId]);

            $this->pdo->commit();

            $this->audit('tenant.member.added', 'company_user', $memberId, ['company_id' => $companyId, 'user_id' => $userId]);
            
            Response::json(['message' => 'Miembro agregado', 'id' => $memberId], 201);
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    private function membersInvite(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $payload = $this->readPayload();
        $email = strtolower(trim((string)($payload['email'] ?? '')));
        $roleId = $payload['role_id'] ?? null;
        $name = trim((string)($payload['full_name'] ?? ''));

        if ($email === '' || !$roleId) {
            Response::error('Email y Rol son requeridos', 422);
            return;
        }

        $this->pdo->beginTransaction();
        try {
            // 1. Check if user exists
            $stmt = $this->pdo->prepare("SELECT id FROM users WHERE email LIKE :email");
            $stmt->execute([':email' => $email]);
            $userId = $stmt->fetchColumn();

            $isNewUser = false;
            if (!$userId) {
                // Create user
                $userId = $this->uuid();
                $isNewUser = true;
                $stmt = $this->pdo->prepare("
                    INSERT INTO users (id, full_name, email, status, platform_role, password_change_required, created_at)
                    VALUES (:id, :name, :email, 'invited', 'user', 1, NOW())
                ");
                $stmt->execute([
                    ':id' => $userId, 
                    ':name' => ($name !== '' ? $name : explode('@', $email)[0]),
                    ':email' => $email
                ]);
            }

            // 2. Check if already member
            $stmt = $this->pdo->prepare("SELECT id FROM company_users WHERE company_id LIKE :cid AND user_id LIKE :uid AND deleted_at IS NULL");
            $stmt->execute([':cid' => $companyId, ':uid' => $userId]);
            if ($stmt->fetch()) {
                Response::error('El usuario ya es miembro de esta empresa', 409);
                return;
            }

            // 3. Create member
            $memberId = $this->uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO company_users (id, company_id, user_id, status, created_at)
                VALUES (:id, :cid, :uid, 'active', NOW())
            ");
            $stmt->execute([':id' => $memberId, ':cid' => $companyId, ':uid' => $userId]);

            // 4. Assign role
            $stmt = $this->pdo->prepare("INSERT INTO user_roles (company_user_id, role_id) VALUES (:mid, :rid)");
            $stmt->execute([':mid' => $memberId, ':rid' => $roleId]);

            $this->audit('tenant.member.invited', 'company_user', $memberId, ['email' => $email, 'is_new_user' => $isNewUser]);

            // Send Email via SMTP
            try {
                // Fetch company name
                $stmtC = $this->pdo->prepare("SELECT legal_name FROM companies WHERE id LIKE :id");
                $stmtC->execute([':id' => $companyId]);
                $companyName = $stmtC->fetchColumn() ?: 'Spectra ERP';

                $inviteLink = getenv('FRONTEND_URL') . "/accept-invite?token=" . $memberId; 
                $subject = "Invitación a unirse a {$companyName} en Spectra ERP";
                
                $body = "
                <h2>Hola, {$name}</h2>
                <p>Has sido invitado a formar parte del equipo de <strong>{$companyName}</strong> en la plataforma Spectra ERP.</p>
                <p>Para aceptar la invitación y acceder, por favor haz clic en el siguiente enlace:</p>
                <p>
                    <a href='{$inviteLink}' style='background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;'>Aceptar Invitación</a>
                </p>
                <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
                <p>{$inviteLink}</p>
                <br>
                <p>Si ya tienes una cuenta, podrás iniciar sesión inmediatamente. Si no, se te pedirá que configures tu contraseña.</p>
                <br>
                <p>Saludos,<br>El equipo de Spectra ERP</p>
                ";
                
                SMTP::send($email, $subject, $body, true);
            } catch (Exception $e) {
                // Log error but don't fail the request
                error_log("SMTP Error sending invite to {$email}: " . $e->getMessage());
            }

            $this->pdo->commit();

            Response::json([
                'message' => 'Invitación enviada correctamente',
                'member_id' => $memberId,
                'is_new_user' => $isNewUser
            ], 201);

        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        }
    }

    /* =========================
       APPROVALS
       ========================= */

    private function approvalsList(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        // Check if table exists (safe check)
        if (!$this->tableExists('approval_policies')) {
            Response::json(['data' => [], 'meta' => ['total' => 0, 'page' => 1, 'limit' => 10, 'pages' => 0]]);
            return;
        }

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        // Count total
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM approval_policies WHERE company_id = :cid");
        $countStmt->execute([':cid' => $companyId]);
        $total = $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("
            SELECT p.*, 
                   (SELECT COUNT(*) FROM approval_rules r WHERE r.policy_id = p.id) as rules_count
            FROM approval_policies p
            WHERE p.company_id = :cid
            ORDER BY p.created_at DESC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':cid', $companyId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $policies = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Convert is_active to bool
        foreach ($policies as &$p) {
            $p['is_active'] = (bool)$p['is_active'];
        }

        Response::json([
            'data' => $policies,
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ]);
    }

    private function approvalsToggle(string $companyId, string $policyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        if (!$this->tableExists('approval_policies')) {
            Response::error('Módulo de aprobaciones no disponible', 501);
            return;
        }

        $stmt = $this->pdo->prepare("SELECT id, is_active FROM approval_policies WHERE id LIKE :id AND company_id LIKE :cid");
        $stmt->execute([':id' => $policyId, ':cid' => $companyId]);
        $policy = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$policy) {
            Response::error('Política no encontrada', 404);
            return;
        }

        $newStatus = !$policy['is_active'];
        
        $stmt = $this->pdo->prepare("UPDATE approval_policies SET is_active = :s WHERE id LIKE :id");
        $stmt->execute([':s' => $newStatus ? 1 : 0, ':id' => $policyId]);

        $input = $this->readPayload();
        $reason = $input['reason'] ?? null;

        $this->audit(
            $newStatus ? 'tenant.approval_policy.activated' : 'tenant.approval_policy.deactivated', 
            'approval_policy', 
            $policyId,
            ['company_id' => $companyId, 'reason' => $reason]
        );

        Response::json(['message' => 'Política actualizada', 'active' => $newStatus]);
    }

    private function approvalsSimulate(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $payload = $this->readPayload();
        $amount = (float)($payload['amount'] ?? 0);
        $currency = $payload['currency'] ?? 'USD';
        
        // Mock simulation logic for now, as full rule engine is complex
        // We will fetch rules and try to match basic amount criteria
        
        if (!$this->tableExists('approval_rules')) {
             Response::json(['result' => 'Aprobación Automática (Sin reglas)']);
             return;
        }

        // Find active policies
        $stmt = $this->pdo->prepare("
            SELECT id FROM approval_policies 
            WHERE company_id = :cid AND is_active = 1
        ");
        $stmt->execute([':cid' => $companyId]);
        $policyIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (empty($policyIds)) {
            Response::json(['result' => 'Aprobación Automática (Sin políticas activas)']);
            return;
        }

        // Simple check: find highest rule that matches
        // In reality, this should check specific object types, but simulator is generic
        $result = 'Aprobación Automática';
        
        // Fetch all rules for active policies
        // We assume rules have min_amount
        $inQuery = implode(',', array_fill(0, count($policyIds), '?'));
        $stmt = $this->pdo->prepare("
            SELECT r.*, rol.name as role_name 
            FROM approval_rules r
            LEFT JOIN roles rol ON r.required_role_id = rol.id
            WHERE r.policy_id IN ($inQuery)
            ORDER BY r.min_amount ASC
        ");
        $stmt->execute($policyIds);
        $rules = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rules as $rule) {
            $min = (float)($rule['min_amount'] ?? 0);
            if ($amount >= $min) {
                $result = "Requiere aprobación de: " . ($rule['role_name'] ?? 'Rol Desconocido');
            }
        }

        Response::json(['result' => $result]);
    }


    private function membersDestroy(string $companyId, string $memberId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $stmt = $this->pdo->prepare("UPDATE company_users SET deleted_at = NOW() WHERE id LIKE :id AND company_id LIKE :cid");
        $stmt->execute([':id' => $memberId, ':cid' => $companyId]);

        $this->audit('tenant.member.removed', 'company_user', $memberId, ['company_id' => $companyId]);

        Response::json(['message' => 'Miembro eliminado']);
    }

    private function membersToggleAccess(string $companyId, string $memberId): void
    {
        $stmt = $this->pdo->prepare("SELECT status FROM company_users WHERE id LIKE :id AND company_id LIKE :cid");
        $stmt->execute([':id' => $memberId, ':cid' => $companyId]);
        $curr = $stmt->fetchColumn();
        
        if (!$curr) {
            Response::error('Miembro no encontrado', 404);
            return;
        }

        $newStatus = ($curr === 'active') ? 'disabled' : 'active';
        $stmt = $this->pdo->prepare("UPDATE company_users SET status = :st WHERE id LIKE :id");
        $stmt->execute([':st' => $newStatus, ':id' => $memberId]);
        
        Response::json(['message' => 'Acceso actualizado', 'status' => $newStatus]);
    }

    private function membersResendInvite(string $companyId, string $memberId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        // Fetch member details
        $stmt = $this->pdo->prepare("
            SELECT u.email, u.full_name 
            FROM company_users cu
            JOIN users u ON u.id LIKE cu.user_id
            WHERE cu.id LIKE :mid AND cu.company_id LIKE :cid AND cu.deleted_at IS NULL
        ");
        $stmt->execute([':mid' => $memberId, ':cid' => $companyId]);
        $member = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$member) {
            Response::error('Miembro no encontrado', 404);
            return;
        }

        $email = $member['email'];
        $name = $member['full_name'];

        // Fetch company name
        $stmtC = $this->pdo->prepare("SELECT legal_name FROM companies WHERE id LIKE :id");
        $stmtC->execute([':id' => $companyId]);
        $companyName = $stmtC->fetchColumn() ?: 'Spectra ERP';

        try {
            $inviteLink = getenv('FRONTEND_URL') . "/accept-invite?token=" . $memberId; 
            $subject = "Recordatorio: Invitación a unirse a {$companyName}";
            
            $body = "
            <h2>Hola, {$name}</h2>
            <p>Este es un recordatorio de que has sido invitado a formar parte del equipo de <strong>{$companyName}</strong> en la plataforma Spectra ERP.</p>
            <p>Para aceptar la invitación y acceder, por favor haz clic en el siguiente enlace:</p>
            <p>
                <a href='{$inviteLink}' style='background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;'>Aceptar Invitación</a>
            </p>
            <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
            <p>{$inviteLink}</p>
            <br>
            <p>Saludos,<br>El equipo de Spectra ERP</p>
            ";
            
            SMTP::send($email, $subject, $body, true);

            $this->audit('tenant.member.invite_resent', 'company_user', $memberId, ['email' => $email]);

            Response::json(['message' => 'Invitación reenviada correctamente']);
        } catch (Exception $e) {
            error_log("SMTP Error resending invite to {$email}: " . $e->getMessage());
            Response::error('Error al enviar el correo', 500);
        }
    }

    private function membersResetRole(string $companyId, string $memberId): void
    {
        try {
            $this->pdo->beginTransaction();

            // 1. Remove existing roles
            $stmt = $this->pdo->prepare("DELETE FROM user_roles WHERE company_user_id LIKE :mid");
            $stmt->execute([':mid' => $memberId]);

            // 2. Find 'Viewer' role
            $stmt = $this->pdo->prepare("SELECT id FROM roles WHERE company_id LIKE :cid AND name LIKE 'Viewer' LIMIT 1");
            $stmt->execute([':cid' => $companyId]);
            $roleId = $stmt->fetchColumn();

            // 3. If not exists, create it
            if (!$roleId) {
                $roleId = $this->uuid();
                $stmt = $this->pdo->prepare("INSERT INTO roles (id, company_id, name, created_at) VALUES (:id, :cid, 'Viewer', NOW())");
                $stmt->execute([':id' => $roleId, ':cid' => $companyId]);
                
                // Assign basic permissions (*.read)
                $stmt = $this->pdo->query("SELECT id FROM permissions WHERE code LIKE '%.read'");
                $permIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
                
                if (!empty($permIds)) {
                    $sql = "INSERT INTO role_permissions (role_id, permission_id) VALUES ";
                    $vals = [];
                    $binds = [];
                    foreach ($permIds as $pid) {
                        $vals[] = "(?, ?)";
                        $binds[] = $roleId;
                        $binds[] = $pid;
                    }
                    $this->pdo->prepare($sql . implode(', ', $vals))->execute($binds);
                }
            }

            // 4. Assign role
            $stmt = $this->pdo->prepare("INSERT INTO user_roles (company_user_id, role_id) VALUES (:mid, :rid)");
            $stmt->execute([':mid' => $memberId, ':rid' => $roleId]);

            $this->audit('member.role_reset', 'company_user', $memberId, ['new_role' => 'Viewer']);

            $this->pdo->commit();
            Response::json(['message' => 'Roles reseteados a Viewer (solo lectura)']);
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        }
    }

    private function membersForcePasswordReset(string $companyId, string $memberId): void
    {
        // Check member
        $stmt = $this->pdo->prepare("SELECT user_id FROM company_users WHERE id LIKE :id AND company_id LIKE :cid");
        $stmt->execute([':id' => $memberId, ':cid' => $companyId]);
        $userId = $stmt->fetchColumn();

        if (!$userId) {
            Response::error('Miembro no encontrado', 404);
            return;
        }

        $stmt = $this->pdo->prepare("UPDATE users SET password_change_required = 1 WHERE id LIKE :uid");
        $stmt->execute([':uid' => $userId]);

        $this->audit('member.password_reset_forced', 'company_user', $memberId, ['user_id' => $userId]);
        Response::json(['message' => 'Solicitud de cambio de contraseña forzada activada']);
    }

    /* =========================
       EXPORT
       ========================= */

    private function exportData(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        // Gather data
        $company = $this->fetchCompanyWithRelations($companyId);
        $settings = $this->fetchSettings($companyId);
        $wallet = $this->fetchWallet($companyId);
        
        // Members (guarded by table existence)
        $members = [];
        if ($this->tableExists('company_users') && $this->tableExists('users')) {
            try {
                $stmt = $this->pdo->prepare("
                    SELECT u.full_name, u.email, cu.job_title, cu.status 
                    FROM company_users cu 
                    JOIN users u ON u.id LIKE cu.user_id 
                    WHERE cu.company_id LIKE :cid
                ");
                $stmt->execute([':cid' => $companyId]);
                $members = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
            } catch (\Throwable $e) { $members = []; }
        }

        // Contacts (guarded by table existence)
        $contacts = [];
        if ($this->tableExists('company_contacts')) {
            try {
                $stmt = $this->pdo->prepare("SELECT * FROM company_contacts WHERE company_id LIKE :cid");
                $stmt->execute([':cid' => $companyId]);
                $contacts = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
            } catch (\Throwable $e) { $contacts = []; }
        }

        $data = [
            'generated_at' => date('c'),
            'company' => $company,
            'settings' => $settings,
            'wallet' => $wallet,
            'members' => $members,
            'contacts' => $contacts,
        ];

        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="export_' . $companyId . '.json"');
        echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit;
    }

    /* =========================
       LOGS / AUDIT
       ========================= */

    private function logsIndex(string $companyId): void
    {
        // Security Check for Company Admin
        $user = Auth::user();
        if ($user && isset($user['platform_role']) && $user['platform_role'] === 'company_admin') {
            if (($user['company_id'] ?? '') !== $companyId) {
                 Response::error('Unauthorized access to company logs', 403);
                 return;
            }
        }

        $logger = new \App\Support\AuditLogger();
        $filters = ['company_id' => $companyId];
        $limit = 100;

        $result = $logger->getLogs($filters, $limit, 0);
        $logs = $result['data'];

        $actorIds = [];
        foreach ($logs as $log) {
            if (!empty($log['actor_user_id'])) {
                $actorIds[$log['actor_user_id']] = true;
            }
        }
        $actorIds = array_keys($actorIds);

        $actors = [];
        if ($actorIds) {
            $placeholders = implode(',', array_fill(0, count($actorIds), '?'));
            $stmt = $this->pdo->prepare("SELECT id, full_name, email FROM users WHERE id IN ($placeholders)");
            $stmt->execute($actorIds);
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $u) {
                $actors[$u['id']] = $u;
            }
        }

        foreach ($logs as &$log) {
            if (isset($actors[$log['actor_user_id'] ?? ''])) {
                $log['actor_name'] = $actors[$log['actor_user_id']]['full_name'];
                $log['actor_email'] = $actors[$log['actor_user_id']]['email'];
            }
            if (empty($log['description'])) {
                $log['description'] = $this->generateAuditDescription($log['action'], $log['metadata'] ?? []);
            }
        }

        Response::json($logs);
    }

    /* =========================
       VIEWS: WALLET / INVOICES / PAYROLL / PROJECTS / CONTRACTS
       ========================= */

    private function walletShow(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $wallet = $this->fetchWallet($companyId);
        if (!$wallet) {
            $company = $this->fetchCompany($companyId);
            $currencyId = (int)($company['default_currency_id'] ?? 0);
            if ($currencyId > 0) $this->ensureWallet($companyId, $currencyId);
            $wallet = $this->fetchWallet($companyId);
        }

        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(200, (int)($_GET['per_page'] ?? 10)));
        $offset = ($page - 1) * $perPage;

        $tx = [];
        $meta = ['page' => $page, 'per_page' => $perPage, 'total' => 0, 'total_pages' => 1];

        if ($this->tableExists('wallet_transactions')) {
            $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM wallet_transactions WHERE company_id LIKE :cid");
            $countStmt->execute([':cid' => $companyId]);
            $total = (int)$countStmt->fetchColumn();

            $stmt = $this->pdo->prepare("SELECT * FROM wallet_transactions WHERE company_id LIKE :cid ORDER BY created_at DESC LIMIT :l OFFSET :o");
            $stmt->bindValue(':cid', $companyId);
            $stmt->bindValue(':l', $perPage, PDO::PARAM_INT);
            $stmt->bindValue(':o', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $tx = $stmt->fetchAll() ?: [];

            $meta = [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int)ceil($total / max(1, $perPage))),
            ];
        }

        Response::json([
            'data' => [
                'wallet' => $wallet,
                'transactions' => $tx,
            ],
            'meta' => $meta,
        ]);
    }

    private function walletDeposit(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $wallet = $this->fetchWallet($companyId);
        if (!$wallet) {
            $company = $this->fetchCompany($companyId);
            $currencyId = (int)($company['default_currency_id'] ?? 0);
            if ($currencyId > 0) $this->ensureWallet($companyId, $currencyId);
            $wallet = $this->fetchWallet($companyId);
        }
        
        if (!$wallet) {
            Response::error('No se pudo inicializar la billetera', 500);
            return;
        }

        $data = $this->readPayload();
        $amount = (float)($data['amount'] ?? 0);
        $description = trim((string)($data['description'] ?? 'Depósito manual'));

        if ($amount <= 0) {
            Response::error('El monto debe ser mayor a 0', 422);
            return;
        }

        $this->ensureWalletTransactionsTable();

        try {
            $this->pdo->beginTransaction();

            // 1. Update Wallet Balance
            $newBalance = (float)$wallet['balance'] + $amount;
            $stmt = $this->pdo->prepare("UPDATE wallets SET balance = :bal, updated_at = NOW() WHERE company_id = :cid");
            $stmt->execute([':bal' => $newBalance, ':cid' => $companyId]);

            // 2. Log Transaction
            $txId = $this->uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO wallet_transactions (id, company_id, type, amount, currency_id, reference_type, reference_id, description, status, created_at)
                VALUES (:id, :cid, 'deposit', :amt, :cur, 'manual', NULL, :desc, 'completed', NOW())
            ");
            $stmt->execute([
                ':id' => $txId,
                ':cid' => $companyId,
                ':amt' => $amount,
                ':cur' => $wallet['currency_id'],
                ':desc' => $description
            ]);

            $this->pdo->commit();
            
            $this->audit('tenant.wallet.deposit', 'wallet', $wallet['company_id'], ['amount' => $amount]);

            Response::json(['message' => 'Depósito realizado exitosamente', 'new_balance' => $newBalance]);

        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            Response::error('Error al realizar depósito: ' . $e->getMessage(), 500);
        }
    }

    private function invoicesIndex(string $companyId): void
    {
        $this->ensureInvoicesTable();

        // Auto-update overdue status
        try {
            $this->pdo->prepare("
                UPDATE invoices 
                SET status = 'overdue' 
                WHERE company_id = :cid 
                  AND status IN ('draft', 'sent', 'issued') 
                  AND due_date < CURRENT_DATE
            ")->execute([':cid' => $companyId]);
        } catch (\Throwable $e) {
            // Ignore error if column missing or other temp issue, to allow listing to proceed
        }

        $customWhere = [];
        $type = $_GET['type'] ?? null;
        if ($type === 'platform') {
            $customWhere[] = '(contract_id IS NULL AND freelancer_id IS NULL)'; 
        } elseif ($type === 'freelancer') {
            $customWhere[] = '(contract_id IS NOT NULL OR freelancer_id IS NOT NULL)';
        }

        $this->pagedCompanyIndex($companyId, 'invoices', ['status', 'currency_id'], $customWhere);
    }

    private function invoicesStore(string $companyId): void
    {
        $this->ensureInvoicesTable();
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $data = $this->readPayload();
        
        $contractId = $data['contract_id'] ?? null;
        $freelancerId = $data['freelancer_id'] ?? null;
        $invoiceNumber = trim((string)($data['invoice_number'] ?? ''));
        $issueDate = trim((string)($data['issue_date'] ?? ''));
        $dueDate = trim((string)($data['due_date'] ?? ''));
        $currencyId = (int)($data['currency_id'] ?? 0);
        $items = $data['items'] ?? [];
        $notes = trim((string)($data['notes'] ?? ''));
        $contactId = $data['contact_id'] ?? null;
        $customerName = null; $customerEmail = null; $customerPhone = null;

        if ($contactId) {
            try {
                $stmt = $this->pdo->prepare("SELECT name, email, phone FROM company_contacts WHERE id LIKE :id AND company_id LIKE :cid");
                $stmt->execute([':id' => $contactId, ':cid' => $companyId]);
                $c = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($c) {
                    $customerName = $c['name'] ?? null;
                    $customerEmail = $c['email'] ?? null;
                    $customerPhone = $c['phone'] ?? null;
                } else {
                    $contactId = null;
                }
            } catch (\Throwable $e) {
                $contactId = null;
            }
        }

        if ($invoiceNumber === '' || $issueDate === '' || $dueDate === '' || $currencyId <= 0) {
            Response::error('Faltan campos requeridos (invoice_number, issue_date, due_date, currency_id)', 422);
            return;
        }

        if (empty($items) || !is_array($items)) {
            Response::error('Debe incluir al menos una línea de factura (items)', 422);
            return;
        }

        // Calculate totals
        $subtotal = 0.0;
        foreach ($items as $item) {
            $qty = (float)($item['quantity'] ?? 1);
            $price = (float)($item['unit_price'] ?? 0);
            $subtotal += ($qty * $price);
        }
        
        // Calculate Taxes via TaxEngine
        $taxAmount = 0.0;
        if ($contractId) {
            $stmtC = $this->pdo->prepare("SELECT country, type, freelancer_id FROM contracts WHERE id = :id");
            $stmtC->execute([':id' => $contractId]);
            $contract = $stmtC->fetch(PDO::FETCH_ASSOC);
            
            if ($contract) {
                if (!$freelancerId) {
                    $freelancerId = $contract['freelancer_id'];
                }

                try {
                    $fiscalParams = $this->getFiscalParams($contract['country'] ?? '');
                    $taxes = \App\Support\TaxEngine::calculate($subtotal, $contract['country'], $contract['type'], [], $fiscalParams);
                    foreach ($taxes as $tax) {
                        if ($tax['type'] === 'tax' || $tax['type'] === 'deduction') {
                            $taxAmount -= $tax['amount'];
                        } else {
                            $taxAmount += $tax['amount'];
                        }
                    }
                } catch (Throwable $e) {}
            }
        }

        $total = $subtotal + $taxAmount;

        $invoiceId = $this->uuid();
        
        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("
                INSERT INTO invoices (
                    id, company_id, contract_id, freelancer_id, 
                    invoice_number, issue_date, due_date, currency_id, 
                    subtotal, tax_amount, total_amount, status, notes, 
                    contact_id, customer_name, customer_email, customer_phone, 
                    created_at
                ) VALUES (
                    :id, :cid, :contract, :freelancer,
                    :num, :issue, :due, :cur,
                    :sub, :tax, :total, 'draft', :notes,
                    :contact_id, :customer_name, :customer_email, :customer_phone,
                    NOW()
                )
            ");

            $stmt->execute([
                ':id' => $invoiceId,
                ':cid' => $companyId,
                ':contract' => $contractId,
                ':freelancer' => $freelancerId,
                ':num' => $invoiceNumber,
                ':issue' => $issueDate,
                ':due' => $dueDate,
                ':cur' => $currencyId,
                ':sub' => $subtotal,
                ':tax' => $taxAmount,
                ':total' => $total,
                ':notes' => $notes,
                ':contact_id' => $contactId,
                ':customer_name' => $customerName,
                ':customer_email' => $customerEmail,
                ':customer_phone' => $customerPhone
            ]);

            $lineStmt = $this->pdo->prepare("
                INSERT INTO invoice_lines (
                    id, invoice_id, concept, quantity, unit_price, line_total, created_at
                ) VALUES (
                    :id, :inv_id, :desc, :qty, :price, :amt, NOW()
                )
            ");

            foreach ($items as $item) {
                $qty = (float)($item['quantity'] ?? 1);
                $price = (float)($item['unit_price'] ?? 0);
                $amt = $qty * $price;
                $desc = trim((string)($item['description'] ?? 'Item'));

                $lineStmt->execute([
                    ':id' => $this->uuid(),
                    ':inv_id' => $invoiceId,
                    ':desc' => $desc,
                    ':qty' => $qty,
                    ':price' => $price,
                    ':amt' => $amt
                ]);
            }

            $this->pdo->commit();
            
            $this->audit('tenant.invoice.created', 'invoice', $invoiceId, ['company_id' => $companyId, 'amount' => $total]);
            
            Response::json(['message' => 'Factura creada', 'id' => $invoiceId], 201);

        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Error al crear factura: ' . $e->getMessage(), 500);
        }
    }

    private function invoicesShow(string $companyId, string $invoiceId): void
    {
        $this->ensureInvoicesTable();
        
        $stmt = $this->pdo->prepare("
            SELECT 
                i.*, 
                c.code as currency_code, 
                c.symbol as currency_symbol,
                con.title as contract_title,
                SUBSTRING_INDEX(u.full_name, ' ', 1) as freelancer_first_name,
                CASE WHEN LOCATE(' ', u.full_name) > 0 THEN SUBSTRING(u.full_name, LOCATE(' ', u.full_name) + 1) ELSE '' END as freelancer_last_name
            FROM invoices i
            LEFT JOIN currencies c ON i.currency_id = c.id
            LEFT JOIN contracts con ON i.contract_id = con.id
            LEFT JOIN users u ON i.freelancer_id = u.id
            WHERE i.id = :id AND i.company_id = :cid
        ");
        $stmt->execute([':id' => $invoiceId, ':cid' => $companyId]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$invoice) {
            Response::error('Factura no encontrada', 404);
            return;
        }

        // Fetch lines (normalize column names for frontend)
        $lineStmt = $this->pdo->prepare("
            SELECT 
                id,
                invoice_id,
                concept AS description,
                quantity,
                unit_price,
                line_total AS amount,
                tax_rate,
                created_at
            FROM invoice_lines 
            WHERE invoice_id = :inv_id 
            ORDER BY created_at ASC
        ");
        $lineStmt->execute([':inv_id' => $invoiceId]);
        $invoice['items'] = $lineStmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json($invoice);
    }

    private function ensureCompanySubscriptionsTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS subscription_plans (
                id CHAR(36) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                code VARCHAR(50) NOT NULL,
                price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                billing_interval ENUM('monthly', 'yearly') DEFAULT 'monthly',
                currency_id INT NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_code (code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        try { $this->pdo->exec("ALTER TABLE subscription_plans ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"); } catch (\Throwable $e) {}

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS company_subscriptions (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                plan_id CHAR(36) NOT NULL,
                status ENUM('active', 'canceled', 'expired') DEFAULT 'active',
                start_date DATE NOT NULL,
                next_billing_date DATE NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_company (company_id),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        try { $this->pdo->exec("ALTER TABLE company_subscriptions ADD COLUMN payment_method_json TEXT NULL AFTER next_billing_date"); } catch (\Throwable $e) {}
    }

    private function ensureCompanyFeeRulesTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS company_fee_rules (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                type VARCHAR(50) NOT NULL,
                value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                currency_id INT NULL,
                active TINYINT(1) DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_company (company_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    private function ensurePayrollsTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS payroll_runs (
                id CHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                payment_date DATE NULL,
                status ENUM('draft', 'processing', 'paid', 'approved', 'failed') DEFAULT 'draft',
                total_amount DECIMAL(15, 2) DEFAULT 0.00,
                currency_id INT NOT NULL DEFAULT 1,
                created_by_company_user_id CHAR(36) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at DATETIME NULL,
                INDEX idx_company (company_id),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Lazy migration for existing payroll_runs tables created without these columns
        try { $this->pdo->exec("ALTER TABLE payroll_runs ADD COLUMN currency_id INT NOT NULL DEFAULT 1"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE payroll_runs ADD COLUMN deleted_at DATETIME NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE payroll_runs ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"); } catch (\Throwable $e) {}

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS payroll_items (
                id CHAR(36) PRIMARY KEY,
                payroll_run_id CHAR(36) NULL,
                user_id VARCHAR(36) NOT NULL,
                contract_id CHAR(36) NULL,
                invoice_id CHAR(36) NULL,
                type ENUM('earning', 'deduction', 'tax', 'reimbursement') NOT NULL,
                description VARCHAR(255) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                currency_id INT NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user (user_id),
                INDEX idx_run (payroll_run_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Lazy migration for existing payroll_items tables created without contract_id/invoice_id
        try { $this->pdo->exec("ALTER TABLE payroll_items ADD COLUMN contract_id CHAR(36) NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE payroll_items ADD COLUMN invoice_id CHAR(36) NULL"); } catch (\Throwable $e) {}
    }

    private function ensureWalletTransactionsTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS wallet_transactions (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                wallet_id CHAR(36) NULL, 
                type ENUM('deposit', 'withdrawal', 'transfer', 'payment', 'refund') NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                currency_id INT NOT NULL,
                reference_type VARCHAR(50) NULL,
                reference_id CHAR(36) NULL,
                description VARCHAR(255) NULL,
                status ENUM('pending', 'completed', 'failed') DEFAULT 'completed',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_company (company_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    private function payrollIndex(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $this->ensurePayrollsTable();

        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(200, (int)($_GET['per_page'] ?? 10)));
        $offset = ($page - 1) * $perPage;

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM payroll_runs WHERE company_id = :cid AND deleted_at IS NULL");
        $countStmt->execute([':cid' => $companyId]);
        $total = (int)$countStmt->fetchColumn();

        $sql = "
            SELECT p.*, c.code as currency_code, c.symbol as currency_symbol
            FROM payroll_runs p
            LEFT JOIN currencies c ON p.currency_id = c.id
            WHERE p.company_id = :cid AND p.deleted_at IS NULL
            ORDER BY p.period_end DESC
            LIMIT :limit OFFSET :offset
        ";
        
        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':cid', $companyId);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $rows,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage)
            ]
        ]);
    }

    private function payrollStore(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $this->ensurePayrollsTable();

        $payload = $this->readPayload();
        $start = $payload['period_start'] ?? null;
        $end = $payload['period_end'] ?? null;
        $currencyId = $payload['currency_id'] ?? null;
        $amount = $payload['total_amount'] ?? 0;
        $items = $payload['items'] ?? [];

        if (!$start || !$end || !$currencyId) {
            Response::error('Fechas y moneda requeridas', 422);
            return;
        }

        try {
            $this->pdo->beginTransaction();

            $id = $this->uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO payroll_runs (id, company_id, period_start, period_end, total_amount, currency_id, status, created_at)
                VALUES (:id, :cid, :start, :end, :amount, :cur, 'draft', NOW())
            ");
            
            $stmt->execute([
                ':id' => $id,
                ':cid' => $companyId,
                ':start' => $start,
                ':end' => $end,
                ':amount' => $amount,
                ':cur' => $currencyId
            ]);

            if (!empty($items) && is_array($items)) {
                $stmtItem = $this->pdo->prepare("
                    INSERT INTO payroll_items (id, payroll_run_id, user_id, type, description, amount, currency_id)
                    VALUES (:id, :pid, :uid, :type, :desc, :amt, :cur)
                ");

                foreach ($items as $item) {
                    $stmtItem->execute([
                        ':id' => $this->uuid(),
                        ':pid' => $id,
                        ':uid' => $item['freelancer_id'] ?? $item['user_id'] ?? 'unknown',
                        ':type' => $item['type'] ?? 'earning',
                        ':desc' => $item['description'] ?? 'Item de nómina',
                        ':amt' => $item['amount'] ?? 0,
                        ':cur' => $currencyId
                    ]);
                }
            } else {
                // Auto-calculate from contracts
                $contractSql = "
                    SELECT c.*, u.id as user_id_from_user
                    FROM contracts c
                    LEFT JOIN users u ON c.freelancer_id = u.id
                    WHERE c.company_id = :cid 
                    AND c.status = 'active'
                    AND c.currency_id = :cur
                ";
                $stmtC = $this->pdo->prepare($contractSql);
                $stmtC->execute([':cid' => $companyId, ':cur' => $currencyId]);
                $contracts = $stmtC->fetchAll(PDO::FETCH_ASSOC);

                $totalPayroll = 0;
                $stmtItem = $this->pdo->prepare("
                    INSERT INTO payroll_items (id, payroll_run_id, user_id, contract_id, type, description, amount, currency_id)
                    VALUES (:id, :pid, :uid, :cid, :type, :desc, :amt, :cur)
                ");

                foreach ($contracts as $contract) {
                    $gross = (float)$contract['rate']; 
                    if ($contract['payment_frequency'] === 'hourly') {
                        $gross = $gross * 160; 
                    }

                    $userId = $contract['freelancer_id'] ?? $contract['user_id_from_user'];
                    if (!$userId) continue;

                    // 1. Gross Salary (Earning)
                    $stmtItem->execute([
                        ':id' => $this->uuid(),
                        ':pid' => $id,
                        ':uid' => $userId,
                        ':cid' => $contract['id'],
                        ':type' => 'earning',
                        ':desc' => 'Salario Base',
                        ':amt' => $gross,
                        ':cur' => $currencyId
                    ]);
                    $totalPayroll += $gross;

                    // 2. Taxes (Deductions/Taxes)
                    try {
                        $fiscalParams = $this->getFiscalParams($contract['country'] ?? 'PE');
                        $taxes = TaxEngine::calculate($gross, $contract['country'] ?? 'PE', $contract['type'], [], $fiscalParams);
                        foreach ($taxes as $tax) {
                             $stmtItem->execute([
                                ':id' => $this->uuid(),
                                ':pid' => $id,
                                ':uid' => $userId,
                                ':cid' => $contract['id'],
                                ':type' => $tax['type'],
                                ':desc' => $tax['name'],
                                ':amt' => $tax['amount'],
                                ':cur' => $currencyId
                            ]);
                            if ($tax['type'] === 'deduction' || $tax['type'] === 'tax') {
                                $totalPayroll -= $tax['amount'];
                            }
                        }
                    } catch (\Throwable $e) {}
                }

                // Update total amount if calculated
                if ($totalPayroll > 0) {
                    $this->pdo->prepare("UPDATE payroll_runs SET total_amount = :amt WHERE id = :id")
                        ->execute([':amt' => $totalPayroll, ':id' => $id]);
                }
            }

            $this->audit('tenant.payroll.created', 'payroll_run', $id, ['company_id' => $companyId]);

            $this->pdo->commit();
            Response::json(['message' => 'Planilla creada', 'id' => $id], 201);

        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            Response::error('Error al crear planilla: ' . $e->getMessage(), 500);
        }
    }

    private function payrollShow(string $companyId, string $payrollId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $this->ensurePayrollsTable();

        $stmt = $this->pdo->prepare("
            SELECT p.*, c.code as currency_code, c.symbol as currency_symbol
            FROM payroll_runs p
            LEFT JOIN currencies c ON p.currency_id = c.id
            WHERE p.id = :id AND p.company_id = :cid AND p.deleted_at IS NULL
        ");
        $stmt->execute([':id' => $payrollId, ':cid' => $companyId]);
        $payroll = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$payroll) {
            Response::error('Nómina no encontrada', 404);
            return;
        }

        // Fetch Items
        $stmtItems = $this->pdo->prepare("
            SELECT pi.*, 
                   COALESCE(u.first_name, 'Unknown') as user_first_name, 
                   COALESCE(u.last_name, 'User') as user_last_name,
                   COALESCE(u.email, '') as user_email
            FROM payroll_items pi
            LEFT JOIN users u ON pi.user_id = u.id
            WHERE pi.payroll_run_id = :pid
            ORDER BY u.last_name, u.first_name
        ");
        $stmtItems->execute([':pid' => $payrollId]);
        $items = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

        $payroll['items'] = $items;

        Response::json($payroll);
    }

    private function payrollPay(string $companyId, string $payrollId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $this->ensurePayrollsTable();
        $this->ensureWalletTransactionsTable();

        // 1. Fetch Payroll
        $stmt = $this->pdo->prepare("SELECT * FROM payroll_runs WHERE id = :id AND company_id = :cid");
        $stmt->execute([':id' => $payrollId, ':cid' => $companyId]);
        $payroll = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$payroll) {
            Response::error('Nómina no encontrada', 404);
            return;
        }

        if ($payroll['status'] === 'paid') {
            Response::error('Esta nómina ya ha sido pagada', 400);
            return;
        }
        
        if ($payroll['status'] === 'processing') {
             Response::error('Esta nómina ya está en proceso', 400);
             return;
        }

        $amount = (float)$payroll['total_amount'];
        if ($amount <= 0) {
             Response::error('El monto de la nómina debe ser mayor a 0', 400);
             return;
        }

        // 2. Fetch Wallet
        $wallet = $this->fetchWallet($companyId);
        if (!$wallet) {
            // Try to ensure wallet exists
            $company = $this->fetchCompany($companyId);
            $currencyId = (int)($company['default_currency_id'] ?? 0);
            if ($currencyId > 0) $this->ensureWallet($companyId, $currencyId);
            $wallet = $this->fetchWallet($companyId);
        }
        
        if (!$wallet) {
             Response::error('No se encontró billetera para esta empresa', 404);
             return;
        }

        // Check currency match
        if ((int)$wallet['currency_id'] !== (int)$payroll['currency_id']) {
            Response::error('La moneda de la billetera no coincide con la de la nómina', 400);
            return;
        }

        // Check Balance
        // --- PAYROLL FEE LOGIC ---
        $stmtRule = $this->pdo->prepare("SELECT * FROM company_fee_rules WHERE company_id = :cid AND type = 'payroll_fee' AND active = 1 LIMIT 1");
        $stmtRule->execute([':cid' => $companyId]);
        $feeRule = $stmtRule->fetch(PDO::FETCH_ASSOC);

        $feeAmount = 0;
        if ($feeRule) {
            $feeAmount = (float)$feeRule['value'];
        }

        $totalRequired = $amount + $feeAmount;

        if ((float)$wallet['balance'] < $totalRequired) {
            Response::error("Saldo insuficiente en la billetera. Requerido: $totalRequired (Nómina: $amount + Fee: $feeAmount)", 400);
            return;
        }

        try {
            $this->pdo->beginTransaction();

            // 3. Deduct from Wallet (Payroll + Fee)
            $newBalance = (float)$wallet['balance'] - $totalRequired;
            $stmt = $this->pdo->prepare("UPDATE wallets SET balance = :bal, updated_at = NOW() WHERE company_id = :cid");
            $stmt->execute([':bal' => $newBalance, ':cid' => $companyId]);

            // 4. Create Transaction (Payroll)
            $txId = $this->uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO wallet_transactions (id, company_id, type, amount, currency_id, reference_type, reference_id, description, status, created_at)
                VALUES (:id, :cid, 'payment', :amt, :cur, 'payroll', :ref, :desc, 'completed', NOW())
            ");
            $stmt->execute([
                ':id' => $txId,
                ':cid' => $companyId,
                ':amt' => -$amount, 
                ':cur' => $payroll['currency_id'],
                ':ref' => $payrollId,
                ':desc' => 'Pago de Nómina ' . $payroll['period_start'] . ' - ' . $payroll['period_end']
            ]);

            // 4b. Create Fee Transaction
            if ($feeAmount > 0) {
                 $feeTxId = $this->uuid();
                 $stmt = $this->pdo->prepare("
                    INSERT INTO wallet_transactions (id, company_id, type, amount, currency_id, reference_type, reference_id, description, status, created_at)
                    VALUES (:id, :cid, 'payment', :amt, :cur, 'payroll_fee', :ref, :desc, 'completed', NOW())
                ");
                $stmt->execute([
                    ':id' => $feeTxId,
                    ':cid' => $companyId,
                    ':amt' => -$feeAmount, 
                    ':cur' => $payroll['currency_id'], // Assume same currency
                    ':ref' => $payrollId,
                    ':desc' => 'Fee por Procesamiento de Nómina'
                ]);
            }

            // 5. Update Payroll Status
            $stmt = $this->pdo->prepare("UPDATE payroll_runs SET status = 'paid', updated_at = NOW() WHERE id = :id");
            $stmt->execute([':id' => $payrollId]);

            $this->audit('tenant.payroll.paid', 'payroll', $payrollId, ['amount' => $amount, 'currency' => $payroll['currency_id']]);

            $this->pdo->commit();

            Response::json(['message' => 'Nómina pagada exitosamente', 'transaction_id' => $txId]);

        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            Response::error('Error al procesar el pago: ' . $e->getMessage(), 500);
        }
    }

    private function projectsIndex(string $companyId): void
    {
        $this->ensureProjectsTable();
        $this->pagedCompanyIndex($companyId, 'projects', ['status']);
    }

    private function contractsIndex(string $companyId): void
    {
        $this->ensureContractsTable();
        
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 10)));
        $q = trim((string)($_GET['q'] ?? ''));
        $offset = ($page - 1) * $perPage;
        
        $where = ['c.company_id = :cid'];
        $params = [':cid' => $companyId];
        
        if (!empty($_GET['status'])) {
            $where[] = 'c.status LIKE :status';
            $params[':status'] = $_GET['status'];
        }
        
        if ($q !== '') {
            $where[] = '(c.title LIKE :q OR c.id LIKE :q)';
            $params[':q'] = "%$q%";
        }
        
        $whereSql = implode(' AND ', $where);
        
        // Count
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM contracts c WHERE $whereSql");
        $stmt->execute($params);
        $total = (int)$stmt->fetchColumn();
        
        // Fetch with Envelope
        $sql = "
            SELECT c.*, 
                   env.id as envelope_db_id, env.envelope_id as docusign_id, 
                   env.status as envelope_status, env.provider as envelope_provider
            FROM contracts c 
            LEFT JOIN docusign_envelopes env ON c.id = env.contract_id
            WHERE $whereSql
            ORDER BY c.created_at DESC 
            LIMIT :limit OFFSET :offset
        ";
        
        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        Response::json([
            'data' => $items,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage)
            ]
        ]);
    }

    private function contractsStore(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $this->ensureContractsTable();

        $data = $this->readPayload();
        
        $title = trim((string)($data['title'] ?? ''));
        $type = trim((string)($data['type'] ?? 'fixed')); 
        $freelancerId = $data['freelancer_id'] ?? null;
        $currencyId = (int)($data['currency_id'] ?? 0);
        $rate = (float)($data['rate'] ?? 0);
        $startDate = trim((string)($data['start_date'] ?? ''));
        $endDate = trim((string)($data['end_date'] ?? ''));
        
        // New Fields
        $scope = trim((string)($data['scope_of_work'] ?? ''));
        $special = trim((string)($data['special_clause'] ?? ''));
        $notice = (int)($data['notice_period'] ?? 0);
        $country = trim((string)($data['country'] ?? ''));
        $templateId = trim((string)($data['template_id'] ?? ''));
        
        if ($title === '' || $startDate === '' || $currencyId <= 0) {
            Response::error('Faltan campos requeridos (title, start_date, currency_id)', 422);
            return;
        }

        if ($type === 'eor_employee' && $country === '') {
             Response::error('El país es requerido para empleados EOR', 422);
             return;
        }

        $id = $this->uuid();
        
        $stmt = $this->pdo->prepare("
            INSERT INTO contracts (
                id, company_id, freelancer_id, template_id, title, type, status, 
                start_date, end_date, currency_id, rate, 
                scope_of_work, special_clause, notice_period, country,
                created_at
            ) VALUES (
                :id, :cid, :fid, :tpl, :title, :type, 'draft',
                :start, :end, :cur, :rate,
                :scope, :special, :notice, :country,
                NOW()
            )
        ");
        
        try {
            $stmt->execute([
                ':id' => $id,
                ':cid' => $companyId,
                ':fid' => $freelancerId,
                ':tpl' => $templateId ?: null,
                ':title' => $title,
                ':type' => $type,
                ':start' => $startDate,
                ':end' => $endDate ?: null,
                ':cur' => $currencyId,
                ':rate' => $rate,
                ':scope' => $scope,
                ':special' => $special,
                ':notice' => $notice,
                ':country' => $country ?: null
            ]);
            
            $this->audit('tenant.contract.created', 'contract', $id, ['company_id' => $companyId]);

            try {
                $companyName = null;
                try {
                    $stmtC = $this->pdo->prepare("SELECT legal_name FROM companies WHERE id = :id LIMIT 1");
                    $stmtC->execute([':id' => $companyId]);
                    $companyName = $stmtC->fetchColumn() ?: null;
                } catch (\Throwable $e) {}

                $freelancerName = null;
                if (!empty($freelancerId)) {
                    try {
                        $stmtF = $this->pdo->prepare("SELECT full_name FROM users WHERE id = :id LIMIT 1");
                        $stmtF->execute([':id' => $freelancerId]);
                        $freelancerName = $stmtF->fetchColumn() ?: null;
                    } catch (\Throwable $e) {}
                }

                $notif = new \App\Controllers\NotificationController($this->database);
                $adminUserIds = [];

                try {
                    $stmtAdmins = $this->pdo->prepare("
                        SELECT DISTINCT cu.user_id
                        FROM company_users cu
                        JOIN user_roles ur ON ur.company_user_id = cu.id
                        JOIN roles r ON r.id = ur.role_id
                        WHERE cu.company_id = :cid
                          AND cu.status = 'active'
                          AND r.name = 'Admin'
                    ");
                    $stmtAdmins->execute([':cid' => $companyId]);
                    $adminUserIds = $stmtAdmins->fetchAll(PDO::FETCH_COLUMN) ?: [];
                } catch (\Throwable $e) {
                    $adminUserIds = [];
                }

                if (empty($adminUserIds)) {
                    try {
                        $stmtAdmins2 = $this->pdo->prepare("
                            SELECT DISTINCT user_id
                            FROM company_users
                            WHERE company_id = :cid
                              AND status = 'active'
                            ORDER BY created_at ASC
                            LIMIT 5
                        ");
                        $stmtAdmins2->execute([':cid' => $companyId]);
                        $adminUserIds = $stmtAdmins2->fetchAll(PDO::FETCH_COLUMN) ?: [];
                    } catch (\Throwable $e) {
                        $adminUserIds = [];
                    }
                }

                $adminTitle = 'Nuevo contrato creado';
                $adminMsg = 'Se creó el contrato "' . $title . '"' . ($freelancerName ? (' para ' . $freelancerName) : '') . '.';
                if ($companyName) $adminMsg .= ' Empresa: ' . $companyName . '.';
                $adminLink = '/dashboard/tenants/' . $companyId . '/contracts';

                $seen = [];
                foreach ($adminUserIds as $uid) {
                    $uid = (string)$uid;
                    if ($uid === '') continue;
                    if (isset($seen[$uid])) continue;
                    $seen[$uid] = true;
                    $notif->create($uid, $adminTitle, $adminMsg, 'info', $companyId, $adminLink);
                }

                if (!empty($freelancerId)) {
                    $fid = (string)$freelancerId;
                    if ($fid !== '' && !isset($seen[$fid])) {
                        $fTitle = 'Tienes un nuevo contrato';
                        $fMsg = 'Se creó el contrato "' . $title . '"' . ($companyName ? (' con ' . $companyName) : '') . '.';
                        $notif->create($fid, $fTitle, $fMsg, 'info', $companyId, null);
                    }
                }
            } catch (\Throwable $e) {}
            
            Response::json(['message' => 'Contrato creado', 'id' => $id], 201);
        } catch (Throwable $e) {
            Response::error('Error al crear contrato: ' . $e->getMessage(), 500);
        }
    }

    private function contractsUpdate(string $companyId, string $contractId): void
    {
        $this->ensureContractsTable();
        
        // Verify ownership
        $stmt = $this->pdo->prepare("SELECT * FROM contracts WHERE id = :id AND company_id = :cid");
        $stmt->execute([':id' => $contractId, ':cid' => $companyId]);
        $contract = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$contract) {
            Response::error('Contrato no encontrado', 404);
            return;
        }

        $data = $this->readPayload();
        
        // Updateable fields
        $fields = [];
        $params = [':id' => $contractId];
        
        if (isset($data['title'])) { $fields[] = 'title = :title'; $params[':title'] = $data['title']; }
        if (isset($data['rate'])) { $fields[] = 'rate = :rate'; $params[':rate'] = (float)$data['rate']; }
        if (isset($data['start_date'])) { $fields[] = 'start_date = :start'; $params[':start'] = $data['start_date']; }
        if (isset($data['end_date'])) { $fields[] = 'end_date = :end'; $params[':end'] = $data['end_date'] ?: null; }
        if (isset($data['scope_of_work'])) { $fields[] = 'scope_of_work = :scope'; $params[':scope'] = $data['scope_of_work']; }
        if (isset($data['special_clause'])) { $fields[] = 'special_clause = :special'; $params[':special'] = $data['special_clause']; }
        if (isset($data['notice_period'])) { $fields[] = 'notice_period = :notice'; $params[':notice'] = (int)$data['notice_period']; }
        if (isset($data['status'])) { $fields[] = 'status = :status'; $params[':status'] = $data['status']; }

        if (empty($fields)) {
            Response::json(['message' => 'Nada que actualizar']);
            return;
        }

        $sql = "UPDATE contracts SET " . implode(', ', $fields) . " WHERE id = :id";
        
        try {
            $this->pdo->prepare($sql)->execute($params);
            $this->audit('tenant.contract.updated', 'contract', $contractId, ['company_id' => $companyId]);
            Response::json(['message' => 'Contrato actualizado']);
        } catch (Throwable $e) {
            Response::error('Error al actualizar contrato', 500);
        }
    }

    private function contractsTerminate(string $companyId, string $contractId): void
    {
        $this->ensureContractsTable();
        
        // Verify ownership
        $stmt = $this->pdo->prepare("SELECT * FROM contracts WHERE id = :id AND company_id = :cid");
        $stmt->execute([':id' => $contractId, ':cid' => $companyId]);
        $contract = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$contract) {
            Response::error('Contrato no encontrado', 404);
            return;
        }
        
        $data = $this->readPayload();
        $endDate = $data['end_date'] ?? date('Y-m-d');
        $reason = $data['reason'] ?? 'Termination';

        try {
            $stmt = $this->pdo->prepare("
                UPDATE contracts 
                SET status = 'terminated', end_date = :end 
                WHERE id = :id
            ");
            $stmt->execute([':end' => $endDate, ':id' => $contractId]);
            
            $this->audit('tenant.contract.terminated', 'contract', $contractId, [
                'company_id' => $companyId,
                'reason' => $reason,
                'end_date' => $endDate
            ]);
            
            Response::json(['message' => 'Contrato terminado exitosamente']);
        } catch (Throwable $e) {
            Response::error('Error al terminar contrato', 500);
        }
    }

    private function contractsAmend(string $companyId, string $contractId): void
    {
        $this->ensureAmendmentsTable();

        // Verify ownership
        $stmt = $this->pdo->prepare("SELECT * FROM contracts WHERE id = :id AND company_id = :cid");
        $stmt->execute([':id' => $contractId, ':cid' => $companyId]);
        $contract = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$contract) {
            Response::error('Contrato no encontrado', 404);
            return;
        }

        $data = $this->readPayload();
        
        // Capture changes
        $changes = [];
        $fields = ['rate', 'start_date', 'end_date', 'scope_of_work', 'special_clause', 'notice_period', 'title']; // Included title in check, but confusing with amendment title
        
        // If user is just creating an "Anexo" without changing contract fields, changes might be empty.
        // Requirement says "Anexos". Sometimes an annex is just a document added.
        // We should allow creating an amendment even if no contract fields change, IF there is a title/desc/doc provided.
        
        foreach ($fields as $f) {
            if (isset($data[$f]) && $data[$f] != $contract[$f]) {
                $changes[$f] = [
                    'old' => $contract[$f],
                    'new' => $data[$f]
                ];
            }
        }

        $amendmentTitle = $data['amendment_title'] ?? ('Enmienda ' . date('Y-m-d'));
        $amendmentDesc = $data['amendment_description'] ?? null;
        $documentUrl = $data['document_url'] ?? null;

        if (empty($changes) && empty($amendmentDesc) && empty($documentUrl)) {
            Response::error('Debe especificar cambios, una descripción o un documento para la enmienda', 422);
            return;
        }

        $id = $this->uuid();
        
        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO contract_amendments (
                    id, contract_id, title, description, changes_json, document_url, status, created_at, created_by
                ) VALUES (
                    :id, :cid, :title, :desc, :changes, :url, 'draft', NOW(), :uid
                )
            ");
            
            $stmt->execute([
                ':id' => $id,
                ':cid' => $contractId,
                ':title' => $amendmentTitle,
                ':desc' => $amendmentDesc,
                ':changes' => json_encode($changes),
                ':url' => $documentUrl,
                ':uid' => \App\Support\Auth::userId()
            ]);
            
            $this->audit('tenant.contract.amended', 'contract', $contractId, ['amendment_id' => $id]);
            
            Response::json(['message' => 'Enmienda/Anexo creado', 'id' => $id]);
        } catch (Throwable $e) {
            Response::error('Error al crear enmienda: ' . $e->getMessage(), 500);
        }
    }

    private function contractsAmendmentsList(string $companyId, string $contractId): void
    {
        $this->ensureAmendmentsTable();
        
        $stmt = $this->pdo->prepare("
            SELECT * FROM contract_amendments 
            WHERE contract_id = :cid 
            ORDER BY created_at DESC
        ");
        $stmt->execute([':cid' => $contractId]);
        
        Response::json($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    private function contractsAssignLegal(string $companyId, string $contractId): void
    {
        $this->ensureContractsTable();
        
        $data = $this->readPayload();
        $reviewerId = $data['legal_reviewer_id'] ?? null;
        
        if (!$reviewerId) {
             $sql = "UPDATE contracts SET legal_reviewer_id = NULL, legal_status = 'not_required' WHERE id = :id AND company_id = :cid";
             $this->pdo->prepare($sql)->execute([':id' => $contractId, ':cid' => $companyId]);
             Response::json(['message' => 'Revisor legal desasignado']);
             return;
        }

        $sql = "UPDATE contracts SET legal_reviewer_id = :rid, legal_status = 'pending_review' WHERE id = :id AND company_id = :cid";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([':rid' => $reviewerId, ':id' => $contractId, ':cid' => $companyId]);
        
        $this->audit('tenant.contract.legal_assigned', 'contract', $contractId, ['reviewer_id' => $reviewerId]);
        
        Response::json(['message' => 'Revisor legal asignado']);
    }

    private function contractsLegalReview(string $companyId, string $contractId): void
    {
        $this->ensureContractsTable();
        $this->ensureContractLegalObservationsTable();
        
        $data = $this->readPayload();
        $status = $data['status'] ?? null; 
        $observation = $data['observation'] ?? '';
        
        if (!in_array($status, ['approved', 'rejected', 'changes_requested'])) {
            Response::error('Estado inválido', 400);
            return;
        }
        
        $userId = \App\Support\Auth::userId();
        
        $sql = "UPDATE contracts SET legal_status = :status WHERE id = :id AND company_id = :cid";
        $this->pdo->prepare($sql)->execute([':status' => $status, ':id' => $contractId, ':cid' => $companyId]);
        
        if ($observation) {
            $obsId = $this->uuid();
            $sqlObs = "INSERT INTO contract_legal_observations (id, contract_id, user_id, status_snapshot, content, created_at) VALUES (:id, :cid, :uid, :status, :content, NOW())";
            $this->pdo->prepare($sqlObs)->execute([
                ':id' => $obsId,
                ':cid' => $contractId,
                ':uid' => $userId,
                ':status' => $status,
                ':content' => $observation
            ]);
        }
        
        $this->audit('tenant.contract.legal_review', 'contract', $contractId, ['status' => $status]);
        
        Response::json(['message' => 'Revisión legal registrada']);
    }

    private function contractsLegalObservations(string $companyId, string $contractId): void
    {
        $this->ensureContractLegalObservationsTable();
        
        $sql = "
            SELECT o.*, u.full_name as user_name, u.email as user_email
            FROM contract_legal_observations o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.contract_id = :cid
            ORDER BY o.created_at DESC
        ";
        
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([':cid' => $contractId]);
        
        Response::json($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
    
    private function ensureAmendmentsTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS contract_amendments (
                id CHAR(36) PRIMARY KEY,
                contract_id CHAR(36) NOT NULL,
                title VARCHAR(255) NULL,
                description TEXT NULL,
                changes_json JSON NOT NULL,
                document_url VARCHAR(255) NULL,
                status ENUM('draft', 'sent', 'signed', 'rejected') DEFAULT 'draft',
                effective_date DATE NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_by CHAR(36) NULL,
                signed_at DATETIME NULL,
                envelope_id VARCHAR(255) NULL,
                INDEX (contract_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Lazy migration
        try { $this->pdo->exec("ALTER TABLE contract_amendments ADD COLUMN title VARCHAR(255) NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE contract_amendments ADD COLUMN description TEXT NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE contract_amendments ADD COLUMN document_url VARCHAR(255) NULL"); } catch (\Throwable $e) {}
    }

    private function ensureContractsTable(): void
    {
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
                INDEX idx_company (company_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Lazy migration for existing tables
        try { $this->pdo->exec("ALTER TABLE contracts ADD COLUMN scope_of_work TEXT NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE contracts ADD COLUMN special_clause TEXT NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE contracts ADD COLUMN notice_period INT DEFAULT 0"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE contracts ADD COLUMN country VARCHAR(2) NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE contracts MODIFY COLUMN type ENUM('fixed', 'hourly', 'milestone', 'retainer', 'eor_employee') NOT NULL DEFAULT 'fixed'"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE contracts DROP FOREIGN KEY fk_contracts_freelancer"); } catch (\Throwable $e) {}
        
        // Legal Review Columns
        try { $this->pdo->exec("ALTER TABLE contracts ADD COLUMN legal_reviewer_id CHAR(36) NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE contracts ADD COLUMN legal_status ENUM('not_required', 'pending_review', 'in_review', 'approved', 'rejected', 'changes_requested') DEFAULT 'not_required'"); } catch (\Throwable $e) {}
    }

    private function ensureContractLegalObservationsTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS contract_legal_observations (
                id CHAR(36) PRIMARY KEY,
                contract_id CHAR(36) NOT NULL,
                user_id CHAR(36) NOT NULL,
                status_snapshot VARCHAR(50) NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_contract (contract_id),
                FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    private function contractsExportLegal(string $companyId): void
    {
        $sql = "
            SELECT 
                c.id, c.title, c.status,
                c.legal_status, c.legal_reviewer_id,
                u.full_name as reviewer_name,
                f.full_name as freelancer_name,
                (SELECT created_at FROM contract_legal_observations WHERE contract_id = c.id ORDER BY created_at DESC LIMIT 1) as last_observation_date,
                (SELECT content FROM contract_legal_observations WHERE contract_id = c.id ORDER BY created_at DESC LIMIT 1) as last_observation_content
            FROM contracts c
            LEFT JOIN users u ON c.legal_reviewer_id = u.id
            LEFT JOIN users f ON c.freelancer_id = f.id
            WHERE c.company_id = :cid
            ORDER BY c.created_at DESC
        ";
        
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([':cid' => $companyId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Output CSV
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename=contracts_legal_export_' . date('Y-m-d') . '.csv');
        
        $output = fopen('php://output', 'w');
        
        // BOM for Excel
        fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));
        
        // Headers
        fputcsv($output, [
            'ID Contrato', 'Título', 'Freelancer',
            'Estado Contrato', 'Estado Legal', 'Revisor Legal',
            'Última Observación (Fecha)', 'Última Observación (Contenido)'
        ]);
        
        foreach ($rows as $row) {
            fputcsv($output, [
                $row['id'],
                $row['title'],
                $row['freelancer_name'] ?? '—',
                $row['status'],
                $row['legal_status'] ?? 'not_required',
                $row['reviewer_name'] ?? 'No asignado',
                $row['last_observation_date'] ?? '—',
                $row['last_observation_content'] ?? '—'
            ]);
        }
        
        fclose($output);
        exit;
    }

    private function ensureProjectsTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS projects (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                name VARCHAR(200) NOT NULL,
                description TEXT NULL,
                country_id INT UNSIGNED NOT NULL,
                currency_id INT UNSIGNED NOT NULL,
                status ENUM('active', 'on_hold', 'closed') NOT NULL DEFAULT 'active',
                created_by_company_user_id CHAR(36) DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at DATETIME NULL,
                INDEX idx_company (company_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    private function ensureContractTemplatesTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS contract_templates (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                type ENUM('hourly', 'retainer', 'fixed', 'project') NOT NULL DEFAULT 'hourly',
                country_id INT UNSIGNED NOT NULL,
                language_code VARCHAR(5) NOT NULL DEFAULT 'es',
                title VARCHAR(200) NOT NULL,
                body LONGTEXT NULL,
                variables_schema JSON NULL,
                status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at DATETIME NULL,
                INDEX idx_company (company_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    /* =========================
       CONTRACT TEMPLATES
       ========================= */

    private function contractTemplatesIndex(string $companyId): void
    {
        $this->ensureContractTemplatesTable();
        $this->pagedCompanyIndex($companyId, 'contract_templates', ['status', 'type', 'country_id']);
    }

    private function contractTemplatesStore(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $this->ensureContractTemplatesTable();

        $data = $this->readPayload();
        $title = trim((string)($data['title'] ?? ''));
        $body = trim((string)($data['body'] ?? ''));
        $body = preg_replace('/<br\s*\/?>/i', "\n", $body ?? '');
        $body = strip_tags((string)$body);
        $body = html_entity_decode((string)$body, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $body = preg_replace("/\r\n?/", "\n", $body);
        $body = trim((string)$body);
        $type = trim((string)($data['type'] ?? ''));
        $countryId = (int)($data['country_id'] ?? 0);
        $lang = trim((string)($data['language_code'] ?? 'es'));
        $schema = isset($data['variables_schema']) ? json_encode($data['variables_schema']) : null;

        if ($title === '' || $body === '' || $type === '' || $countryId <= 0) {
            Response::error('Faltan campos requeridos (title, body, type, country_id)', 422);
            return;
        }

        $validTypes = ['hourly', 'retainer', 'fixed', 'project'];
        if (!in_array($type, $validTypes, true)) {
             Response::error('Tipo inválido', 422);
             return;
        }

        $id = $this->uuid();
        $stmt = $this->pdo->prepare("
            INSERT INTO contract_templates (
                id, company_id, type, country_id, language_code, title, body, variables_schema, status
            ) VALUES (
                :id, :cid, :type, :country, :lang, :title, :body, :schema, 'active'
            )
        ");
        
        try {
            $stmt->execute([
                ':id' => $id,
                ':cid' => $companyId,
                ':type' => $type,
                ':country' => $countryId,
                ':lang' => $lang,
                ':title' => $title,
                ':body' => $body,
                ':schema' => $schema
            ]);
            
            $this->audit('tenant.contract_template.created', 'contract_template', $id, ['company_id' => $companyId]);
            Response::json(['message' => 'Plantilla creada', 'id' => $id], 201);
        } catch (PDOException $e) {
             Response::error('Error al crear plantilla: ' . $e->getMessage(), 500);
        }
    }

    private function contractTemplatesShow(string $companyId, string $id): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $stmt = $this->pdo->prepare("SELECT * FROM contract_templates WHERE id LIKE :id AND company_id LIKE :cid");
        $stmt->execute([':id' => $id, ':cid' => $companyId]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$item) {
            Response::error('Plantilla no encontrada', 404);
            return;
        }

        if ($item['variables_schema']) {
            $item['variables_schema'] = json_decode($item['variables_schema'], true);
        }

        Response::json($item);
    }

    private function contractTemplatesUpdate(string $companyId, string $id): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $this->ensureContractTemplatesTable();

        $stmt = $this->pdo->prepare("SELECT id FROM contract_templates WHERE id = :id AND company_id = :cid");
        $stmt->execute([':id' => $id, ':cid' => $companyId]);
        if (!$stmt->fetch()) {
            Response::error('Plantilla no encontrada', 404);
            return;
        }

        $data = $this->readPayload();
        $fields = [];
        $params = [':id' => $id, ':cid' => $companyId];

        if (isset($data['title'])) {
            $fields[] = 'title = :title';
            $params[':title'] = trim((string)$data['title']);
        }
        if (isset($data['body'])) {
            $b = trim((string)$data['body']);
            $b = preg_replace('/<br\s*\/?>/i', "\n", $b ?? '');
            $b = strip_tags((string)$b);
            $b = html_entity_decode((string)$b, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $b = preg_replace("/\r\n?/", "\n", $b);
            $b = trim((string)$b);
            $fields[] = 'body = :body';
            $params[':body'] = $b;
        }
        if (isset($data['type'])) {
            $validTypes = ['hourly', 'retainer', 'fixed', 'project'];
            if (in_array($data['type'], $validTypes, true)) {
                $fields[] = 'type = :type';
                $params[':type'] = $data['type'];
            }
        }
        if (isset($data['status'])) {
            $validStatus = ['active', 'archived'];
            if (in_array($data['status'], $validStatus, true)) {
                $fields[] = 'status = :status';
                $params[':status'] = $data['status'];
            }
        }
        if (isset($data['country_id'])) {
            $fields[] = 'country_id = :country_id';
            $params[':country_id'] = (int)$data['country_id'];
        }
        if (isset($data['language_code'])) {
            $fields[] = 'language_code = :lang';
            $params[':lang'] = trim((string)$data['language_code']);
        }
        if (isset($data['variables_schema'])) {
            if (!is_array($data['variables_schema'])) {
                Response::error('variables_schema debe ser un objeto o array válido', 422);
                return;
            }
            $fields[] = 'variables_schema = :schema';
            $params[':schema'] = json_encode($data['variables_schema']);
        }

        if (empty($fields)) {
            Response::json(['message' => 'Nada que actualizar']);
            return;
        }

        $setSql = implode(', ', $fields);
        $updateStmt = $this->pdo->prepare("UPDATE contract_templates SET {$setSql} WHERE id = :id AND company_id = :cid");
        $updateStmt->execute($params);

        $this->audit('tenant.contract_template.updated', 'contract_template', $id, ['company_id' => $companyId]);
        Response::json(['message' => 'Plantilla actualizada']);
    }

    private function contractTemplatesDestroy(string $companyId, string $id): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        // Soft delete? Table doesn't have deleted_at. So hard delete or status=archived.
        // User asked for "templates module". Usually templates are archived rather than deleted if used.
        // But let's check if it's used.
        // Check fk_contracts_template
        $check = $this->pdo->prepare("SELECT COUNT(*) FROM contracts WHERE template_id LIKE :id");
        $check->execute([':id' => $id]);
        if ($check->fetchColumn() > 0) {
            Response::error('No se puede eliminar la plantilla porque está en uso en contratos. Archívela en su lugar.', 409);
            return;
        }

        $stmt = $this->pdo->prepare("DELETE FROM contract_templates WHERE id LIKE :id AND company_id LIKE :cid");
        $stmt->execute([':id' => $id, ':cid' => $companyId]);

        if ($stmt->rowCount() > 0) {
            $this->audit('tenant.contract_template.deleted', 'contract_template', $id, ['company_id' => $companyId]);
            Response::json(['message' => 'Plantilla eliminada']);
        } else {
            Response::error('Plantilla no encontrada', 404);
        }
    }

    private function pagedCompanyIndex(string $companyId, string $table, array $filterableCols, array $customWhere = []): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }
        if (!$this->tableExists($table)) {
            Response::error("Tabla {$table} no disponible", 501);
            return;
        }

        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(200, (int)($_GET['per_page'] ?? 10)));
        $q = trim((string)($_GET['q'] ?? ''));
        $offset = ($page - 1) * $perPage;

        $cols = $this->tableColumns($table);
        $where = ['company_id LIKE :cid'];
        $params = [':cid' => $companyId];

        if (!empty($customWhere)) {
            foreach ($customWhere as $cw) {
                $where[] = $cw;
            }
        }

        if (in_array('deleted_at', $cols, true)) $where[] = 'deleted_at IS NULL';

        foreach ($filterableCols as $col) {
            $val = trim((string)($_GET[$col] ?? ''));
            if ($val !== '' && in_array($col, $cols, true)) {
                $where[] = "{$col} LIKE :{$col}";
                $params[":{$col}"] = $val;
            }
        }

        if ($q !== '') {
            $likeCols = array_values(array_intersect($cols, ['id', 'number', 'name', 'title', 'reference']));
            if ($likeCols) {
                $parts = [];
                foreach ($likeCols as $c) $parts[] = "{$c} LIKE :q";
                $where[] = '(' . implode(' OR ', $parts) . ')';
                $params[':q'] = '%' . $q . '%';
            }
        }

        $whereSql = implode(' AND ', $where);
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE {$whereSql}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $order = in_array('created_at', $cols, true) ? 'created_at DESC' : 'id DESC';

        $sql = "SELECT * FROM {$table} WHERE {$whereSql} ORDER BY {$order} LIMIT :l OFFSET :o";
        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':l', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':o', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $items = $stmt->fetchAll() ?: [];

        Response::json([
            'data' => $items,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int)ceil($total / max(1, $perPage))),
            ],
        ]);
    }

    /* =========================
       IMPERSONATE (token temporal firmado)
       ========================= */

    private function impersonate(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $payload = $this->readPayload();
        $minutes = (int)($payload['duration_minutes'] ?? 30);
        $minutes = max(5, min(240, $minutes));
        $reason = trim((string)($payload['reason'] ?? ''));

        if ($reason === '') {
            Response::error('reason es requerido', 422);
            return;
        }

        $now = time();
        $exp = $now + ($minutes * 60);

        $secret = getenv('APP_SECRET') ?: (getenv('APP_KEY') ?: 'spectra-dev-secret');
        $token = $this->signToken([
            'typ' => 'impersonation',
            'company_id' => $companyId,
            'iat' => $now,
            'exp' => $exp,
        ], $secret);

        $this->audit('tenant.impersonate.created', 'company', $companyId, [
            'reason' => $reason,
            'duration_minutes' => $minutes,
            'expires_at' => date('c', $exp),
        ]);

        Response::json([
            'message' => 'Impersonación creada',
            'data' => [
                'token' => $token,
                'expires_at' => date('c', $exp),
                'duration_minutes' => $minutes,
            ],
        ], 201);
    }

    private function signToken(array $payload, string $secret): string
    {
        $h = $this->base64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT'], JSON_UNESCAPED_UNICODE));
        $p = $this->base64url(json_encode($payload, JSON_UNESCAPED_UNICODE));
        $sig = hash_hmac('sha256', "{$h}.{$p}", $secret, true);
        return "{$h}.{$p}." . $this->base64url($sig);
    }

    private function createDefaultSubscription(string $companyId, int $currencyId, float $price, string $interval): void
    {
        if (!$this->tableExists('subscription_plans') || !$this->tableExists('company_subscriptions')) {
            if ($this->pdo->inTransaction()) {
                throw new \RuntimeException('Faltan tablas de suscripción (no se puede crear dentro de una transacción)');
            }
            $this->ensureCompanySubscriptionsTable();
        }

        // 1. Ensure Enterprise Plan Exists (Update price if exists to match requested config)
        $stmt = $this->pdo->prepare("SELECT id, name, code FROM subscription_plans WHERE code = 'enterprise' LIMIT 1");
        $stmt->execute();
        $existingPlan = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$existingPlan) {
            $planId = $this->uuid();
            $stmtIns = $this->pdo->prepare("
                INSERT INTO subscription_plans (id, name, code, price, billing_interval, currency_id, created_at)
                VALUES (:id, 'Enterprise', 'enterprise', :price, :interval, :cur, NOW())
            ");
            $stmtIns->execute([
                ':id' => $planId,
                ':price' => $price,
                ':interval' => $interval,
                ':cur' => $currencyId
            ]);
        } else {
            $planId = $existingPlan['id'];

            // ¿El plan ya está asignado a otros tenants? Si es así, clonarlo para no
            // mutar los defaults compartidos por el resto de empresas.
            $stmtCount = $this->pdo->prepare("SELECT COUNT(*) FROM company_subscriptions WHERE plan_id = :pid");
            $stmtCount->execute([':pid' => $planId]);
            $count = (int)$stmtCount->fetchColumn();

            if ($count > 0) {
                $planId = $this->uuid();
                $stmtIns = $this->pdo->prepare("
                    INSERT INTO subscription_plans (id, name, code, price, billing_interval, currency_id, created_at)
                    VALUES (:id, :name, :code, :price, :interval, :cur, NOW())
                ");
                $stmtIns->execute([
                    ':id' => $planId,
                    ':name' => $existingPlan['name'] . ' (Custom)',
                    ':code' => $existingPlan['code'] . '_' . str_replace('.', '', uniqid('', true)),
                    ':price' => $price,
                    ':interval' => $interval,
                    ':cur' => $currencyId
                ]);
            } else {
                // Plan sin uso previo: actualizar defaults directamente
                $stmtUpd = $this->pdo->prepare("
                    UPDATE subscription_plans 
                    SET price = :price, billing_interval = :interval, updated_at = NOW()
                    WHERE id = :id
                ");
                $stmtUpd->execute([
                    ':price' => $price,
                    ':interval' => $interval,
                    ':id' => $planId
                ]);
            }
        }

        // 2. Assign Subscription
        $subId = $this->uuid();
        $now = date('Y-m-d');
        $next = date('Y-m-d', strtotime('+1 ' . ($interval === 'yearly' ? 'year' : 'month')));

        $stmtSub = $this->pdo->prepare("
            INSERT INTO company_subscriptions (id, company_id, plan_id, status, start_date, next_billing_date, created_at)
            VALUES (:id, :cid, :pid, 'active', :start, :next, NOW())
        ");
        $stmtSub->execute([
            ':id' => $subId,
            ':cid' => $companyId,
            ':pid' => $planId,
            ':start' => $now,
            ':next' => $next
        ]);
    }

    private function createDefaultFeeRules(string $companyId, int $currencyId, float $amount): void
    {
        if (!$this->tableExists('company_fee_rules')) {
            if ($this->pdo->inTransaction()) {
                throw new \RuntimeException('Falta tabla company_fee_rules (no se puede crear dentro de una transacción)');
            }
            $this->ensureCompanyFeeRulesTable();
        }

        // Platform Fee
        $feeId = $this->uuid();
        $stmt = $this->pdo->prepare("
            INSERT INTO company_fee_rules (id, company_id, type, value, currency_id, active, created_at)
            VALUES (:id, :cid, 'platform_fee', :val, :cur, 1, NOW())
        ");
        $stmt->execute([
            ':id' => $feeId,
            ':cid' => $companyId,
            ':val' => $amount,
            ':cur' => $currencyId
        ]);
    }

    private function base64url(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    /* =========================
       HELPERS: fetch/ensure
       ========================= */

    private function fetchCompany(string $id): ?array
    {
        $stmt = $this->pdo->prepare("SELECT * FROM companies WHERE id = :id AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    private function fetchCompanyWithRelations(string $id): ?array
    {
        $sql = "
            SELECT
                c.*,
                co.iso2 AS country_iso2, co.name AS country_name,
                cu.code AS currency_code, cu.name AS currency_name, cu.symbol AS currency_symbol,
                tz.name AS timezone_name
            FROM companies c
            LEFT JOIN countries co ON co.id = c.country_id
            LEFT JOIN currencies cu ON cu.id = c.default_currency_id
            LEFT JOIN timezones tz ON tz.id = c.timezone_id
            WHERE c.id = :id AND c.deleted_at IS NULL
            LIMIT 1
        ";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([':id' => $id]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$r) return null;

        $r['country'] = !empty($r['country_id']) ? [
            'id' => (int)$r['country_id'],
            'iso2' => $r['country_iso2'] ?? null,
            'name' => $r['country_name'] ?? null,
        ] : null;

        $r['currency'] = !empty($r['default_currency_id']) ? [
            'id' => (int)$r['default_currency_id'],
            'code' => $r['currency_code'] ?? null,
            'name' => $r['currency_name'] ?? null,
            'symbol' => $r['currency_symbol'] ?? null,
        ] : null;

        $r['timezone'] = !empty($r['timezone_id']) ? [
            'id' => (int)$r['timezone_id'],
            'name' => $r['timezone_name'] ?? null,
        ] : null;

        unset(
            $r['country_iso2'], $r['country_name'],
            $r['currency_code'], $r['currency_name'], $r['currency_symbol'],
            $r['timezone_name']
        );

        return $r;
    }

    private function existsById(string $table, int|string $id): bool
    {
        if (!$this->tableExists($table)) return false;
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $table)) return false;

        $stmt = $this->pdo->prepare("SELECT 1 FROM {$table} WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        return (bool)$stmt->fetchColumn();
    }

    private function fetchSettings(string $companyId): ?array
    {
        if (!$this->tableExists('company_settings')) return null;
        $stmt = $this->pdo->prepare("SELECT * FROM company_settings WHERE company_id LIKE :id LIMIT 1");
        $stmt->execute([':id' => $companyId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    private function ensureCompanySettings(string $companyId, string $defaultLanguage): void
    {
        if (!$this->tableExists('company_settings')) return;

        $existing = $this->fetchSettings($companyId);
        if ($existing) return;

        $cols = $this->tableColumns('company_settings');
        $insert = ['company_id' => $companyId];

        if (in_array('default_language', $cols, true)) {
            $insert['default_language'] = ($defaultLanguage !== '' ? $defaultLanguage : 'es');
        }
        if (in_array('created_at', $cols, true)) $insert['created_at'] = date('Y-m-d H:i:s');

        $fields = array_keys($insert);
        $place = array_map(fn($f) => ':' . $f, $fields);

        $sql = "INSERT INTO company_settings (" . implode(',', $fields) . ") VALUES (" . implode(',', $place) . ")";
        $stmt = $this->pdo->prepare($sql);
        foreach ($insert as $k => $v) $stmt->bindValue(':' . $k, $v);
        $stmt->execute();
    }

    private function fetchWallet(string $companyId): ?array
    {
        if (!$this->tableExists('wallets')) return null;
        $stmt = $this->pdo->prepare("SELECT * FROM wallets WHERE company_id LIKE :id LIMIT 1");
        $stmt->execute([':id' => $companyId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    private function ensureWallet(string $companyId, int $currencyId): void
    {
        if (!$this->tableExists('wallets')) return;

        $existing = $this->fetchWallet($companyId);
        if ($existing) {
            $cols = $this->tableColumns('wallets');
            if (in_array('currency_id', $cols, true) && (int)($existing['currency_id'] ?? 0) !== $currencyId && $currencyId > 0) {
                $stmt = $this->pdo->prepare("UPDATE wallets SET currency_id = :cur WHERE company_id = :cid");
                $stmt->execute([':cur' => $currencyId, ':cid' => $companyId]);
            }
            return;
        }

        $cols = $this->tableColumns('wallets');

        $insert = [
            'company_id' => $companyId,
        ];
        if (in_array('id', $cols, true)) $insert['id'] = $this->uuid();
        if (in_array('currency_id', $cols, true)) $insert['currency_id'] = $currencyId;
        if (in_array('balance', $cols, true)) $insert['balance'] = 0;
        if (in_array('created_at', $cols, true)) $insert['created_at'] = date('Y-m-d H:i:s');

        $fields = array_keys($insert);
        $place = array_map(fn($f) => ':' . $f, $fields);

        $sql = "INSERT INTO wallets (" . implode(',', $fields) . ") VALUES (" . implode(',', $place) . ")";
        $stmt = $this->pdo->prepare($sql);
        foreach ($insert as $k => $v) $stmt->bindValue(':' . $k, $v);
        $stmt->execute();
    }

    private function seedTemplates(string $companyId, int $countryId): void
    {
        // Verifica si existe tabla de plantillas
        if (!$this->tableExists('contract_templates')) return;

        // Insertar plantilla estándar de simulación
        $id = $this->uuid();
        $title = 'Contrato Estándar Simulación';
        $body = '<h1>Contrato de Servicios</h1><p>Este es un contrato de prueba para {{employee_name}} con salario {{salary}}.</p>';
        
        $stmt = $this->pdo->prepare("
            INSERT INTO contract_templates (
                id, company_id, type, country_id, language_code, title, body, status, created_at
            ) VALUES (
                :id, :cid, 'fixed', :country, 'es', :title, :body, 'active', NOW()
            )
        ");
        
        $stmt->execute([
            ':id' => $id,
            ':cid' => $companyId,
            ':country' => $countryId,
            ':title' => $title,
            ':body' => $body
        ]);
    }

    /* =========================
       KYB (Know Your Business)
       ========================= */



    private function audit(string $action, ?string $objectType, ?string $objectId, array $metadata = [], ?string $description = null): void
    {
        $logger = new \App\Support\AuditLogger();

        if ($description === null) {
            $description = $this->generateAuditDescription($action, $metadata);
        }

        $companyId = ($objectType === 'company') ? $objectId : ($metadata['company_id'] ?? null);

        $logger->log($action, $objectType, $objectId, $metadata, $companyId, $description);
    }

    private function generateAuditDescription(string $action, array $metadata): string
    {
        switch ($action) {
            case 'tenant.created':
                return "Creó la empresa " . ($metadata['legal_name'] ?? '');
            case 'tenant.updated':
                return "Actualizó datos de la empresa";
            case 'tenant.suspended':
                return "Suspendió la empresa. Motivo: " . ($metadata['reason'] ?? 'No especificado');
            case 'tenant.activated':
                return "Reactivó la empresa. Motivo: " . ($metadata['reason'] ?? 'No especificado');
            case 'tenant.deleted':
                 return "Eliminó la empresa " . ($metadata['legal_name'] ?? '');
            case 'tenant.impersonate.created':
                return "Inició sesión como admin de empresa";
            default:
                return $action;
        }
    }

    /* =========================
       DB utilities (MariaDB friendly)
       ========================= */

    private function tableExists(string $table): bool
    {
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $table)) return false;

        $cacheKey = 'tenant:tbl:' . $table;
        if (Cache::get($cacheKey, false) === true) return true;

        $stmt = $this->pdo->prepare("
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name LIKE :t
            LIMIT 1
        ");
        $stmt->execute([':t' => $table]);
        $exists = (bool)$stmt->fetchColumn();

        if ($exists) {
            Cache::set($cacheKey, true, 3600);
        }

        return $exists;
    }

    private function updateSubscription(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $this->ensureCompanySubscriptionsTable();
        $this->ensureCompanyFeeRulesTable();

        $data = $this->readPayload();

        $feeGiven = isset($data['platform_fee']);
        $planPriceGiven = isset($data['plan_price']);
        $billingGiven = isset($data['billing_cycle']);

        // Whitelist de billing_cycle
        if ($billingGiven && !in_array((string)$data['billing_cycle'], ['monthly', 'yearly'], true)) {
            Response::error('billing_cycle inválido (monthly|yearly)', 422);
            return;
        }

        // platform_fee y plan_price deben ser numéricos >= 0
        if ($feeGiven && (!is_numeric($data['platform_fee']) || (float)$data['platform_fee'] < 0)) {
            Response::error('platform_fee inválido (número >= 0)', 422);
            return;
        }
        if ($planPriceGiven && (!is_numeric($data['plan_price']) || (float)$data['plan_price'] < 0)) {
            Response::error('plan_price inválido (número >= 0)', 422);
            return;
        }

        try {
            $this->pdo->beginTransaction();

            // 1. Update Platform Fee
            if ($feeGiven) {
                $fee = (float)$data['platform_fee'];
                // Check if rule exists
                $stmt = $this->pdo->prepare("SELECT id FROM company_fee_rules WHERE company_id = :cid AND type = 'platform_fee'");
                $stmt->execute([':cid' => $companyId]);
                $ruleId = $stmt->fetchColumn();

                if ($ruleId) {
                    $stmtUpd = $this->pdo->prepare("UPDATE company_fee_rules SET value = :val, active = 1, updated_at = NOW() WHERE id = :id");
                    $stmtUpd->execute([':val' => $fee, ':id' => $ruleId]);
                } else {
                    $stmtCurr = $this->pdo->prepare("SELECT default_currency_id FROM companies WHERE id = :cid");
                    $stmtCurr->execute([':cid' => $companyId]);
                    $companyCurrencyId = (int)$stmtCurr->fetchColumn();
                    if ($companyCurrencyId <= 0) $companyCurrencyId = 1;
                    $newRuleId = $this->uuid();
                    $stmtIns = $this->pdo->prepare("INSERT INTO company_fee_rules (id, company_id, type, value, currency_id, active, created_at) VALUES (:id, :cid, 'platform_fee', :val, :cur, 1, NOW())");
                    $stmtIns->execute([':id' => $newRuleId, ':cid' => $companyId, ':val' => $fee, ':cur' => $companyCurrencyId]);
                }
            }

            // 2. Update Plan (Price/Interval)
            if ($planPriceGiven || $billingGiven) {
                // Fetch current subscription
                $stmtSub = $this->pdo->prepare("SELECT plan_id FROM company_subscriptions WHERE company_id = :cid AND status = 'active'");
                $stmtSub->execute([':cid' => $companyId]);
                $currentPlanId = $stmtSub->fetchColumn();

                if (!$currentPlanId) {
                    throw new \RuntimeException('No existe una suscripción activa para este tenant');
                }

                // Check if plan is shared
                $stmtCount = $this->pdo->prepare("SELECT COUNT(*) FROM company_subscriptions WHERE plan_id = :pid");
                $stmtCount->execute([':pid' => $currentPlanId]);
                $count = (int)$stmtCount->fetchColumn();

                $stmtPlan = $this->pdo->prepare("SELECT * FROM subscription_plans WHERE id = :pid");
                $stmtPlan->execute([':pid' => $currentPlanId]);
                $plan = $stmtPlan->fetch(PDO::FETCH_ASSOC);

                $newPrice = $planPriceGiven ? (float)$data['plan_price'] : $plan['price'];
                $newInterval = $billingGiven ? (string)$data['billing_cycle'] : $plan['billing_interval'];

                if ($count > 1) {
                    // Shared plan: Create new custom plan for this company
                    $newPlanId = $this->uuid();
                    $newCode = $plan['code'] . '_' . time(); // unique code

                    $stmtInsPlan = $this->pdo->prepare("
                        INSERT INTO subscription_plans (id, name, code, price, billing_interval, currency_id, created_at)
                        VALUES (:id, :name, :code, :price, :interval, :cur, NOW())
                    ");
                    $stmtInsPlan->execute([
                        ':id' => $newPlanId,
                        ':name' => $plan['name'] . ' (Custom)',
                        ':code' => $newCode,
                        ':price' => $newPrice,
                        ':interval' => $newInterval,
                        ':cur' => $plan['currency_id']
                    ]);

                    // Update subscription to point to new plan
                    $stmtUpdSub = $this->pdo->prepare("UPDATE company_subscriptions SET plan_id = :pid, updated_at = NOW() WHERE company_id = :cid AND status = 'active'");
                    $stmtUpdSub->execute([':pid' => $newPlanId, ':cid' => $companyId]);

                } else {
                    // Exclusive plan: Update directly
                    $stmtUpdPlan = $this->pdo->prepare("UPDATE subscription_plans SET price = :price, billing_interval = :interval, updated_at = NOW() WHERE id = :pid");
                    $stmtUpdPlan->execute([
                        ':price' => $newPrice,
                        ':interval' => $newInterval,
                        ':pid' => $currentPlanId
                    ]);
                }
            }

            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            if ($e instanceof \RuntimeException && str_starts_with($e->getMessage(), 'No existe una suscripción')) {
                Response::error($e->getMessage(), 422);
                return;
            }
            throw $e;
        }

        $this->audit('tenant.subscription.updated', 'company_subscription', $companyId, ['payload' => $data]);
        Response::json(['message' => 'Suscripción actualizada correctamente']);
    }

    /**
     * @return array<int, string>
     */
    private function getSubscription(string $id): void
    {
        $company = $this->fetchCompany($id);
        if (!$company) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        // Try to fetch existing subscription
        $sub = null;
        if ($this->tableExists('company_subscriptions')) {
            $stmt = $this->pdo->prepare("
                SELECT cs.*, sp.name as plan_name, sp.price as plan_price, sp.billing_interval, sp.currency_id, cur.code as currency_code
                FROM company_subscriptions cs
                JOIN subscription_plans sp ON cs.plan_id = sp.id
                LEFT JOIN currencies cur ON sp.currency_id = cur.id
                WHERE cs.company_id = :cid
                LIMIT 1
            ");
            $stmt->execute([':cid' => $id]);
            $sub = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        // Fetch Platform Fee
        $platformFee = 0.00;
        if ($this->tableExists('company_fee_rules')) {
            $stmtFee = $this->pdo->prepare("SELECT value FROM company_fee_rules WHERE company_id = :cid AND type = 'platform_fee' AND active = 1 LIMIT 1");
            $stmtFee->execute([':cid' => $id]);
            $val = $stmtFee->fetchColumn();
            if ($val !== false) {
                $platformFee = (float)$val;
            } else {
                // Backfill: tenant legacy sin regla de fee → crear con defaults (29.00)
                try {
                    $stmtCur = $this->pdo->prepare("SELECT default_currency_id FROM companies WHERE id = :cid");
                    $stmtCur->execute([':cid' => $id]);
                    $backfillCurrency = (int)$stmtCur->fetchColumn();
                    if ($backfillCurrency <= 0) $backfillCurrency = 1;
                    $backfillId = $this->uuid();
                    $this->pdo->prepare("INSERT INTO company_fee_rules (id, company_id, type, value, currency_id, active, created_at) VALUES (:id,:cid,'platform_fee',29.00,:cur,1,NOW())")
                        ->execute([':id' => $backfillId, ':cid' => $id, ':cur' => $backfillCurrency]);
                    $platformFee = 29.00;
                } catch (\Throwable $e) {}
            }
        }

        // Sin suscripción real: se devuelve plan null (sin fabricar datos)
        $planData = null;
        if ($sub) {
            $pm = json_decode($sub['payment_method_json'] ?? '{}', true);
            $planData = [
                'name' => $sub['plan_name'],
                'price' => (float)$sub['plan_price'],
                'platform_fee' => $platformFee,
                'currency' => ($sub['currency_code'] ?? '') ?: 'USD',
                'interval' => $sub['billing_interval'],
                'next_billing' => $sub['next_billing_date'],
                'payment_method' => $pm ?: null,
            ];
        }

        // Fetch Invoices
        $invoices = [];
        if ($this->tableExists('invoices')) {
             try {
                $stmt = $this->pdo->prepare("
                    SELECT id, invoice_number, issue_date as date, total_amount as amount, status 
                    FROM invoices 
                    WHERE company_id LIKE :id 
                    ORDER BY issue_date DESC 
                    LIMIT 5
                ");
                $stmt->execute([':id' => $id]);
                $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);
             } catch (Throwable $e) {}
        }
        
        // Mock Usage
        $usersCount = 0;
        try {
            $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM company_users WHERE company_id LIKE :id AND status LIKE 'active' AND deleted_at IS NULL");
            $stmt->execute([':id' => $id]);
            $usersCount = (int)$stmt->fetchColumn();
        } catch (Throwable $e) {}

        $projectsCount = 0;
        if ($this->tableExists('projects')) {
            try {
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM projects WHERE company_id LIKE :id AND status LIKE 'active'");
                $stmt->execute([':id' => $id]);
                $projectsCount = (int)$stmt->fetchColumn();
            } catch (Throwable $e) {}
        }

        Response::json([
            'data' => [
                'plan' => $planData,
                'invoices' => $invoices,
                'usage' => [
                    'users_count' => $usersCount,
                    'users_limit' => 0,
                    'projects_count' => $projectsCount,
                    'projects_limit' => -1,
                    'storage_used_gb' => 0,
                    'storage_limit_gb' => 0
                ]
            ]
        ]);
    }

    private function tableColumns(string $table): array
    {
        if (isset($this->columnsCache[$table])) return $this->columnsCache[$table];

        if (!preg_match('/^[a-zA-Z0-9_]+$/', $table)) {
            return $this->columnsCache[$table] = [];
        }

        $cacheKey = 'tenant:cols:' . $table;
        $cols = Cache::remember($cacheKey, 3600, function () use ($table): array {
            try {
                $stmt = $this->pdo->prepare("
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = DATABASE()
                      AND table_name LIKE :t
                    ORDER BY ordinal_position
                ");
                $stmt->execute([':t' => $table]);

                $rows = $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
                return array_map('strval', $rows);
            } catch (Throwable $e) {
                return [];
            }
        });

        return $this->columnsCache[$table] = $cols;
    }

    private function subscriptionsIndex(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(200, (int)($_GET['per_page'] ?? 10)));
        $q = trim((string)($_GET['q'] ?? ''));
        $offset = ($page - 1) * $perPage;

        $where = ['c.deleted_at IS NULL'];
        $params = [];

        if ($q !== '') {
            $where[] = '(c.legal_name LIKE :q1 OR c.trade_name LIKE :q2)';
            $params[':q1'] = '%' . $q . '%';
            $params[':q2'] = '%' . $q . '%';
        }
        
        $whereSql = implode(' AND ', $where);

        // Count
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM companies c WHERE {$whereSql}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        // Fetch with subscription info
        // Note: This query assumes one active subscription per company for simplicity.
        $sql = "
            SELECT 
                c.id, c.legal_name, c.trade_name, c.status as company_status, c.created_at,
                cs.status as subscription_status, cs.next_billing_date,
                sp.name as plan_name, sp.price as plan_price, sp.currency_id, cur.code as currency_code
            FROM companies c
            LEFT JOIN company_subscriptions cs ON cs.company_id LIKE c.id AND cs.status LIKE 'active'
            LEFT JOIN subscription_plans sp ON cs.plan_id LIKE sp.id
            LEFT JOIN currencies cur ON sp.currency_id LIKE cur.id
            WHERE {$whereSql}
            ORDER BY c.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $items,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage)
            ]
        ]);
    }

    private function readPayload(): array
    {
        $raw = file_get_contents('php://input');

        if ($raw) {
            $json = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($json)) {
                return $json;
            }
        }

        if (!empty($_POST)) {
            return $_POST;
        }

        if ($raw && strpos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/x-www-form-urlencoded') !== false) {
            parse_str($raw, $parsed);
            if (is_array($parsed)) return $parsed;
        }

        return [];
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    /* =========================
       KYB (Know Your Business)
       ========================= */

    private function kybShow(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $kyb = $this->ensureKybRequest($companyId);
        
        $stmt = $this->pdo->prepare("
            SELECT a.* 
            FROM attachment_links al
            JOIN attachments a ON a.id = al.attachment_id
            WHERE al.object_type LIKE 'kyb_request' AND al.object_id = :kid
            ORDER BY a.created_at DESC
        ");
        $stmt->execute([':kid' => $kyb['id']]);
        $docs = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'request' => $kyb,
            'documents' => $docs
        ]);
    }

    private function kybUploadDocument(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }
        
        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            Response::error('Archivo no válido o error en subida', 400);
            return;
        }

        $kyb = $this->ensureKybRequest($companyId);
        
        $file = $_FILES['file'];
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

        $allowedExts = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
        if (!in_array($ext, $allowedExts, true)) {
            Response::error('Tipo de archivo no válido. Se permiten PDF, Word y archivos de imagen.', 422);
            return;
        }

        $mime = mime_content_type($file['tmp_name']) ?: 'application/octet-stream';
        $size = $file['size'];
        $hash = hash_file('sha256', $file['tmp_name']);
        
        // Ensure storage directory exists
        $storageDir = __DIR__ . '/../../storage/kyb/' . $companyId;
        if (!is_dir($storageDir)) {
            if (!mkdir($storageDir, 0777, true)) {
                Response::error('Error creando directorio de almacenamiento', 500);
                return;
            }
        }
        
        $attId = $this->uuid();
        $targetName = $attId . '.' . $ext;
        $targetPath = $storageDir . '/' . $targetName;
        
        if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
            Response::error('Error moviendo archivo', 500);
            return;
        }
        
        try {
            $this->pdo->beginTransaction();
            
            $userId = \App\Support\Auth::userId() ?? $this->getSystemUserId();
            
            $stmt = $this->pdo->prepare("
                INSERT INTO attachments (
                    id, company_id, storage_provider, object_key, file_name, mime_type, size_bytes, checksum_sha256, created_by_user_id
                ) VALUES (
                    :id, :cid, 'local', :key, :name, :mime, :size, :hash, :uid
                )
            ");
            
            $stmt->execute([
                ':id' => $attId,
                ':cid' => $companyId,
                ':key' => "kyb/$companyId/$targetName",
                ':name' => $file['name'],
                ':mime' => $mime,
                ':size' => $size,
                ':hash' => $hash,
                ':uid' => $userId
            ]);
            
            $stmt = $this->pdo->prepare("
                INSERT INTO attachment_links (attachment_id, object_type, object_id)
                VALUES (:aid, 'kyb_request', :oid)
            ");
            $stmt->execute([':aid' => $attId, ':oid' => $kyb['id']]);
            
            $this->pdo->commit();
            
            Response::json(['message' => 'Documento subido', 'id' => $attId], 201);
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            Response::error('Error guardando documento: ' . $e->getMessage(), 500);
        }
    }

    private function kybSubmit(string $companyId): void
    {
        if (!$this->fetchCompany($companyId)) {
            Response::error('Tenant no encontrado', 404);
            return;
        }

        $kyb = $this->ensureKybRequest($companyId);
        
        if ($kyb['status'] !== 'pending_review') {
             $stmt = $this->pdo->prepare("UPDATE kyb_requests SET status = 'pending_review', submitted_at = NOW() WHERE id = :id");
             $stmt->execute([':id' => $kyb['id']]);
        }
        
        Response::json(['message' => 'Solicitud enviada a revisión']);
    }

    private function ensureKybRequest(string $companyId): array
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS kyb_requests (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL UNIQUE,
                status ENUM('not_started', 'pending_review', 'approved', 'rejected', 'more_info_required') DEFAULT 'not_started',
                documents JSON NULL,
                submitted_at DATETIME NULL,
                reviewed_at DATETIME NULL,
                reviewed_by_user_id CHAR(36) NULL,
                rejection_reason TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        try { $this->pdo->exec("ALTER TABLE kyb_requests ADD COLUMN documents JSON NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE kyb_requests ADD COLUMN reviewed_by_user_id CHAR(36) NULL"); } catch (\Throwable $e) {}

        $stmt = $this->pdo->prepare("SELECT * FROM kyb_requests WHERE company_id LIKE :cid LIMIT 1");
        $stmt->execute([':cid' => $companyId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($row) return $row;
        
        $id = $this->uuid();
        $stmt = $this->pdo->prepare("INSERT INTO kyb_requests (id, company_id, status, created_at) VALUES (:id, :cid, 'not_started', NOW())");
        $stmt->execute([':id' => $id, ':cid' => $companyId]);
        
        return [
            'id' => $id,
            'company_id' => $companyId,
            'status' => 'not_started',
            'created_at' => date('Y-m-d H:i:s')
        ];
    }

    private function invoicesUpdate(string $companyId, string $invoiceId): void
    {
        $this->ensureInvoicesTable();
        
        $stmt = $this->pdo->prepare("SELECT * FROM invoices WHERE id = :id AND company_id = :cid");
        $stmt->execute([':id' => $invoiceId, ':cid' => $companyId]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$invoice) {
            Response::error('Factura no encontrada', 404);
            return;
        }

        if ($invoice['status'] === 'paid') {
            Response::error('No se puede editar una factura pagada', 400);
            return;
        }

        $data = $this->readPayload();
        $invoiceNumber = trim((string)($data['invoice_number'] ?? $invoice['invoice_number']));
        $issueDate = trim((string)($data['issue_date'] ?? $invoice['issue_date']));
        $dueDate = trim((string)($data['due_date'] ?? $invoice['due_date']));
        $currencyId = (int)($data['currency_id'] ?? $invoice['currency_id']);
        $notes = trim((string)($data['notes'] ?? $invoice['notes']));
        $contractId = $data['contract_id'] ?? $invoice['contract_id'];
        $items = $data['items'] ?? null;
        $contactId = $data['contact_id'] ?? ($invoice['contact_id'] ?? null);
        $customerName = $invoice['customer_name'] ?? null;
        $customerEmail = $invoice['customer_email'] ?? null;
        $customerPhone = $invoice['customer_phone'] ?? null;

        if (array_key_exists('contact_id', $data)) {
            if ($contactId) {
                try {
                    $stmt = $this->pdo->prepare("SELECT name, email, phone FROM company_contacts WHERE id LIKE :id AND company_id LIKE :cid");
                    $stmt->execute([':id' => $contactId, ':cid' => $companyId]);
                    $c = $stmt->fetch(PDO::FETCH_ASSOC);
                    if ($c) {
                        $customerName = $c['name'] ?? null;
                        $customerEmail = $c['email'] ?? null;
                        $customerPhone = $c['phone'] ?? null;
                    } else {
                        $contactId = null;
                        $customerName = $customerEmail = $customerPhone = null;
                    }
                } catch (\Throwable $e) {
                    $contactId = null;
                    $customerName = $customerEmail = $customerPhone = null;
                }
            } else {
                $customerName = $customerEmail = $customerPhone = null;
            }
        }

        if ($items !== null && (!is_array($items) || empty($items))) {
            Response::error('Items inválidos', 422);
            return;
        }

        try {
            $this->pdo->beginTransaction();

            $subtotal = (float)$invoice['subtotal'];
            $taxAmount = (float)$invoice['tax_amount'];
            $total = (float)$invoice['total_amount'];
            $recalculate = false;

            if ($items !== null) {
                $subtotal = 0.0;
                foreach ($items as $item) {
                    $qty = (float)($item['quantity'] ?? 1);
                    $price = (float)($item['unit_price'] ?? 0);
                    $subtotal += ($qty * $price);
                }
                $recalculate = true;
            }

            // Recalculate taxes if items changed OR contract changed
            if ($recalculate || $contractId !== $invoice['contract_id']) {
                $taxAmount = 0.0;
                if ($contractId) {
                    $stmtC = $this->pdo->prepare("SELECT country, type FROM contracts WHERE id = :id");
                    $stmtC->execute([':id' => $contractId]);
                    $contract = $stmtC->fetch(PDO::FETCH_ASSOC);
                    
                    if ($contract) {
                        try {
                            $fiscalParams = $this->getFiscalParams($contract['country'] ?? '');
                            $taxes = \App\Support\TaxEngine::calculate($subtotal, $contract['country'], $contract['type'], [], $fiscalParams);
                            foreach ($taxes as $tax) {
                                if ($tax['type'] === 'tax' || $tax['type'] === 'deduction') {
                                    $taxAmount -= $tax['amount'];
                                } else {
                                    $taxAmount += $tax['amount'];
                                }
                            }
                        } catch (Throwable $e) {}
                    }
                }
                $total = $subtotal + $taxAmount;
            }

            if ($items !== null) {
                $this->pdo->prepare("DELETE FROM invoice_lines WHERE invoice_id = :id")->execute([':id' => $invoiceId]);

                $lineStmt = $this->pdo->prepare("
                    INSERT INTO invoice_lines (
                        id, invoice_id, concept, quantity, unit_price, line_total, created_at
                    ) VALUES (
                        :id, :inv_id, :desc, :qty, :price, :amt, NOW()
                    )
                ");

                foreach ($items as $item) {
                    $qty = (float)($item['quantity'] ?? 1);
                    $price = (float)($item['unit_price'] ?? 0);
                    $amt = $qty * $price;
                    $desc = trim((string)($item['description'] ?? 'Item'));

                    $lineStmt->execute([
                        ':id' => $this->uuid(),
                        ':inv_id' => $invoiceId,
                        ':desc' => $desc,
                        ':qty' => $qty,
                        ':price' => $price,
                        ':amt' => $amt
                    ]);
                }
            }

            $stmt = $this->pdo->prepare("
                UPDATE invoices SET 
                    contract_id = :contract,
                    invoice_number = :num,
                    issue_date = :issue,
                    due_date = :due,
                    currency_id = :cur,
                    subtotal = :sub,
                    tax_amount = :tax,
                    total_amount = :total,
                    notes = :notes,
                    contact_id = :contact_id,
                    customer_name = :customer_name,
                    customer_email = :customer_email,
                    customer_phone = :customer_phone,
                    updated_at = NOW()
                WHERE id = :id
            ");

            $stmt->execute([
                ':contract' => $contractId ?: null,
                ':num' => $invoiceNumber,
                ':issue' => $issueDate,
                ':due' => $dueDate,
                ':cur' => $currencyId,
                ':sub' => $subtotal,
                ':tax' => $taxAmount,
                ':total' => $total,
                ':notes' => $notes,
                ':contact_id' => $contactId,
                ':customer_name' => $customerName,
                ':customer_email' => $customerEmail,
                ':customer_phone' => $customerPhone,
                ':id' => $invoiceId
            ]);

            $this->pdo->commit();
            
            $this->audit('tenant.invoice.updated', 'invoice', $invoiceId, ['company_id' => $companyId, 'amount' => $total]);
            
            Response::json(['message' => 'Factura actualizada']);

        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            Response::error('Error al actualizar factura: ' . $e->getMessage(), 500);
        }
    }

    private function invoicesDestroy(string $companyId, string $invoiceId): void
    {
        $this->ensureInvoicesTable();

        $stmt = $this->pdo->prepare("SELECT id, status FROM invoices WHERE id = :id AND company_id = :cid");
        $stmt->execute([':id' => $invoiceId, ':cid' => $companyId]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$invoice) {
            Response::error('Factura no encontrada', 404);
            return;
        }

        if ($invoice['status'] === 'paid') {
            Response::error('No se puede eliminar una factura pagada', 400);
            return;
        }

        try {
            $stmt = $this->pdo->prepare("DELETE FROM invoices WHERE id = :id");
            $stmt->execute([':id' => $invoiceId]);
            
            $this->audit('tenant.invoice.deleted', 'invoice', $invoiceId, ['company_id' => $companyId]);
            
            Response::json(['message' => 'Factura eliminada']);
        } catch (Throwable $e) {
            Response::error('Error al eliminar factura: ' . $e->getMessage(), 500);
        }
    }

    private function invoicesUploadAttachment(string $companyId, string $invoiceId): void
    {
        $this->ensureInvoicesTable();
        $stmt = $this->pdo->prepare("SELECT id FROM invoices WHERE id = :id AND company_id = :cid");
        $stmt->execute([':id' => $invoiceId, ':cid' => $companyId]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$invoice) {
            Response::error('Factura no encontrada', 404);
            return;
        }

        if (empty($_FILES['file'])) {
            Response::error('Archivo requerido (campo "file")', 422);
            return;
        }

        $uploadDir = __DIR__ . '/../../uploads/invoices/';
        if (!is_dir($uploadDir)) {
            @mkdir($uploadDir, 0777, true);
        }

        $orig = basename($_FILES['file']['name']);
        $safeName = preg_replace('/[^A-Za-z0-9._-]/', '_', $orig);
        $fileName = $invoiceId . '_' . uniqid() . '_' . $safeName;
        $targetPath = $uploadDir . $fileName;

        if (!move_uploaded_file($_FILES['file']['tmp_name'], $targetPath)) {
            Response::error('No se pudo subir el archivo', 500);
            return;
        }

        $webPath = '/uploads/invoices/' . $fileName;
        $mime = $_FILES['file']['type'] ?? mime_content_type($targetPath) ?: 'application/octet-stream';
        $size = (int)($_FILES['file']['size'] ?? filesize($targetPath) ?: 0);

        $this->pdo->prepare("
            UPDATE invoices SET 
                attachment_path = :path,
                attachment_name = :name,
                attachment_mime = :mime,
                attachment_size = :size,
                updated_at = NOW()
            WHERE id = :id
        ")->execute([
            ':path' => $webPath,
            ':name' => $orig,
            ':mime' => $mime,
            ':size' => $size,
            ':id' => $invoiceId
        ]);

        $this->audit('tenant.invoice.attachment_uploaded', 'invoice', $invoiceId, ['company_id' => $companyId, 'file' => $orig]);
        Response::json(['message' => 'Adjunto subido', 'path' => $webPath, 'name' => $orig]);
    }

    private function invoicesAttachmentInfo(string $companyId, string $invoiceId): void
    {
        $this->ensureInvoicesTable();
        $stmt = $this->pdo->prepare("
            SELECT attachment_path, attachment_name, attachment_mime, attachment_size
            FROM invoices WHERE id = :id AND company_id = :cid
        ");
        $stmt->execute([':id' => $invoiceId, ':cid' => $companyId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Factura no encontrada', 404);
            return;
        }
        Response::json($row);
    }

    private function invoicesDeleteAttachment(string $companyId, string $invoiceId): void
    {
        $this->ensureInvoicesTable();
        $stmt = $this->pdo->prepare("
            SELECT attachment_path FROM invoices WHERE id = :id AND company_id = :cid
        ");
        $stmt->execute([':id' => $invoiceId, ':cid' => $companyId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            Response::error('Factura no encontrada', 404);
            return;
        }

        $path = $row['attachment_path'] ?? null;
        if ($path) {
            $file = __DIR__ . '/../../' . ltrim($path, '/');
            if (is_file($file)) { @unlink($file); }
        }

        $this->pdo->prepare("
            UPDATE invoices SET 
                attachment_path = NULL,
                attachment_name = NULL,
                attachment_mime = NULL,
                attachment_size = NULL,
                updated_at = NOW()
            WHERE id = :id
        ")->execute([':id' => $invoiceId]);

        $this->audit('tenant.invoice.attachment_deleted', 'invoice', $invoiceId, ['company_id' => $companyId]);
        Response::json(['message' => 'Adjunto eliminado']);
    }

    private function invoicesPay(string $companyId, string $invoiceId): void
    {
        $this->ensureInvoicesTable();
        $this->ensureWalletTransactionsTable();

        $stmt = $this->pdo->prepare("SELECT * FROM invoices WHERE id = :id AND company_id = :cid");
        $stmt->execute([':id' => $invoiceId, ':cid' => $companyId]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$invoice) {
            Response::error('Factura no encontrada', 404);
            return;
        }

        if ($invoice['status'] === 'paid') {
            Response::error('Esta factura ya está pagada', 400);
            return;
        }

        $amount = (float)$invoice['total_amount'];
        if ($amount <= 0) {
             Response::error('El monto de la factura debe ser mayor a 0', 400);
             return;
        }

        $wallet = $this->fetchWallet($companyId);
        if (!$wallet) {
            // Try to ensure wallet exists
            $company = $this->fetchCompany($companyId);
            $currencyId = (int)($company['default_currency_id'] ?? 0);
            if ($currencyId > 0) $this->ensureWallet($companyId, $currencyId);
            $wallet = $this->fetchWallet($companyId);
        }
        
        if (!$wallet) {
             Response::error('No se encontró billetera para esta empresa', 404);
             return;
        }

        if ((int)$wallet['currency_id'] !== (int)$invoice['currency_id']) {
            Response::error('La moneda de la billetera no coincide con la de la factura', 400);
            return;
        }

        if ((float)$wallet['balance'] < $amount) {
            Response::error('Saldo insuficiente en la billetera', 400);
            return;
        }

        // --- INVOICE FEE LOGIC ---
        // Skip fee if it's a Platform Fee Invoice (freelancer_id is NULL)
        $feeAmount = 0;
        if ($invoice['freelancer_id'] !== null) {
            $stmtRule = $this->pdo->prepare("SELECT * FROM company_fee_rules WHERE company_id = :cid AND type = 'invoice_fee' AND active = 1 LIMIT 1");
            $stmtRule->execute([':cid' => $companyId]);
            $feeRule = $stmtRule->fetch(PDO::FETCH_ASSOC);

            if ($feeRule) {
                // Check currency match if fee currency is set
                if (!empty($feeRule['currency_id']) && (int)$feeRule['currency_id'] !== (int)$wallet['currency_id']) {
                     // For now, ignore fee if currency mismatch to avoid blocking payment, or throw error?
                     // Safer to throw error so admin fixes configuration.
                     Response::error('Error de configuración: La moneda del Fee por Factura no coincide con la billetera.', 409);
                     return;
                }
                $feeAmount = (float)$feeRule['value'];
            }
        }

        $totalRequired = $amount + $feeAmount;

        if ((float)$wallet['balance'] < $totalRequired) {
            Response::error("Saldo insuficiente en la billetera. Requerido: $totalRequired (Factura: $amount + Fee: $feeAmount)", 400);
            return;
        }

        try {
            $this->pdo->beginTransaction();

            // Deduct Total (Invoice + Fee)
            $newBalance = (float)$wallet['balance'] - $totalRequired;
            $stmt = $this->pdo->prepare("UPDATE wallets SET balance = :bal, updated_at = NOW() WHERE company_id = :cid");
            $stmt->execute([':bal' => $newBalance, ':cid' => $companyId]);

            // Transaction 1: Invoice Payment
            $txId = $this->uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO wallet_transactions (id, company_id, type, amount, currency_id, reference_type, reference_id, description, status, created_at)
                VALUES (:id, :cid, 'payment', :amt, :cur, 'invoice', :ref, :desc, 'completed', NOW())
            ");
            $stmt->execute([
                ':id' => $txId,
                ':cid' => $companyId,
                ':amt' => -$amount, 
                ':cur' => $invoice['currency_id'],
                ':ref' => $invoiceId,
                ':desc' => 'Pago de Factura ' . $invoice['invoice_number']
            ]);

            // Transaction 2: Invoice Fee (if applicable)
            if ($feeAmount > 0) {
                $feeTxId = $this->uuid();
                $stmt = $this->pdo->prepare("
                    INSERT INTO wallet_transactions (id, company_id, type, amount, currency_id, reference_type, reference_id, description, status, created_at)
                    VALUES (:id, :cid, 'payment', :amt, :cur, 'invoice_fee', :ref, :desc, 'completed', NOW())
                ");
                $stmt->execute([
                    ':id' => $feeTxId,
                    ':cid' => $companyId,
                    ':amt' => -$feeAmount, 
                    ':cur' => $invoice['currency_id'],
                    ':ref' => $invoiceId,
                    ':desc' => 'Fee por Pago de Factura'
                ]);
            }

            // Update Invoice
            $stmt = $this->pdo->prepare("UPDATE invoices SET status = 'paid', updated_at = NOW() WHERE id = :id");
            $stmt->execute([':id' => $invoiceId]);

            $this->audit('tenant.invoice.paid', 'invoice', $invoiceId, ['amount' => $amount, 'fee' => $feeAmount]);

            $this->pdo->commit();

            Response::json(['message' => 'Factura pagada exitosamente', 'transaction_id' => $txId]);

        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            Response::error('Error al procesar el pago: ' . $e->getMessage(), 500);
        }
    }

    private function invoicesPdf(string $companyId, string $invoiceId): void
    {
        $this->ensureInvoicesTable();
        
        $stmt = $this->pdo->prepare("
            SELECT 
                i.*, 
                c.code as currency_code, 
                c.symbol as currency_symbol,
                comp.legal_name as company_name,
                comp.trade_name as company_trade_name,
                comp.logo_url as company_logo,
                u.full_name as freelancer_name,
                u.email as freelancer_email,
                u.address as freelancer_address
            FROM invoices i
            LEFT JOIN currencies c ON i.currency_id = c.id
            LEFT JOIN companies comp ON i.company_id = comp.id
            LEFT JOIN users u ON i.freelancer_id = u.id
            WHERE i.id = :id AND i.company_id = :cid
        ");
        $stmt->execute([':id' => $invoiceId, ':cid' => $companyId]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$invoice) {
            Response::error('Factura no encontrada', 404);
            return;
        }

        $stmt = $this->pdo->prepare("SELECT * FROM invoice_lines WHERE invoice_id = :id");
        $stmt->execute([':id' => $invoiceId]);
        $lines = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $dompdf = new Dompdf();
        
        $html = '
        <html>
        <head>
            <style>
                body { font-family: sans-serif; font-size: 12px; }
                .header { overflow: hidden; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
                .logo { float: left; width: 50%; }
                .details { float: right; width: 50%; text-align: right; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f8f9fa; }
                .totals { float: right; margin-top: 20px; width: 300px; }
                .totals-row { display: flex; justify-content: space-between; margin-bottom: 5px; text-align: right; }
                .bill-to { margin-top: 20px; background: #f8f9fa; padding: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">
                    <h2>' . htmlspecialchars($invoice['company_trade_name'] ?? $invoice['company_name']) . '</h2>
                </div>
                <div class="details">
                    <h3>FACTURA #' . htmlspecialchars($invoice['invoice_number']) . '</h3>
                    <p>Fecha Emisión: ' . $invoice['issue_date'] . '</p>
                    <p>Vencimiento: ' . $invoice['due_date'] . '</p>
                    <p>Estado: ' . strtoupper($invoice['status']) . '</p>
                </div>
            </div>

            <div class="bill-to">
                <strong>Proveedor:</strong><br>
                ' . ($invoice['freelancer_name'] 
                    ? htmlspecialchars($invoice['freelancer_name']) . '<br>' . htmlspecialchars($invoice['freelancer_email'])
                    : '<strong>Spectra Platform</strong><br>Platform Services') . '
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Descripción</th>
                        <th>Cant.</th>
                        <th>Precio Unit.</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>';
        
        foreach ($lines as $line) {
            $html .= '
                    <tr>
                        <td>' . htmlspecialchars($line['concept']) . '</td>
                        <td>' . number_format($line['quantity'], 2) . '</td>
                        <td>' . $invoice['currency_symbol'] . number_format($line['unit_price'], 2) . '</td>
                        <td>' . $invoice['currency_symbol'] . number_format($line['line_total'], 2) . '</td>
                    </tr>';
        }

        $html .= '
                </tbody>
            </table>

            <div class="totals">
                <p><strong>Subtotal:</strong> ' . $invoice['currency_symbol'] . number_format($invoice['subtotal'], 2) . '</p>
                <p><strong>Impuestos/Retenciones:</strong> ' . $invoice['currency_symbol'] . number_format($invoice['tax_amount'], 2) . '</p>
                <p style="font-size: 14px; font-weight: bold;"><strong>TOTAL:</strong> ' . $invoice['currency_symbol'] . number_format($invoice['total_amount'], 2) . '</p>
            </div>
            
            ' . ($invoice['notes'] ? '<div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;"><strong>Notas:</strong><br>' . nl2br(htmlspecialchars($invoice['notes'])) . '</div>' : '') . '
        </body>
        </html>';

        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        $dompdf->stream("invoice_" . $invoice['invoice_number'] . ".pdf", ["Attachment" => true]);
        exit;
    }

    private function invoicesSend(string $companyId, string $invoiceId): void
    {
        $this->ensureInvoicesTable();

        $stmt = $this->pdo->prepare("
            SELECT i.*, u.email, u.full_name 
            FROM invoices i
            JOIN users u ON i.freelancer_id = u.id
            WHERE i.id = :id AND i.company_id = :cid
        ");
        $stmt->execute([':id' => $invoiceId, ':cid' => $companyId]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$invoice) {
            Response::error('Factura no encontrada', 404);
            return;
        }

        if (!$invoice['email']) {
            Response::error('El freelancer no tiene email registrado', 400);
            return;
        }

        try {
            $subject = "Factura #{$invoice['invoice_number']} - Detalles";
            $body = "
                <h1>Detalles de Factura</h1>
                <p>Hola {$invoice['full_name']},</p>
                <p>Se ha generado/actualizado la factura #{$invoice['invoice_number']} con un total de {$invoice['total_amount']}.</p>
                <p>Fecha de vencimiento: {$invoice['due_date']}</p>
                <p>Estado actual: {$invoice['status']}</p>
                <p>Puede descargar el PDF desde su panel.</p>
            ";

            SMTP::send($invoice['email'], $subject, $body, true);

            if ($invoice['status'] === 'draft') {
                $stmt = $this->pdo->prepare("UPDATE invoices SET status = 'sent' WHERE id = :id");
                $stmt->execute([':id' => $invoiceId]);
            }

            Response::json(['message' => 'Factura enviada por correo']);

        } catch (Throwable $e) {
            Response::error('Error al enviar correo: ' . $e->getMessage(), 500);
        }
    }

    private function ensureInvoicesTable(): void
    {
        // Create invoices table if not exists
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS invoices (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                contract_id CHAR(36) NULL,
                freelancer_id CHAR(36) NULL,
                invoice_number VARCHAR(50) NOT NULL,
                issue_date DATE NOT NULL,
                due_date DATE NOT NULL,
                currency_id INT NOT NULL,
                subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                status ENUM('draft', 'sent', 'issued', 'paid', 'overdue', 'voided') NOT NULL DEFAULT 'draft',
                notes TEXT NULL,
                contact_id CHAR(36) NULL,
                customer_name VARCHAR(150) NULL,
                customer_email VARCHAR(150) NULL,
                customer_phone VARCHAR(50) NULL,
                attachment_path VARCHAR(255) NULL,
                attachment_name VARCHAR(150) NULL,
                attachment_mime VARCHAR(100) NULL,
                attachment_size INT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                KEY idx_company_id (company_id),
                KEY idx_contract_id (contract_id),
                KEY idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Create invoice_lines table if not exists
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS invoice_lines (
                id CHAR(36) PRIMARY KEY,
                invoice_id CHAR(36) NOT NULL,
                concept VARCHAR(255) NOT NULL,
                quantity DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
                unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
                line_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                KEY idx_invoice_id (invoice_id),
                FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Lazy migrations for contact/customer fields
        try { $this->pdo->exec("ALTER TABLE invoices ADD COLUMN contact_id CHAR(36) NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE invoices ADD COLUMN customer_name VARCHAR(150) NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE invoices ADD COLUMN customer_email VARCHAR(150) NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE invoices ADD COLUMN customer_phone VARCHAR(50) NULL"); } catch (\Throwable $e) {}
        // Lazy migrations for attachment fields
        try { $this->pdo->exec("ALTER TABLE invoices ADD COLUMN attachment_path VARCHAR(255) NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE invoices ADD COLUMN attachment_name VARCHAR(150) NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE invoices ADD COLUMN attachment_mime VARCHAR(100) NULL"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE invoices ADD COLUMN attachment_size INT NULL"); } catch (\Throwable $e) {}
    }

    private function getFiscalParams(string $isoCode): array
    {
        if (empty($isoCode)) return [];
        
        try {
            $stmt = $this->pdo->prepare("
                SELECT fp.* 
                FROM fiscal_parameters fp
                JOIN countries c ON fp.country_id = c.id
                WHERE c.iso2 = :iso AND fp.is_active = 1
            ");
            $stmt->execute([':iso' => $isoCode]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return [];
        }
    }

    private function getSystemUserId(): string
    {
        $stmt = $this->pdo->query("SELECT id FROM users ORDER BY created_at ASC LIMIT 1");
        return $stmt->fetchColumn() ?: '00000000-0000-0000-0000-000000000000';
    }
}
