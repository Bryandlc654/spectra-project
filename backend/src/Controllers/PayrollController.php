<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use App\Support\TaxEngine;
use PDO;

class PayrollController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
        $this->ensureIndexes();
    }

    private function ensureIndexes(): void
    {
        try {
            // Optimization for calculateRun query on contracts
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_contracts_company_status ON contracts(company_id, status)");
        } catch (\Exception $e) {
            // Ignore if index creation fails (e.g. index already exists or table doesn't exist yet)
        }
    }

    private function ensureTables(): void
    {
        // Payroll Runs (Global runs)
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS payroll_runs (
                id CHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                payment_date DATE NULL,
                status ENUM('draft', 'processing', 'paid') DEFAULT 'draft',
                total_amount DECIMAL(15, 2) DEFAULT 0.00,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_company (company_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Statutory Deductions (Rules)
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS statutory_deductions (
                id CHAR(36) PRIMARY KEY,
                country_id BIGINT UNSIGNED NOT NULL,
                name VARCHAR(100) NOT NULL,
                type ENUM('tax', 'social_security', 'pension', 'other') NOT NULL,
                percentage DECIMAL(5, 2) DEFAULT 0.00, -- e.g., 12.50 for 12.5%
                fixed_amount DECIMAL(10, 2) DEFAULT 0.00,
                currency_id INT DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_country (country_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Payroll Items (Line items for a specific payroll run/user)
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS payroll_items (
                id CHAR(36) PRIMARY KEY,
                payroll_run_id CHAR(36) NULL, -- Nullable if just a template or recurring item
                user_id VARCHAR(36) NOT NULL,
                type ENUM('earning', 'deduction', 'tax', 'reimbursement') NOT NULL,
                description VARCHAR(255) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                currency_id INT NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user (user_id),
                INDEX idx_run (payroll_run_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/payroll/deductions
        // /api/payroll/items
        // /api/payroll/runs
        // /api/payroll/runs/:id/calculate
        // /api/payroll/settlement
        // /api/payroll/salary-calculator

        $resource = $segments[2] ?? null;
        $id = $segments[3] ?? null;
        $action = $segments[4] ?? null;

        if (!$resource) {
            Response::error('Recurso no especificado (deductions, items, runs)', 400);
            return;
        }

        switch ($resource) {
            case 'deductions':
                $this->handleDeductions($method, $id);
                break;
            case 'items':
                $this->handleItems($method, $id);
                break;
            case 'runs':
                if ($id && $action === 'calculate' && $method === 'POST') {
                    $this->calculateRun($id);
                } else {
                    $this->handleRuns($method, $id);
                }
                break;
            case 'settlement':
                $this->handleSettlement($method);
                break;
            case 'salary-calculator':
                $this->handleSalaryCalculator($method);
                break;
            default:
                Response::error('Recurso inválido', 404);
        }
    }

    private function handleSalaryCalculator(string $method): void
    {
        if ($method !== 'POST') {
            Response::error('Método no permitido', 405);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $country = strtoupper(trim((string)($data['country'] ?? 'PE')));
        if ($country !== 'PE') {
            Response::error('Por ahora solo soporta Perú (PE)', 422);
            return;
        }

        $startDateStr = (string)($data['start_date'] ?? '');
        $endDateStr = (string)($data['end_date'] ?? '');
        $terminationReason = trim((string)($data['termination_reason'] ?? ''));
        if ($terminationReason === '') {
            Response::error('Motivo de cese es obligatorio', 422);
            return;
        }

        try {
            $startDate = new \DateTimeImmutable($startDateStr);
            $endDate = new \DateTimeImmutable($endDateStr);
        } catch (\Throwable $e) {
            Response::error('Fechas inválidas', 422);
            return;
        }

        if ($startDate > $endDate) {
            Response::error('La fecha de ingreso no puede ser mayor que la fecha de cese', 422);
            return;
        }

        $salaryBase = (float)($data['salary_base'] ?? 0);
        $familyAllowance = (float)($data['family_allowance'] ?? 0);
        $otherFixedIncome = (float)($data['other_fixed_income'] ?? 0);

        if ($salaryBase <= 0) {
            Response::error('Sueldo básico inválido', 422);
            return;
        }

        $currencyCode = strtoupper(trim((string)($data['currency_code'] ?? 'PEN')));

        $config = is_array($data['config'] ?? null) ? ($data['config'] ?? []) : [];
        $bonusRate = (float)($config['bonus_rate'] ?? 0.09);
        $daysPerMonth = (int)($config['days_per_month'] ?? 30);
        $daysPerYear = (int)($config['days_per_year'] ?? 360);
        $ctsDivisor = (float)($config['cts_divisor'] ?? 12);
        $gratDivisor = (float)($config['grat_divisor'] ?? 6);

        if ($daysPerMonth <= 0) $daysPerMonth = 30;
        if ($daysPerYear <= 0) $daysPerYear = 360;
        if ($ctsDivisor <= 0) $ctsDivisor = 12;
        if ($gratDivisor <= 0) $gratDivisor = 6;
        if ($bonusRate < 0) $bonusRate = 0;

        $pension = is_array($data['pension'] ?? null) ? ($data['pension'] ?? []) : [];
        $pensionRegime = strtoupper(trim((string)($pension['type'] ?? 'ONP')));

        $onpRate = (float)($pension['onp_rate'] ?? 0.13);
        $afpFund = (float)($pension['afp_fund'] ?? 0.10);
        $afpCommission = (float)($pension['afp_commission'] ?? 0.0147);
        $afpInsurance = (float)($pension['afp_insurance'] ?? 0.017);

        if ($onpRate < 0) $onpRate = 0;
        if ($afpFund < 0) $afpFund = 0;
        if ($afpCommission < 0) $afpCommission = 0;
        if ($afpInsurance < 0) $afpInsurance = 0;

        $baseRemunerative = $salaryBase + $familyAllowance + $otherFixedIncome;

        $serviceTotalDays = $this->dias360Us($startDate, $endDate->modify('+1 day'));
        $serviceYears = intdiv($serviceTotalDays, $daysPerYear);
        $remaining = $serviceTotalDays % $daysPerYear;
        $serviceMonths = intdiv($remaining, $daysPerMonth);
        $serviceDays = $remaining % $daysPerMonth;

        $gratAvgSixth = $baseRemunerative / $gratDivisor;
        $gratBonus = $gratAvgSixth * $bonusRate;
        $remComputable = $baseRemunerative + $gratAvgSixth + $gratBonus;

        [$ctsPeriodStart, $ctsPeriodEnd] = $this->getCtsSemesterPeriod($endDate);
        $ctsCalcFrom = ($startDate > $ctsPeriodStart) ? $startDate : $ctsPeriodStart;
        $ctsTotalDays = $this->dias360Us($ctsCalcFrom, $endDate->modify('+1 day'));
        $ctsMonths = intdiv($ctsTotalDays, $daysPerMonth);
        $ctsDays = $ctsTotalDays % $daysPerMonth;

        $ctsAmountMonths = ($remComputable / $ctsDivisor) * $ctsMonths;
        $ctsAmountDays = (($remComputable / $ctsDivisor) / $daysPerMonth) * $ctsDays;
        $ctsTotal = $ctsAmountMonths + $ctsAmountDays;

        $vacAccrualStart = $this->getLastAnniversary($startDate, $endDate);
        if ($vacAccrualStart < $startDate) $vacAccrualStart = $startDate;
        $vacTotalDays = $this->dias360Us($vacAccrualStart, $endDate->modify('+1 day'));
        $vacMonths = intdiv($vacTotalDays, $daysPerMonth);
        $vacDays = $vacTotalDays % $daysPerMonth;

        $vacAmountMonths = ($baseRemunerative / 12.0) * $vacMonths;
        $vacAmountDays = (($baseRemunerative / 12.0) / $daysPerMonth) * $vacDays;
        $vacGross = $vacAmountMonths + $vacAmountDays;

        $pensionComponents = [];
        $pensionTotal = 0.0;
        if ($pensionRegime === 'AFP') {
            $pensionComponents = [
                ['code' => 'afp_fund', 'rate' => $afpFund, 'amount' => $vacGross * $afpFund],
                ['code' => 'afp_commission', 'rate' => $afpCommission, 'amount' => $vacGross * $afpCommission],
                ['code' => 'afp_insurance', 'rate' => $afpInsurance, 'amount' => $vacGross * $afpInsurance],
            ];
            $pensionTotal = array_reduce($pensionComponents, fn($acc, $c) => $acc + (float)($c['amount'] ?? 0), 0.0);
        } else {
            $pensionRegime = 'ONP';
            $pensionComponents = [
                ['code' => 'onp', 'rate' => $onpRate, 'amount' => $vacGross * $onpRate],
            ];
            $pensionTotal = (float)($pensionComponents[0]['amount'] ?? 0);
        }

        $vacNet = $vacGross - $pensionTotal;

        [$gratPeriodStart, $gratPeriodEnd] = $this->getGratificationSemesterPeriod($endDate);
        $gratCalcFrom = ($startDate > $gratPeriodStart) ? $startDate : $gratPeriodStart;
        $gratTotalDays = $this->dias360Us($gratCalcFrom, $endDate->modify('+1 day'));
        $gratMonths = intdiv($gratTotalDays, $daysPerMonth);
        $gratDays = $gratTotalDays % $daysPerMonth;

        $gratAmountMonths = ($baseRemunerative / $gratDivisor) * $gratMonths;
        $gratAmountDays = (($baseRemunerative / $gratDivisor) / $daysPerMonth) * $gratDays;
        $gratTotal = $gratAmountMonths + $gratAmountDays;

        $bonusExtra = $gratTotal * $bonusRate;
        $totalPay = $ctsTotal + $vacNet + $gratTotal + $bonusExtra;

        $items = [
            ['type' => 'benefit', 'code' => 'CTS', 'name' => 'CTS', 'amount' => round($ctsTotal, 2)],
            ['type' => 'benefit', 'code' => 'VACACIONES_NETO', 'name' => 'Vacaciones truncas (neto)', 'amount' => round($vacNet, 2)],
            ['type' => 'benefit', 'code' => 'GRATIFICACION', 'name' => 'Gratificación trunca', 'amount' => round($gratTotal, 2)],
            ['type' => 'benefit', 'code' => 'BONIFICACION_9', 'name' => 'Bonificación extraordinaria', 'amount' => round($bonusExtra, 2)],
        ];
        foreach ($pensionComponents as $c) {
            $items[] = [
                'type' => 'deduction',
                'code' => (string)($c['code'] ?? ''),
                'name' => ($pensionRegime === 'AFP')
                    ? ((string)($c['code'] ?? '') === 'afp_fund' ? 'AFP Fondo' : ((string)($c['code'] ?? '') === 'afp_commission' ? 'AFP Comisión' : 'AFP Seguro'))
                    : 'ONP',
                'amount' => round((float)($c['amount'] ?? 0), 2),
                'applies_to' => 'vacaciones',
            ];
        }

        Response::json([
            'country' => 'PE',
            'currency_code' => $currencyCode,
            'inputs' => [
                'start_date' => $startDate->format('Y-m-d'),
                'end_date' => $endDate->format('Y-m-d'),
                'termination_reason' => $terminationReason,
                'salary_base' => round($salaryBase, 2),
                'family_allowance' => round($familyAllowance, 2),
                'other_fixed_income' => round($otherFixedIncome, 2),
                'base_remunerative' => round($baseRemunerative, 2),
                'pension' => [
                    'type' => $pensionRegime,
                    'onp_rate' => $onpRate,
                    'afp_fund' => $afpFund,
                    'afp_commission' => $afpCommission,
                    'afp_insurance' => $afpInsurance,
                ],
                'config' => [
                    'bonus_rate' => $bonusRate,
                    'days_per_month' => $daysPerMonth,
                    'days_per_year' => $daysPerYear,
                    'cts_divisor' => $ctsDivisor,
                    'grat_divisor' => $gratDivisor,
                ],
            ],
            'service_time' => [
                'years' => $serviceYears,
                'months' => $serviceMonths,
                'days' => $serviceDays,
                'total_days_360' => $serviceTotalDays,
            ],
            'remuneracion_computable' => [
                'base' => round($baseRemunerative, 2),
                'grat_avg' => round($gratAvgSixth, 2),
                'bonus_rate' => $bonusRate,
                'bonus' => round($gratBonus, 2),
                'total' => round($remComputable, 2),
            ],
            'cts' => [
                'period_start' => $ctsPeriodStart->format('Y-m-d'),
                'period_end' => $ctsPeriodEnd->format('Y-m-d'),
                'calc_from' => $ctsCalcFrom->format('Y-m-d'),
                'months' => $ctsMonths,
                'days' => $ctsDays,
                'total_raw' => round($ctsTotal, 6),
                'total' => round($ctsTotal, 2),
            ],
            'vacaciones_truncas' => [
                'accrual_start' => $vacAccrualStart->format('Y-m-d'),
                'months' => $vacMonths,
                'days' => $vacDays,
                'base' => round($baseRemunerative, 2),
                'gross' => round($vacGross, 2),
                'pension' => [
                    'type' => $pensionRegime,
                    'components' => array_map(fn($c) => [
                        'code' => (string)($c['code'] ?? ''),
                        'rate' => (float)($c['rate'] ?? 0),
                        'amount' => round((float)($c['amount'] ?? 0), 2),
                    ], $pensionComponents),
                    'total' => round($pensionTotal, 2),
                ],
                'net' => round($vacNet, 2),
            ],
            'gratificacion_trunca' => [
                'period_start' => $gratPeriodStart->format('Y-m-d'),
                'period_end' => $gratPeriodEnd->format('Y-m-d'),
                'calc_from' => $gratCalcFrom->format('Y-m-d'),
                'months' => $gratMonths,
                'days' => $gratDays,
                'base' => round($baseRemunerative, 2),
                'total' => round($gratTotal, 2),
            ],
            'bonificacion_extraordinaria' => [
                'rate' => $bonusRate,
                'amount' => round($bonusExtra, 2),
            ],
            'items' => $items,
            'total_pagar' => round($totalPay, 2),
        ]);
    }

    private function handleDeductions(string $method, ?string $id): void
    {
        if ($method === 'GET') {
            $countryId = $_GET['country_id'] ?? null;
            
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
            $offset = ($page - 1) * $limit;

            if ($countryId) {
                // Count
                $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM statutory_deductions WHERE country_id LIKE :cid");
                $stmt->execute([':cid' => $countryId]);
                $total = (int)$stmt->fetchColumn();

                $stmt = $this->pdo->prepare("SELECT * FROM statutory_deductions WHERE country_id LIKE :cid LIMIT :limit OFFSET :offset");
                $stmt->bindValue(':cid', $countryId);
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
            } else {
                // List all
                $total = (int)$this->pdo->query("SELECT COUNT(*) FROM statutory_deductions")->fetchColumn();
                
                $stmt = $this->pdo->prepare("SELECT * FROM statutory_deductions LIMIT :limit OFFSET :offset");
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
        } elseif ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            $this->pdo->prepare("
                INSERT INTO statutory_deductions (id, country_id, name, type, percentage, fixed_amount, currency_id)
                VALUES (UUID(), :country, :name, :type, :pct, :fixed, :curr)
            ")->execute([
                ':country' => $data['country_id'],
                ':name' => $data['name'],
                ':type' => $data['type'],
                ':pct' => $data['percentage'] ?? 0,
                ':fixed' => $data['fixed_amount'] ?? 0,
                ':curr' => $data['currency_id'] ?? 1
            ]);
            Response::json(['message' => 'Deducción estatutaria creada'], 201);
        }
    }

    private function handleItems(string $method, ?string $id): void
    {
        if ($method === 'GET') {
            $userId = $_GET['user_id'] ?? null;
            $runId = $_GET['payroll_run_id'] ?? null;
            $export = $_GET['export'] ?? null;
            
            $where = "WHERE 1=1";
            $params = [];
            
            if ($userId) {
                $where .= " AND payroll_items.user_id LIKE :uid";
                $params[':uid'] = $userId;
            }
            if ($runId) {
                $where .= " AND payroll_items.payroll_run_id LIKE :run";
                $params[':run'] = $runId;
            }

            // Join users to get names
            $sql = "
                SELECT payroll_items.*, users.first_name, users.last_name, users.email 
                FROM payroll_items 
                LEFT JOIN users ON payroll_items.user_id = users.id
                $where
            ";

            if ($export === 'csv') {
                $stmt = $this->pdo->prepare($sql . " ORDER BY users.last_name, users.first_name");
                $stmt->execute($params);
                $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                header('Content-Type: text/csv');
                header('Content-Disposition: attachment; filename="payroll_items.csv"');
                $output = fopen('php://output', 'w');
                fputcsv($output, ['ID', 'Run ID', 'User ID', 'Name', 'Email', 'Type', 'Description', 'Amount', 'Currency']);
                
                foreach ($items as $item) {
                    fputcsv($output, [
                        $item['id'],
                        $item['payroll_run_id'],
                        $item['user_id'],
                        ($item['first_name'] ?? '') . ' ' . ($item['last_name'] ?? ''),
                        $item['email'] ?? '',
                        $item['type'],
                        $item['description'],
                        $item['amount'],
                        $item['currency_id']
                    ]);
                }
                fclose($output);
                exit;
            }
            
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
            $offset = ($page - 1) * $limit;
            
            // Count
            $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM payroll_items $where");
            $countStmt->execute($params);
            $total = (int)$countStmt->fetchColumn();

            // Fetch
            $stmt = $this->pdo->prepare("$sql LIMIT :limit OFFSET :offset");
            foreach ($params as $k => $v) {
                $stmt->bindValue($k, $v);
            }
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
            
        } elseif ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            $this->pdo->prepare("
                INSERT INTO payroll_items (id, payroll_run_id, user_id, type, description, amount, currency_id)
                VALUES (UUID(), :run, :uid, :type, :desc, :amt, :curr)
            ")->execute([
                ':run' => $data['payroll_run_id'] ?? null,
                ':uid' => $data['user_id'],
                ':type' => $data['type'],
                ':desc' => $data['description'],
                ':amt' => $data['amount'],
                ':curr' => $data['currency_id'] ?? 1
            ]);
            Response::json(['message' => 'Item de nómina agregado'], 201);
        }
    }

    private function handleRuns(string $method, ?string $id): void
    {
        if ($method === 'GET') {
            if ($id) {
                $stmt = $this->pdo->prepare("SELECT * FROM payroll_runs WHERE id LIKE ?");
                $stmt->execute([$id]);
                $run = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$run) Response::error('Payroll run not found', 404);

                // Security Check
                $user = Auth::user();
                if ($user && in_array($user['platform_role'] ?? '', ['company_admin', 'it_admin']) && $run['company_id'] !== ($user['company_id'] ?? null)) {
                    Response::error('Unauthorized', 403);
                }

                Response::json($run);
            } else {
                $companyId = $_GET['company_id'] ?? null;
                
                // Security Check
                $user = Auth::user();
                // Fix: Check if user exists and safely access platform_role
                $role = $user['platform_role'] ?? '';
                if ($user && in_array($role, ['company_admin', 'it_admin'])) {
                    if ($companyId && $companyId !== ($user['company_id'] ?? null)) {
                         Response::error('Unauthorized access to other company data', 403);
                    }
                    $companyId = $user['company_id'] ?? $companyId;
                }

                $page = max(1, (int)($_GET['page'] ?? 1));
                $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
                $offset = ($page - 1) * $limit;

                $sql = "SELECT * FROM payroll_runs";
                $countSql = "SELECT COUNT(*) FROM payroll_runs";
                $params = [];

                if ($companyId) {
                    $sql .= " WHERE company_id LIKE ?";
                    $countSql .= " WHERE company_id LIKE ?";
                    $params[] = $companyId;
                }
                
                $sql .= " ORDER BY period_start DESC LIMIT ? OFFSET ?";
                
                $stmt = $this->pdo->prepare($sql);
                // Bind params manually for LIMIT/OFFSET as they need INT
                $idx = 1;
                foreach ($params as $param) {
                    $stmt->bindValue($idx++, $param);
                }
                $stmt->bindValue($idx++, $limit, PDO::PARAM_INT);
                $stmt->bindValue($idx++, $offset, PDO::PARAM_INT);
                $stmt->execute();
                
                $runs = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // Count
                $countStmt = $this->pdo->prepare($countSql);
                $countStmt->execute($params);
                $total = (int)$countStmt->fetchColumn();

                Response::json([
                    'data' => $runs,
                    'pagination' => [
                        'total' => $total,
                        'page' => $page,
                        'limit' => $limit,
                        'total_pages' => ceil($total / $limit)
                    ]
                ]);
            }
        } elseif ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            $id = \App\Support\Str::uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO payroll_runs (id, company_id, period_start, period_end, payment_date, type, status)
                VALUES (:id, :company, :start, :end, :pay, :type, 'draft')
            ");
            $stmt->execute([
                ':id' => $id,
                ':company' => $data['company_id'],
                ':start' => $data['period_start'],
                ':end' => $data['period_end'],
                ':pay' => $data['payment_date'],
                ':type' => $data['type'] ?? 'regular'
            ]);
            Response::json(['message' => 'Payroll run created', 'id' => $id], 201);
        } elseif ($method === 'PUT' && $id) {
            // Update status or re-calculate
            $data = json_decode(file_get_contents('php://input'), true);
            $newStatus = $data['status'] ?? null;

            if ($newStatus === 'paid') {
                $this->processPayment($id);
            } else {
                $stmt = $this->pdo->prepare("UPDATE payroll_runs SET status = ? WHERE id LIKE ?");
                $stmt->execute([$newStatus, $id]);
                Response::json(['message' => 'Payroll run updated']);
            }
        }
    }

    private function processPayment(string $runId): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM payroll_runs WHERE id = :id");
        $stmt->execute([':id' => $runId]);
        $run = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$run) {
            Response::error('Run not found', 404);
            return;
        }

        if ($run['status'] === 'paid') {
            Response::error('Payroll run is already paid', 400);
            return;
        }

        $companyId = $run['company_id'];

        // 1. Calculate Total Amount to Pay
        $stmtSum = $this->pdo->prepare("
            SELECT SUM(amount) as total 
            FROM payroll_items 
            WHERE payroll_run_id = :id 
            AND type IN ('earning', 'reimbursement')
        ");
        $stmtSum->execute([':id' => $runId]);
        $earnings = (float)$stmtSum->fetchColumn();

        $stmtDed = $this->pdo->prepare("
            SELECT SUM(amount) as total 
            FROM payroll_items 
            WHERE payroll_run_id = :id 
            AND type IN ('deduction', 'tax')
        ");
        $stmtDed->execute([':id' => $runId]);
        $deductions = (float)$stmtDed->fetchColumn();

        $totalToPay = $earnings - $deductions;

        if ($totalToPay <= 0) {
            Response::error('Total amount to pay must be positive', 400);
            return;
        }

        // 2. Check Wallet Balance
            $stmtW = $this->pdo->prepare("SELECT company_id, balance, currency_id FROM wallets WHERE company_id = :id LIMIT 1");
            $stmtW->execute([':id' => $companyId]);
            $wallet = $stmtW->fetch(PDO::FETCH_ASSOC);

            if (!$wallet) {
                Response::error('Company wallet not found', 404);
                return;
            }

            if ((float)$wallet['balance'] < $totalToPay) {
                Response::error('Insufficient wallet balance', 400);
                return;
            }

            try {
                $this->pdo->beginTransaction();

                // 3. Deduct from Wallet
                $newBalance = (float)$wallet['balance'] - $totalToPay;
                $this->pdo->prepare("UPDATE wallets SET balance = :bal, updated_at = NOW() WHERE company_id = :id")
                    ->execute([':bal' => $newBalance, ':id' => $companyId]);

                // 4. Record Wallet Transaction
                $this->pdo->prepare("
                    INSERT INTO wallet_transactions (
                        id, company_id, type, amount, balance_after, description, reference_id, status, created_at
                    ) VALUES (
                        UUID(), :cid, 'debit', :amt, :bal, :desc, :ref, 'completed', NOW()
                    )
                ")->execute([
                    ':cid' => $companyId,
                    ':amt' => $totalToPay,
                    ':bal' => $newBalance,
                    ':desc' => 'Payroll Run Payment #' . substr($runId, 0, 8),
                    ':ref' => $runId
                ]);

            // 5. Generate Invoices for each User
            // Group items by user
            $stmtItems = $this->pdo->prepare("
                SELECT pi.*, u.full_name, c.id as contract_id, c.currency_id as contract_currency
                FROM payroll_items pi
                JOIN users u ON pi.user_id = u.id
                LEFT JOIN contracts c ON c.freelancer_id = u.id AND c.company_id = :cid AND c.status = 'active'
                WHERE pi.payroll_run_id = :rid
            ");
            $stmtItems->execute([':cid' => $companyId, ':rid' => $runId]);
            $allItems = $stmtItems->fetchAll(PDO::FETCH_ASSOC);

            $userItems = [];
            foreach ($allItems as $item) {
                $userItems[$item['user_id']][] = $item;
            }

            foreach ($userItems as $userId => $items) {
                $contractId = $items[0]['contract_id'] ?? null;
                $currencyId = $items[0]['contract_currency'] ?? 1; // Default or fallback
                $invoiceId = \App\Support\Str::uuid();
                
                // Calculate Totals for this Invoice
                $invSubtotal = 0;
                $invTax = 0;
                $invTotal = 0;

                foreach ($items as $item) {
                    $amt = (float)$item['amount'];
                    if (in_array($item['type'], ['earning', 'reimbursement'])) {
                        $invSubtotal += $amt;
                    } elseif (in_array($item['type'], ['deduction', 'tax'])) {
                        $invTax += $amt; // Stored as positive in DB, but represents deduction
                    }
                }
                $invTotal = $invSubtotal - $invTax;

                // Create Invoice Header
                $this->pdo->prepare("
                    INSERT INTO invoices (
                        id, company_id, contract_id, freelancer_id, 
                        invoice_number, issue_date, due_date, currency_id, 
                        subtotal, tax_amount, total_amount, status, notes, created_at
                    ) VALUES (
                        :id, :cid, :contract, :freelancer,
                        :num, NOW(), NOW(), :cur,
                        :sub, :tax, :total, 'paid', :notes, NOW()
                    )
                ")->execute([
                    ':id' => $invoiceId,
                    ':cid' => $companyId,
                    ':contract' => $contractId,
                    ':freelancer' => $userId,
                    ':num' => 'PAY-' . date('Ymd') . '-' . substr($invoiceId, 0, 4),
                    ':cur' => $currencyId,
                    ':sub' => $invSubtotal,
                    ':tax' => $invTax,
                    ':total' => $invTotal,
                    ':notes' => 'Generated from Payroll Run ' . substr($runId, 0, 8)
                ]);

                // Create Invoice Lines
                $lineStmt = $this->pdo->prepare("
                    INSERT INTO invoice_lines (
                        id, invoice_id, concept, quantity, unit_price, line_total, created_at
                    ) VALUES (
                        UUID(), :inv, :desc, 1, :price, :amt, NOW()
                    )
                ");

                foreach ($items as $item) {
                    $desc = ucfirst($item['type']) . ': ' . $item['description'];
                    $amt = (float)$item['amount'];
                    // If deduction, maybe show negative or just list it? 
                    // Invoice lines usually sum up. Deductions in invoices are tricky.
                    // For now, list everything positive, but taxes handled in header.
                    // ACTUALLY: Invoice lines should be Earnings. Taxes/Deductions are header fields usually.
                    // But we have detailed deductions. 
                    // Let's add them as lines with negative values if type is deduction/tax?
                    // Or just add Earnings as lines?
                    // Decision: Add ALL as lines. If type is deduction, amount is negative for the line?
                    // Our invoice_lines schema expects positive usually.
                    // Let's stick to Earnings as Lines. Deductions usually go to 'tax_amount' aggregation.
                    
                    if (in_array($item['type'], ['deduction', 'tax'])) {
                        continue; // Skip individual deduction lines to keep invoice clean? Or add as negative?
                        // Let's skip for now and assume they are aggregated in tax_amount
                    }

                    $lineStmt->execute([
                        ':inv' => $invoiceId,
                        ':desc' => $desc,
                        ':price' => $amt,
                        ':amt' => $amt
                    ]);
                }
            }

            // 5. Apply Payroll Fee if configured
            $stmtFee = $this->pdo->prepare("SELECT * FROM company_fee_rules WHERE company_id = :cid AND type = 'payroll_fee' AND active = 1 LIMIT 1");
            $stmtFee->execute([':cid' => $companyId]);
            $feeRule = $stmtFee->fetch(PDO::FETCH_ASSOC);

            $feeAmount = 0;
            if ($feeRule) {
                $feeAmount = (float)$feeRule['value'];
                $totalToPay += $feeAmount;
                // We don't add it as a payroll_item because it's not for a user, it's a company cost.
                // We should record it as a transaction or add to a "Company Fee" invoice/transaction.
                // For simplicity, we deduct it from wallet as a separate transaction or same transaction split.
                // Let's add a separate transaction for the fee.
                
                $walletStmt = $this->pdo->prepare("SELECT id FROM wallets WHERE company_id = ? LIMIT 1");
                $walletStmt->execute([$companyId]);
                $wallet = $walletStmt->fetch(PDO::FETCH_ASSOC);
                
                if ($wallet) {
                     $txnId = \App\Support\Str::uuid();
                     $this->pdo->prepare("
                        INSERT INTO wallet_transactions (id, wallet_id, type, amount, description, reference_id, created_at, status)
                        VALUES (?, ?, 'fee', ?, 'Payroll Fee', ?, NOW(), 'completed')
                     ")->execute([$txnId, $wallet['id'], -$feeAmount, $runId]);
                     
                     // Update Wallet Balance
                     $this->pdo->prepare("UPDATE wallets SET balance = balance - ? WHERE id = ?")->execute([$feeAmount, $wallet['id']]);
                }
            }

            // 6. Update Run Status
            $this->pdo->prepare("UPDATE payroll_runs SET status = 'paid', payment_date = NOW(), total_amount = :total WHERE id = :id")
                ->execute([':total' => $totalToPay, ':id' => $runId]);

            $this->pdo->commit();
            Response::json(['message' => 'Payroll run paid and invoices generated successfully']);

        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            Response::error('Payment failed: ' . $e->getMessage(), 500);
        }
    }

    private function calculateRun(string $runId): void
    {
        // 1. Fetch Run to get Company
        $stmt = $this->pdo->prepare("SELECT * FROM payroll_runs WHERE id LIKE ?");
        $stmt->execute([$runId]);
        $run = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$run) {
            Response::error('Payroll run not found', 404);
            return;
        }

        $companyId = $run['company_id'];

        // 2. Fetch Active Contracts/Users
        // We look for active contracts for this company
        $stmt = $this->pdo->prepare("
            SELECT c.*, u.id as user_id_from_user, u.full_name, co.iso2 as country_iso
            FROM contracts c
            LEFT JOIN users u ON c.freelancer_id = u.id
            LEFT JOIN countries co ON c.country_id = co.id
            WHERE c.company_id LIKE :cid 
              AND c.status IN ('active', 'pending')
        ");
        $stmt->execute([':cid' => $companyId]);
        $contracts = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($contracts)) {
            Response::json(['message' => 'No active contracts found to process', 'items_created' => 0]);
            return;
        }

        // Optimize: Pre-fetch Fiscal Params for all countries involved
        $countryCodes = array_unique(array_map(function($c) { return $c['country_iso'] ?? 'PE'; }, $contracts));
        $fiscalParamsCache = [];
        foreach ($countryCodes as $iso) {
            $fiscalParamsCache[$iso] = $this->getFiscalParams($iso);
        }

        $this->pdo->beginTransaction();
        try {
            // Clear existing auto-generated items for this run (optional, but good for re-calc)
            $this->pdo->prepare("DELETE FROM payroll_items WHERE payroll_run_id LIKE ?")->execute([$runId]);

            $totalPayroll = 0;
            $countItems = 0;
            $batchItems = [];

            foreach ($contracts as $contract) {
                $gross = (float)$contract['rate']; // Assuming monthly rate
                // Adjust if rate is hourly? For now assume monthly for simplicity as per MVP
                if ($contract['payment_frequency'] === 'hourly') {
                    $gross = $gross * 160; // Approx 160h/month
                }

                $countryCode = $contract['country_iso'] ?? 'PE'; // Default to PE if missing
                $type = $contract['type'];
                $userId = $contract['freelancer_id'] ?? $contract['user_id_from_user'];

                if (!$userId) continue;

                // Add Gross Salary Item
                $batchItems[] = [
                    'id' => \App\Support\Str::uuid(),
                    'run_id' => $runId,
                    'user_id' => $userId,
                    'type' => 'earning',
                    'desc' => 'Salario Base',
                    'amount' => $gross,
                    'curr' => $contract['currency_id']
                ];
                $totalPayroll += $gross;
                $countItems++;

                // Calculate Taxes via Engine
                $fiscalParams = $fiscalParamsCache[$countryCode] ?? [];
                $taxes = TaxEngine::calculate($gross, $countryCode, $type, [], $fiscalParams);

                foreach ($taxes as $tax) {
                    $batchItems[] = [
                        'id' => \App\Support\Str::uuid(),
                        'run_id' => $runId,
                        'user_id' => $userId,
                        'type' => $tax['type'],
                        'desc' => $tax['name'],
                        'amount' => $tax['amount'],
                        'curr' => $contract['currency_id']
                    ];
                    
                    if ($tax['type'] === 'deduction' || $tax['type'] === 'tax') {
                        $totalPayroll -= $tax['amount'];
                    }
                    $countItems++;
                }
            }

            // Batch Insert
            if (!empty($batchItems)) {
                $chunks = array_chunk($batchItems, 100); // Insert in chunks of 100
                foreach ($chunks as $chunk) {
                    $values = [];
                    $params = [];
                    foreach ($chunk as $i => $item) {
                        $values[] = "(:id$i, :run$i, :uid$i, :type$i, :desc$i, :amt$i, :curr$i)";
                        $params[":id$i"] = $item['id'];
                        $params[":run$i"] = $item['run_id'];
                        $params[":uid$i"] = $item['user_id'];
                        $params[":type$i"] = $item['type'];
                        $params[":desc$i"] = $item['desc'];
                        $params[":amt$i"] = $item['amount'];
                        $params[":curr$i"] = $item['curr'];
                    }
                    $sql = "INSERT INTO payroll_items (id, payroll_run_id, user_id, type, description, amount, currency_id) VALUES " . implode(', ', $values);
                    $this->pdo->prepare($sql)->execute($params);
                }
            }

            // Update Run Total
            $this->pdo->prepare("UPDATE payroll_runs SET total_amount = ? WHERE id LIKE ?")->execute([$totalPayroll, $runId]);

            $this->pdo->commit();
            Response::json(['message' => 'Payroll calculation complete', 'items_created' => $countItems, 'total_amount' => $totalPayroll]);

        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Calculation error: ' . $e->getMessage(), 500);
        }
    }

    private function addItem($runId, $userId, $type, $desc, $amount, $currencyId) {
        $this->pdo->prepare("
            INSERT INTO payroll_items (id, payroll_run_id, user_id, type, description, amount, currency_id)
            VALUES (UUID(), ?, ?, ?, ?, ?, ?)
        ")->execute([$runId, $userId, $type, $desc, $amount, $currencyId]);
    }

    private function handleSettlement(string $method): void
    {
        if ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true) ?? [];

            $country = strtoupper(trim((string)($data['country'] ?? '')));
            if ($country === 'PE' || ($data['mode'] ?? null) === 'pe_benefits') {
                $this->calculatePeruBenefitsSettlement($data);
                return;
            }

            $userId = $data['user_id'] ?? null;
            $endDate = $data['termination_date'] ?? date('Y-m-d');

            if (!$userId) {
                Response::error('User ID required', 400);
                return;
            }

            $currentUser = Auth::user();
            $isSuperAdmin = ($currentUser['platform_role'] ?? '') === 'super_admin';
            $companyId = $currentUser['company_id'] ?? null;

            if (!$isSuperAdmin && $companyId) {
                $stmt = $this->pdo->prepare("SELECT company_id FROM users WHERE id LIKE ?");
                $stmt->execute([$userId]);
                $targetUserCompany = $stmt->fetchColumn();

                if ($targetUserCompany !== $companyId) {
                    Response::error('Unauthorized: User belongs to another company', 403);
                    return;
                }
            }

            $stmt = $this->pdo->prepare("
                SELECT *
                FROM contracts 
                WHERE freelancer_id LIKE ? AND status IN ('active', 'terminated', 'expiring') 
                ORDER BY created_at DESC 
                LIMIT 1
            ");
            $stmt->execute([$userId]);
            $contract = $stmt->fetch(PDO::FETCH_ASSOC);

            $salary = 0.0;
            $frequency = 'monthly';
            $currency = 'USD';
            $currencyId = null;

            if ($contract) {
                $salary = (float)($contract['rate'] ?? 0);
                $frequency = (string)($contract['payment_frequency'] ?? 'monthly');
                $currencyId = $contract['currency_id'] ?? null;
            } else {
                $salary = (float)($data['salary_base'] ?? 5000);
            }

            if ($currencyId) {
                try {
                    $curStmt = $this->pdo->prepare("SELECT code FROM currencies WHERE id = :id LIMIT 1");
                    $curStmt->execute([':id' => (int)$currencyId]);
                    $currency = (string)($curStmt->fetchColumn() ?: $currency);
                } catch (\Throwable $e) {
                }
            }

            $dailyRate = 0.0;
            if ($frequency === 'monthly') {
                $dailyRate = $salary / 30.0;
            } elseif ($frequency === 'biweekly') {
                $dailyRate = $salary / 14.0;
            } elseif ($frequency === 'hourly') {
                $dailyRate = $salary * 8.0;
            } else {
                $dailyRate = $salary / 30.0;
            }

            $dayOfTermination = (int)date('d', strtotime($endDate));
            $daysWorked = max(0, $dayOfTermination);
            $proratedSalary = round($daysWorked * $dailyRate, 2);

            $unusedVacationDays = (float)($data['unused_vacation_days'] ?? 2.5);
            $vacationPayout = round($unusedVacationDays * $dailyRate, 2);

            $severance = (float)($data['severance'] ?? 0);
            $total = $proratedSalary + $vacationPayout + $severance;

            Response::json([
                'user_id' => $userId,
                'termination_date' => $endDate,
                'contract_found' => !!$contract,
                'salary_base' => $salary,
                'items' => [
                    ['description' => "Prorated Salary ({$daysWorked} days worked in " . date('M', strtotime($endDate)) . ")", 'amount' => $proratedSalary, 'type' => 'earning'],
                    ['description' => "Unused Vacation Payout ({$unusedVacationDays} days)", 'amount' => $vacationPayout, 'type' => 'earning'],
                    ['description' => "Severance / Indemnización", 'amount' => $severance, 'type' => 'earning'],
                ],
                'total_settlement' => $total,
                'currency' => $currency
            ]);
        }
    }

    private function calculatePeruBenefitsSettlement(array $data): void
    {
        $startDateRaw = trim((string)($data['start_date'] ?? $data['hire_date'] ?? ''));
        $endDateRaw = trim((string)($data['end_date'] ?? $data['termination_date'] ?? ''));
        $salaryBase = (float)($data['salary_base'] ?? $data['monthly_salary'] ?? 0);
        $currencyCode = strtoupper(trim((string)($data['currency_code'] ?? 'PEN'))) ?: 'PEN';

        if ($salaryBase <= 0) {
            Response::error('salary_base inválido', 422);
            return;
        }
        if ($startDateRaw === '' || $endDateRaw === '') {
            Response::error('start_date y end_date son requeridos', 422);
            return;
        }

        try {
            $startDate = new \DateTimeImmutable($startDateRaw);
            $endDate = new \DateTimeImmutable($endDateRaw);
        } catch (\Throwable $e) {
            Response::error('Fechas inválidas', 422);
            return;
        }

        if ($startDate > $endDate) {
            Response::error('start_date no puede ser mayor que end_date', 422);
            return;
        }

        $options = is_array($data['options'] ?? null) ? $data['options'] : [];
        $hasFamilyAllowance = (bool)($options['has_family_allowance'] ?? $data['has_family_allowance'] ?? false);
        $familyAllowanceOverride = $options['family_allowance_amount'] ?? $data['family_allowance_amount'] ?? null;
        $rmvOverride = $options['rmv'] ?? $data['rmv'] ?? null;
        $laborRegime = strtolower(trim((string)($options['labor_regime'] ?? $data['labor_regime'] ?? 'general'))) ?: 'general';
        if (!in_array($laborRegime, ['general', 'small', 'micro'], true)) {
            $laborRegime = 'general';
        }
        $benefitFactor = $laborRegime === 'general' ? 1.0 : ($laborRegime === 'small' ? 0.5 : 0.0);
        $vacationFactor = $laborRegime === 'general' ? 1.0 : 0.5;
        $vacationDaysPerYear = $laborRegime === 'general' ? 30 : 15;

        $rmv = null;
        if ($rmvOverride !== null && $rmvOverride !== '') {
            $rmv = (float)$rmvOverride;
        } else {
            $rmv = $this->getRmvValueForPeru();
        }

        $familyAllowance = 0.0;
        if ($hasFamilyAllowance) {
            if ($familyAllowanceOverride !== null && $familyAllowanceOverride !== '') {
                $familyAllowance = (float)$familyAllowanceOverride;
            } else {
                $familyAllowance = round(((float)$rmv) * 0.10, 4);
            }
        }

        $pensionRegime = strtoupper(trim((string)($options['pension_regime'] ?? $data['pension_regime'] ?? 'ONP'))) ?: 'ONP';
        $afp = is_array($options['afp'] ?? null) ? $options['afp'] : (is_array($data['afp'] ?? null) ? $data['afp'] : []);
        $afpFund = (float)($afp['fund'] ?? 0.10);
        $afpCommission = (float)($afp['commission'] ?? 0.0147);
        $afpInsurance = (float)($afp['insurance'] ?? 0.0137);
        $onpRate = (float)($options['onp_rate'] ?? $data['onp_rate'] ?? 0.13);

        $baseMonthly = $salaryBase + $familyAllowance;
        $gratAvgSixth = $baseMonthly / 6.0;
        $gratBonusNinePct = $gratAvgSixth * 0.09;
        $remuneracionComputable = $baseMonthly + $gratAvgSixth;

        [$ctsPeriodStart, $ctsPeriodEnd] = $this->getCtsSemesterPeriod($endDate);
        $ctsCalcFrom = ($startDate > $ctsPeriodStart) ? $startDate : $ctsPeriodStart;
        [$ctsMonths, $ctsDays] = $this->diffMonthsDays360($ctsCalcFrom, $endDate->modify('+1 day'));
        $ctsAmountMonths = ($remuneracionComputable / 12.0) * $ctsMonths;
        $ctsAmountDays = ($remuneracionComputable / 12.0 / 30.0) * $ctsDays;
        $ctsTotalRaw = $ctsAmountMonths + $ctsAmountDays;
        $ctsTotal = $ctsTotalRaw * $benefitFactor;

        $vacAccrualStart = $this->getLastAnniversary($startDate, $endDate);
        [$vacMonths, $vacDays] = $this->diffMonthsDays360($vacAccrualStart, $endDate->modify('+1 day'));
        $vacAmountMonths = ($baseMonthly / 12.0) * $vacMonths;
        $vacAmountDays = ($baseMonthly / 12.0 / 30.0) * $vacDays;
        $vacGrossRaw = $vacAmountMonths + $vacAmountDays;
        $vacGross = $vacGrossRaw * $vacationFactor;

        $pensionRate = 0.0;
        $pensionComponents = [];
        if ($pensionRegime === 'AFP') {
            $pensionRate = $afpFund + $afpCommission + $afpInsurance;
            $pensionComponents = [
                ['name' => 'Fondo Pensión', 'rate' => $afpFund],
                ['name' => 'Comisión', 'rate' => $afpCommission],
                ['name' => 'Prima de Seguro', 'rate' => $afpInsurance],
            ];
        } else {
            $pensionRegime = 'ONP';
            $pensionRate = $onpRate;
            $pensionComponents = [
                ['name' => 'ONP', 'rate' => $onpRate],
            ];
        }
        $vacPension = $vacGross * $pensionRate;
        $vacNet = $vacGross - $vacPension;

        [$gratPeriodStart, $gratPeriodEnd] = $this->getGratificationSemesterPeriod($endDate);
        $gratCalcFrom = ($startDate >= $gratPeriodStart && $startDate <= $gratPeriodEnd) ? $startDate : $gratPeriodStart;
        [$gratMonths, $gratDays] = $this->diffMonthsDays360($gratCalcFrom, $endDate->modify('+1 day'));
        $gratAmountMonths = ($baseMonthly / 6.0) * $gratMonths;
        $gratAmountDays = ($baseMonthly / 6.0 / 30.0) * $gratDays;
        $gratTotalRaw = $gratAmountMonths + $gratAmountDays;
        $gratTotal = $gratTotalRaw * $benefitFactor;

        $bonifRate = 0.09;
        $bonifTotal = $gratTotal * $bonifRate;

        $total = $ctsTotal + $vacNet + $gratTotal + $bonifTotal;

        $items = [
            ['code' => 'PE_CTS', 'name' => 'CTS truncas', 'type' => 'earning', 'amount' => $ctsTotal],
            ['code' => 'PE_VAC_TRUNC', 'name' => 'Vacaciones truncas', 'type' => 'earning', 'amount' => $vacGross],
            ['code' => 'PE_PENSION', 'name' => 'Descuento pensión sobre vacaciones', 'type' => 'deduction', 'amount' => $vacPension],
            ['code' => 'PE_GRAT_TRUNC', 'name' => 'Gratificación trunca', 'type' => 'earning', 'amount' => $gratTotal],
            ['code' => 'PE_BONIF_9', 'name' => 'Bonificación extraordinaria 9%', 'type' => 'earning', 'amount' => $bonifTotal],
        ];

        Response::json([
            'country' => 'PE',
            'currency_code' => $currencyCode,
            'start_date' => $startDate->format('Y-m-d'),
            'end_date' => $endDate->format('Y-m-d'),
            'inputs' => [
                'salary_base' => $salaryBase,
                'rmv' => $rmv,
                'family_allowance' => $familyAllowance,
                'labor_regime' => $laborRegime,
                'benefit_factor' => $benefitFactor,
                'vacation_days_per_year' => $vacationDaysPerYear,
                'pension_regime' => $pensionRegime,
                'afp' => [
                    'fund' => $afpFund,
                    'commission' => $afpCommission,
                    'insurance' => $afpInsurance,
                ],
                'onp_rate' => $onpRate,
            ],
            'breakdown' => [
                'remuneracion_computable' => [
                    'base_monthly' => $baseMonthly,
                    'grat_avg_sixth' => $gratAvgSixth,
                    'grat_bonus_9' => $gratBonusNinePct,
                    'total' => $remuneracionComputable,
                ],
                'cts' => [
                    'period_start' => $ctsPeriodStart->format('Y-m-d'),
                    'period_end' => $ctsPeriodEnd->format('Y-m-d'),
                    'calc_from' => $ctsCalcFrom->format('Y-m-d'),
                    'months' => $ctsMonths,
                    'days' => $ctsDays,
                    'amount_months' => $ctsAmountMonths,
                    'amount_days' => $ctsAmountDays,
                    'total_raw' => $ctsTotalRaw,
                    'factor' => $benefitFactor,
                    'total' => $ctsTotal,
                ],
                'vacaciones_truncas' => [
                    'accrual_start' => $vacAccrualStart->format('Y-m-d'),
                    'months' => $vacMonths,
                    'days' => $vacDays,
                    'base_monthly' => $baseMonthly,
                    'amount_months' => $vacAmountMonths,
                    'amount_days' => $vacAmountDays,
                    'gross_raw' => $vacGrossRaw,
                    'vacation_days_per_year' => $vacationDaysPerYear,
                    'factor' => $vacationFactor,
                    'gross' => $vacGross,
                    'pension' => [
                        'regime' => $pensionRegime,
                        'rate' => $pensionRate,
                        'components' => $pensionComponents,
                        'amount' => $vacPension,
                    ],
                    'net' => $vacNet,
                ],
                'gratificacion_trunca' => [
                    'period_start' => $gratPeriodStart->format('Y-m-d'),
                    'period_end' => $gratPeriodEnd->format('Y-m-d'),
                    'calc_from' => $gratCalcFrom->format('Y-m-d'),
                    'months' => $gratMonths,
                    'days' => $gratDays,
                    'base_monthly' => $baseMonthly,
                    'amount_months' => $gratAmountMonths,
                    'amount_days' => $gratAmountDays,
                    'total_raw' => $gratTotalRaw,
                    'factor' => $benefitFactor,
                    'total' => $gratTotal,
                ],
                'bonificacion_especial' => [
                    'rate' => $bonifRate,
                    'amount' => $bonifTotal,
                ],
                'total' => $total,
            ],
            'items' => $items,
            'total_settlement' => $total,
        ]);
    }

    private function getRmvValueForPeru(): float
    {
        $params = $this->getFiscalParams('PE');
        foreach ($params as $p) {
            if (strtoupper((string)($p['code'] ?? '')) === 'PE_RMV') {
                return (float)($p['percentage'] ?? ($p['value'] ?? 0));
            }
        }
        return 0.0;
    }

    private function getCtsSemesterPeriod(\DateTimeImmutable $endDate): array
    {
        $y = (int)$endDate->format('Y');
        $m = (int)$endDate->format('n');

        if ($m > 10) {
            $periodEnd = new \DateTimeImmutable(($y + 1) . '-04-30');
        } elseif ($m > 4) {
            $periodEnd = new \DateTimeImmutable($y . '-10-31');
        } else {
            $periodEnd = new \DateTimeImmutable($y . '-04-30');
        }

        $periodStart = $periodEnd->modify('-5 months')->modify('first day of this month');
        return [$periodStart, $periodEnd];
    }

    private function getGratificationSemesterPeriod(\DateTimeImmutable $endDate): array
    {
        $y = (int)$endDate->format('Y');
        $jun30 = new \DateTimeImmutable($y . '-06-30');
        $periodEnd = ($endDate > $jun30) ? new \DateTimeImmutable($y . '-12-31') : $jun30;
        $periodStart = $periodEnd->modify('-5 months')->modify('first day of this month');
        return [$periodStart, $periodEnd];
    }

    private function getLastAnniversary(\DateTimeImmutable $startDate, \DateTimeImmutable $endDate): \DateTimeImmutable
    {
        $endYear = (int)$endDate->format('Y');
        $m = (int)$startDate->format('n');
        $d = (int)$startDate->format('j');

        $anniv = new \DateTimeImmutable(sprintf('%04d-%02d-%02d', $endYear, $m, $d));
        if ($anniv > $endDate) {
            $anniv = $anniv->modify('-1 year');
        }
        return $anniv;
    }

    private function diffMonthsDays360(\DateTimeImmutable $start, \DateTimeImmutable $endExclusive): array
    {
        $totalDays = $this->dias360Us($start, $endExclusive);
        $months = intdiv($totalDays, 30);
        $days = $totalDays % 30;
        return [$months, $days];
    }

    private function dias360Us(\DateTimeImmutable $start, \DateTimeImmutable $end): int
    {
        $y1 = (int)$start->format('Y');
        $m1 = (int)$start->format('n');
        $d1 = (int)$start->format('j');
        $y2 = (int)$end->format('Y');
        $m2 = (int)$end->format('n');
        $d2 = (int)$end->format('j');

        if ($m1 === 2 && $this->isLastDayOfMonth($start)) $d1 = 30;
        if ($d1 === 31) $d1 = 30;

        if ($m2 === 2 && $this->isLastDayOfMonth($end) && ($d1 === 30 || $d1 === 31)) $d2 = 30;
        if ($d2 === 31 && ($d1 === 30 || $d1 === 31)) $d2 = 30;

        return 360 * ($y2 - $y1) + 30 * ($m2 - $m1) + ($d2 - $d1);
    }

    private function isLastDayOfMonth(\DateTimeImmutable $date): bool
    {
        return $date->format('j') === $date->modify('last day of this month')->format('j');
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
}
