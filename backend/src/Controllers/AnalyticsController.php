<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class AnalyticsController
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
            CREATE TABLE IF NOT EXISTS monthly_costs_snapshots (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                month CHAR(7) NOT NULL, -- Format: YYYY-MM
                total_payroll DECIMAL(15, 2) DEFAULT 0.00,
                total_fees DECIMAL(15, 2) DEFAULT 0.00,
                total_taxes DECIMAL(15, 2) DEFAULT 0.00,
                currency_code CHAR(3) DEFAULT 'USD',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_company_month (company_id, month)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        $user = Auth::user();
        if (!in_array(($user['platform_role'] ?? ''), ['super_admin', 'admin'], true)) {
            Response::error('Acceso denegado: se requieren privilegios de administrador', 403);
            return;
        }

        $resource = $segments[2] ?? null;
        
        if ($resource === 'global-costs') {
            if ($method === 'GET') {
                $this->getGlobalCosts();
            } else {
                Response::error('Method not allowed', 405);
            }
        } elseif ($resource === 'snapshot') {
            if ($method === 'POST') {
                $this->generateSnapshot();
            } else {
                Response::error('Method not allowed', 405);
            }
        } elseif ($resource === 'hires') {
             if ($method === 'GET') $this->getHires();
        } elseif ($resource === 'turnover') {
             if ($method === 'GET') $this->getTurnover();
        } elseif ($resource === 'performance') {
             if ($method === 'GET') $this->getPerformance();
        } elseif ($resource === 'project-costs') {
             if ($method === 'GET') $this->getProjectCosts();
        } elseif ($resource === 'fiscal-compliance') {
             if ($method === 'GET') $this->getFiscalCompliance();
        } elseif ($resource === 'contracts-subscriptions') {
             if ($method === 'GET') $this->contractsSubscriptionsIndex();
        } else {
            Response::error('Resource not found', 404);
        }
    }

    private function contractsSubscriptionsIndex(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(200, (int)($_GET['per_page'] ?? 20)));
        $q = trim((string)($_GET['q'] ?? ''));
        $period = $_GET['period'] ?? 'current_month';
        $offset = ($page - 1) * $perPage;

        $now = new \DateTimeImmutable('now');
        if ($period === 'last_month') {
            $startDate = $now->modify('first day of last month')->format('Y-m-01');
            $endDate = $now->modify('last day of last month')->format('Y-m-t');
        } else {
            $startDate = $now->format('Y-m-01');
            $endDate = $now->format('Y-m-t');
        }

        $where = [];
        $paramsWhere = [];

        if ($this->tableHasColumn('companies', 'deleted_at')) {
            $where[] = 'c.deleted_at IS NULL';
        }

        if ($q !== '') {
            $where[] = '(c.legal_name LIKE :q OR c.trade_name LIKE :q)';
            $paramsWhere[':q'] = '%' . $q . '%';
        }

        $whereSql = $where ? implode(' AND ', $where) : '1=1';

        $countSql = "SELECT COUNT(*) FROM companies c WHERE {$whereSql}";
        $countStmt = $this->pdo->prepare($countSql);
        $countStmt->execute($paramsWhere);
        $total = (int)$countStmt->fetchColumn();

        $contractsJoin = 'ct.company_id = c.id';
        if ($this->tableHasColumn('contracts', 'deleted_at')) {
            $contractsJoin .= ' AND ct.deleted_at IS NULL';
        }

        $statuses = "'active','draft','pending'";
        $params = array_merge($paramsWhere, [
            ':start_date' => $startDate,
            ':end_date' => $endDate
        ]);

        $sql = "
            SELECT 
                c.id as company_id,
                c.legal_name,
                c.trade_name,
                COUNT(DISTINCT CASE 
                    WHEN ct.status IN ($statuses)
                     AND (ct.start_date IS NULL OR ct.start_date <= :end_date)
                     AND (ct.end_date IS NULL OR ct.end_date >= :start_date)
                    THEN ct.id END
                ) AS active_contracts,
                COALESCE(fr.value, 0) AS unit_price,
                cur.code AS currency_code
            FROM companies c
            LEFT JOIN company_fee_rules fr 
                ON fr.company_id = c.id 
               AND fr.type = 'per_freelancer_fee'
               AND fr.active = 1
            LEFT JOIN currencies cur 
                ON fr.currency_id = cur.id
            LEFT JOIN contracts ct 
                ON $contractsJoin
            WHERE {$whereSql}
            GROUP BY c.id, c.legal_name, c.trade_name, fr.value, cur.code
            ORDER BY c.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as &$row) {
            $activeContracts = (int)($row['active_contracts'] ?? 0);
            $unitPrice = (float)($row['unit_price'] ?? 0);
            $row['active_contracts'] = $activeContracts;
            $row['unit_price'] = $unitPrice;
            $row['total_amount'] = $activeContracts * $unitPrice;
        }
        unset($row);

        Response::json([
            'data' => $rows,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => (int)ceil($total / $perPage)
            ]
        ]);
    }

    private function tableHasColumn(string $table, string $column): bool
    {
        try {
            $stmt = $this->pdo->prepare("
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = :t
                  AND column_name = :c
                LIMIT 1
            ");
            $stmt->execute([':t' => $table, ':c' => $column]);
            return (bool)$stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function getHires(): void
    {
        $companyId = $_GET['company_id'] ?? null;
        if (!$companyId) { Response::error('company_id required', 400); return; }
        
        // Hires per month (users created or contracts started)
        // Let's use contracts started
        $stmt = $this->pdo->prepare("
            SELECT DATE_FORMAT(start_date, '%Y-%m') as month, COUNT(*) as count
            FROM contracts 
            WHERE company_id = :cid 
            GROUP BY month 
            ORDER BY month DESC
            LIMIT 12
        ");
        $stmt->execute([':cid' => $companyId]);
        Response::json(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    private function getTurnover(): void
    {
        $companyId = $_GET['company_id'] ?? null;
        if (!$companyId) { Response::error('company_id required', 400); return; }

        // Terminated contracts per month
        $stmt = $this->pdo->prepare("
            SELECT DATE_FORMAT(end_date, '%Y-%m') as month, COUNT(*) as count
            FROM contracts 
            WHERE company_id = :cid AND status = 'terminated'
            GROUP BY month 
            ORDER BY month DESC
            LIMIT 12
        ");
        $stmt->execute([':cid' => $companyId]);
        Response::json(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    private function getPerformance(): void
    {
        $companyId = $_GET['company_id'] ?? null;
        if (!$companyId) { Response::error('company_id required', 400); return; }

        // Average rating of closed contracts? Or milestones completed on time?
        // Let's use milestone completion status
        $stmt = $this->pdo->prepare("
            SELECT pm.status, COUNT(*) as count
            FROM project_milestones pm
            JOIN projects p ON pm.project_id = p.id
            WHERE p.company_id = :cid
            GROUP BY pm.status
        ");
        $stmt->execute([':cid' => $companyId]);
        Response::json(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    private function getProjectCosts(): void
    {
        $companyId = $_GET['company_id'] ?? null;
        if (!$companyId) { Response::error('company_id required', 400); return; }

        // Costos totales pagados por compañía (contracts↔invoices no tiene project_id en esquema actual;
        // se expone el total global por empresa; futura FK contracts.project_id para atribución por proyecto).
        $stmt = $this->pdo->prepare("
            SELECT 
                p.id, p.name,
                COALESCE(pc.company_total_cost, 0) as total_cost,
                MAX(pc.currency_code) as currency_code
            FROM projects p
            LEFT JOIN (
                SELECT c.company_id,
                       SUM(i.total_amount) as company_total_cost,
                       MAX(c_curr.code) as currency_code
                FROM contracts c
                JOIN invoices i ON i.contract_id = c.id AND i.status = 'paid'
                LEFT JOIN currencies c_curr ON i.currency_id = c_curr.id
                GROUP BY c.company_id
            ) pc ON pc.company_id = p.company_id
            WHERE p.company_id = :cid
            GROUP BY p.id, p.name
            ORDER BY total_cost DESC
            LIMIT 10
        ");
        $stmt->execute([':cid' => $companyId]);
        Response::json(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    private function getFiscalCompliance(): void
    {
        $companyId = $_GET['company_id'] ?? null;
        if (!$companyId) { Response::error('company_id required', 400); return; }

        // Check if freelancers in active contracts have tax_id set
        // We join contracts -> freelancers (users)
        $stmt = $this->pdo->prepare("
            SELECT 
                SUM(CASE WHEN u.national_id IS NOT NULL AND u.national_id != '' THEN 1 ELSE 0 END) as compliant,
                SUM(CASE WHEN u.national_id IS NULL OR u.national_id = '' THEN 1 ELSE 0 END) as non_compliant,
                COUNT(*) as total
            FROM contracts c
            JOIN users u ON c.freelancer_id = u.id
            WHERE c.company_id = :cid AND c.status = 'active'
        ");
        $stmt->execute([':cid' => $companyId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        Response::json(['data' => [
            ['status' => 'Compliant', 'count' => (int)($result['compliant'] ?? 0)],
            ['status' => 'Non-Compliant', 'count' => (int)($result['non_compliant'] ?? 0)]
        ]]);
    }

    private function getGlobalCosts(): void
    {
        $companyId = $_GET['company_id'] ?? null;
        $startMonth = $_GET['start_month'] ?? date('Y-m', strtotime('-11 months')); // Last 12 months
        $endMonth = $_GET['end_month'] ?? date('Y-m');

        if (!$companyId) {
            // Try to get from user context if possible, or error
            // For now, require company_id
             Response::error('company_id is required', 400);
             return;
        }

        $stmt = $this->pdo->prepare("
            SELECT * FROM monthly_costs_snapshots 
            WHERE company_id LIKE :cid 
            AND month >= :start 
            AND month <= :end
            ORDER BY month ASC
        ");
        
        $stmt->execute([
            ':cid' => $companyId,
            ':start' => $startMonth,
            ':end' => $endMonth
        ]);

        Response::json(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    private function generateSnapshot(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $companyId = $data['company_id'] ?? null;
        $month = $data['month'] ?? date('Y-m'); // YYYY-MM

        if (!$companyId) {
            Response::error('company_id is required', 400);
            return;
        }

        // 1. Calculate Payroll (Sum of all payroll items for users in this company for this month)
        // Assuming we can link users to company.
        // We need to join payroll_items -> payroll_runs (which has period_start/end) -> users (company_id)
        // Or payroll_items -> users -> company_id.
        // And payroll_items -> payroll_runs -> date check.
        
        // For simplicity, let's assume we sum payroll_items created in that month for users of that company.
        
        // Check if payroll_runs table exists (it should, but let's be safe or rely on created_at)
        // Better: Sum payroll_items where payroll_run_id is in a run that overlaps with the month.
        
        // Simplified Logic:
        // Total Payroll = Sum of 'earning' items
        // Total Taxes = Sum of 'tax' items
        // Total Fees = Placeholder (e.g. 50 * active_users)

        // Calculate Fees = per_freelancer_fee * active freelancers with contracts overlapping the month
        $startDate = $month . '-01 00:00:00';
        $endDate = date('Y-m-t 23:59:59', strtotime($startDate));

        // Load configured unit price
        $stmt = $this->pdo->prepare("
            SELECT value FROM company_fee_rules 
            WHERE company_id = :cid 
              AND type IN ('per_freelancer_fee','platform_fee')
              AND active = 1
            ORDER BY FIELD(type, 'per_freelancer_fee','platform_fee')
            LIMIT 1
        ");
        $stmt->execute([':cid' => $companyId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        $unitPrice = $row ? (float)$row['value'] : 0.0;

        // Count active freelancers (distinct) with active contracts overlapping month
        $activeFreelancers = 0;
        try {
            $stmt = $this->pdo->prepare("
                SELECT COUNT(DISTINCT c.freelancer_id) AS cnt
                FROM contracts c
                WHERE c.company_id = :cid
                  AND c.status = 'active'
                  AND (c.start_date IS NULL OR c.start_date <= :end_date)
                  AND (c.end_date IS NULL OR c.end_date >= :start_date)
            ");
            $stmt->execute([
                ':cid' => $companyId,
                ':start_date' => $startDate,
                ':end_date' => $endDate
            ]);
            $activeFreelancers = (int)$stmt->fetchColumn();
        } catch (\Throwable $e) {}

        $fees = $unitPrice * $activeFreelancers;

        // Get Payroll & Taxes
        // We need to query payroll_items linked to users of this company
        // created_at within month range
        // Payroll and taxes in this period
        
        $stmt = $this->pdo->prepare("
            SELECT 
                SUM(CASE WHEN pi.type = 'earning' THEN pi.amount ELSE 0 END) as earnings,
                SUM(CASE WHEN pi.type = 'tax' THEN pi.amount ELSE 0 END) as taxes
            FROM payroll_items pi
            JOIN company_users cu ON cu.user_id = pi.user_id
            WHERE cu.company_id LIKE :cid
            AND pi.created_at >= :start_date AND pi.created_at <= :end_date
        ");
        
        $stmt->execute([
            ':cid' => $companyId,
            ':start_date' => $startDate,
            ':end_date' => $endDate
        ]);
        
        $res = $stmt->fetch(PDO::FETCH_ASSOC);
        $payroll = $res['earnings'] ?? 0;
        $taxes = $res['taxes'] ?? 0;

        // Upsert Snapshot
        $stmt = $this->pdo->prepare("
            INSERT INTO monthly_costs_snapshots (id, company_id, month, total_payroll, total_fees, total_taxes)
            VALUES (UUID(), :cid, :month, :payroll, :fees, :taxes)
            ON DUPLICATE KEY UPDATE 
                total_payroll = VALUES(total_payroll),
                total_fees = VALUES(total_fees),
                total_taxes = VALUES(total_taxes),
                updated_at = NOW()
        ");

        $stmt->execute([
            ':cid' => $companyId,
            ':month' => $month,
            ':payroll' => $payroll,
            ':fees' => $fees,
            ':taxes' => $taxes
        ]);

        Response::json(['message' => 'Snapshot generated', 'month' => $month]);
    }
}
