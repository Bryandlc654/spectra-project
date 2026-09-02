<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\AuditLogger;
use PDO;
use Exception;

class FeesController
{
    private PDO $pdo;
    private AuditLogger $audit;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->audit = new AuditLogger($this->pdo);
        $this->ensureInvoicesTable(); // Ensure invoices table supports what we need
    }

    private function ensureInvoicesTable(): void
    {
        // Add specific indexes or columns if needed for fees
        // Invoices table is likely managed by TenantController or InvoiceController
        // We will assume it exists, but we might need a 'type' column if not present to distinguish 'fee' invoices
        // Let's check if 'type' column exists or if we should use 'category' or just description.
        // For now, we assume standard invoices table structure.
    }

    public function handle(array $segments, string $method): void
    {
        // /api/fees/generate-monthly-platform-fees
        
        $action = $segments[2] ?? null;

        try {
            if ($action === 'generate-monthly-platform-fees' && $method === 'POST') {
                $this->generateMonthlyPlatformFees();
                return;
            }

            Response::error('Recurso no encontrado o método no permitido', 404);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    private function generateMonthlyPlatformFees(): void
    {
        $payload = json_decode(file_get_contents('php://input'), true) ?? [];
        $targetMonth = $payload['month'] ?? date('Y-m'); // Format YYYY-MM
        $periodStart = $targetMonth . '-01 00:00:00';
        $periodEnd = date('Y-m-t 23:59:59', strtotime($periodStart));

        // 1. Get all active companies
        $stmt = $this->pdo->query("SELECT id, legal_name, default_currency_id FROM companies WHERE status = 'active' AND deleted_at IS NULL");
        $companies = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $generatedCount = 0;
        $errors = [];

        foreach ($companies as $company) {
            try {
                $currencyId = (int)($company['default_currency_id'] ?? 1);

                // 2. Determine per-freelancer unit price
                // Prefer explicit 'per_freelancer_fee'; fallback to 'platform_fee' for compatibility
                $rule = null;
                $stmtRule = $this->pdo->prepare("
                    SELECT * FROM company_fee_rules 
                    WHERE company_id = :cid 
                      AND type IN ('per_freelancer_fee','platform_fee')
                      AND active = 1
                    ORDER BY FIELD(type, 'per_freelancer_fee','platform_fee')
                    LIMIT 1
                ");
                $stmtRule->execute([':cid' => $company['id']]);
                $rule = $stmtRule->fetch(PDO::FETCH_ASSOC);

                $unitPrice = $rule ? (float)$rule['value'] : 0.0;
                if ($rule && !empty($rule['currency_id'])) {
                    $currencyId = (int)$rule['currency_id'];
                }

                // Optional default if no rule configured
                if ($unitPrice <= 0) {
                    // If no configured price, skip billing for this tenant (explicit policy)
                    continue;
                }

                // 3. Count active freelancers (distinct) with contracts overlapping the month
                // Status filter: active contracts only
                // Overlap condition: start_date <= periodEnd AND (end_date IS NULL OR end_date >= periodStart)
                try {
                    $stmtCount = $this->pdo->prepare("
                        SELECT COUNT(DISTINCT c.freelancer_id) AS cnt
                        FROM contracts c
                        WHERE c.company_id = :cid
                          AND c.status = 'active'
                          AND (c.start_date IS NULL OR c.start_date <= :pend)
                          AND (c.end_date IS NULL OR c.end_date >= :pstart)
                    ");
                    $stmtCount->execute([
                        ':cid' => $company['id'],
                        ':pstart' => $periodStart,
                        ':pend' => $periodEnd
                    ]);
                    $activeFreelancers = (int)$stmtCount->fetchColumn();
                } catch (\Throwable $e) {
                    $activeFreelancers = 0;
                }

                if ($activeFreelancers <= 0) {
                    continue; // Nothing to bill this month
                }

                $totalAmount = $unitPrice * $activeFreelancers;
                $items = [[
                    'concept' => "Platform per-freelancer fee ($activeFreelancers) - $targetMonth",
                    'price' => $totalAmount
                ]];

                // 3. Check if invoice already exists for this month
                $description = "Monthly Invoice " . $targetMonth;
                
                $stmtCheck = $this->pdo->prepare("
                    SELECT id FROM invoices 
                    WHERE company_id = :cid 
                    AND notes LIKE :desc
                    AND status != 'voided'
                    LIMIT 1
                ");
                $stmtCheck->execute([
                    ':cid' => $company['id'], 
                    ':desc' => "%$description%"
                ]);
                
                if ($stmtCheck->fetch()) continue; // Already generated

                // 4. Generate Invoice
                $this->createUnifiedInvoice($company, $items, $totalAmount, $currencyId, $targetMonth);
                $generatedCount++;

            } catch (Exception $e) {
                $errors[] = "Company {$company['id']}: " . $e->getMessage();
            }
        }

        Response::json([
            'message' => "Proceso completado. Invoices generados: $generatedCount",
            'month' => $targetMonth,
            'errors' => $errors
        ]);
    }

    private function createUnifiedInvoice(array $company, array $items, float $totalAmount, int $currencyId, string $month): void
    {
        $invoiceId = $this->generateUuid();
        $now = date('Y-m-d H:i:s');
        $dueDate = date('Y-m-d', strtotime('+7 days'));
        
        $invoiceNumber = 'INV-' . str_replace('-', '', $month) . '-' . strtoupper(substr($company['id'], 0, 4));
        $periodStart = date('Y-m-01', strtotime($month . '-01'));
        $periodEnd = date('Y-m-t', strtotime($month . '-01'));

        // Insert Invoice
        $sql = "INSERT INTO invoices (
            id, company_id, freelancer_id, invoice_number, 
            issue_date, due_date, currency_id, 
            subtotal, tax_total, total, 
            tax_amount, total_amount,
            period_start, period_end,
            status, notes, created_at, updated_at
        ) VALUES (
            :id, :cid, NULL, :num, 
            :issue, :due, :cur, 
            :sub, 0.00, :total1, 
            0.00, :total2,
            :pstart, :pend,
            'draft', :notes, :created, :updated
        )";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':id' => $invoiceId,
            ':cid' => $company['id'],
            ':num' => $invoiceNumber,
            ':issue' => date('Y-m-d'),
            ':due' => $dueDate,
            ':cur' => $currencyId,
            ':sub' => $totalAmount,
            ':total1' => $totalAmount,
            ':total2' => $totalAmount,
            ':pstart' => $periodStart,
            ':pend' => $periodEnd,
            ':notes' => "Monthly Invoice $month",
            ':created' => $now,
            ':updated' => $now
        ]);

        // Insert Lines
        $sqlLine = "INSERT INTO invoice_lines (
            id, invoice_id, concept, quantity, unit_price, tax_rate, line_total, created_at
        ) VALUES (
            :id, :invId, :concept, 1.00, :price, 0.0000, :total, :created
        )";
        $stmtLine = $this->pdo->prepare($sqlLine);

        foreach ($items as $item) {
            $stmtLine->execute([
                ':id' => $this->generateUuid(),
                ':invId' => $invoiceId,
                ':concept' => $item['concept'],
                ':price' => $item['price'],
                ':total' => $item['price'],
                ':created' => $now
            ]);
        }

        $this->audit->log('invoice.generated_monthly', 'invoice', $invoiceId, [
            'company_id' => $company['id'],
            'month' => $month,
            'total' => $totalAmount,
            'items_count' => count($items)
        ]);
    }

    private function generateUuid(): string
    {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
}
