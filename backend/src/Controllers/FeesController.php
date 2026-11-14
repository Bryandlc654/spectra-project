<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use App\Support\AuditLogger;
use App\Support\FeeRuleResolver;
use PDO;
use Exception;

/**
 * Facturación mensual de Spectra a las empresas.
 *
 * Por cada empresa activa se genera UNA factura mensual (borrador) con:
 *   1. platform_fee        -> cuota fija mensual (siempre, tenga o no contratos)
 *   2. Uso de la plataforma:
 *        - si la empresa tiene reglas contract_fee: una línea por contrato activo,
 *          resuelta por puesto, área y rango de colaboradores (FeeRuleResolver)
 *        - si no: per_freelancer_fee x freelancers con contrato activo en el mes
 *
 * Se ejecuta automáticamente con scripts/billing_cron.php (cron del servidor)
 * o manualmente vía POST /api/fees/generate-monthly-platform-fees (solo Spectra).
 * Es idempotente: si la factura del mes ya existe (no anulada) no se duplica.
 */
class FeesController
{
    private const MANAGER_ROLES = ['super_admin', 'admin', 'finance'];

    private PDO $pdo;
    private AuditLogger $audit;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->audit = new AuditLogger();
        FeeRuleResolver::ensureSchema($this->pdo);
    }

    public function handle(array $segments, string $method): void
    {
        // /api/fees/generate-monthly-platform-fees
        $action = $segments[2] ?? null;

        try {
            if ($action === 'generate-monthly-platform-fees' && $method === 'POST') {
                $user = Auth::user();
                if (!in_array($user['platform_role'] ?? '', self::MANAGER_ROLES, true)) {
                    Response::error('Solo Spectra puede generar la facturación mensual', 403);
                    return;
                }
                $payload = json_decode(file_get_contents('php://input'), true) ?? [];
                $month = (string)($payload['month'] ?? date('Y-m'));
                if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) {
                    Response::error('Mes inválido (formato AAAA-MM)', 422);
                    return;
                }
                $result = $this->runMonthlyBilling($month, !empty($payload['dry_run']), $payload['company_id'] ?? null);
                Response::json($result);
                return;
            }

            Response::error('Recurso no encontrado o método no permitido', 404);
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    /**
     * Calcula (y si no es simulación, crea) las facturas mensuales.
     */
    public function runMonthlyBilling(string $targetMonth, bool $dryRun = false, ?string $onlyCompanyId = null): array
    {
        $periodStart = $targetMonth . '-01';
        $periodEnd = date('Y-m-t', strtotime($periodStart));

        $sql = "SELECT id, legal_name, default_currency_id FROM companies WHERE status = 'active' AND deleted_at IS NULL";
        $params = [];
        if ($onlyCompanyId) {
            $sql .= " AND id = :cid";
            $params[':cid'] = $onlyCompanyId;
        }
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $companies = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $generated = 0;
        $invoices = [];
        $skipped = [];
        $errors = [];

        foreach ($companies as $company) {
            $cid = (string)$company['id'];
            try {
                if ($this->monthlyInvoiceExists($cid, $targetMonth)) {
                    $skipped[] = ['company_id' => $cid, 'reason' => 'Ya existe la factura del mes'];
                    continue;
                }

                $calc = $this->calculateCompanyCharges($company, $periodStart, $periodEnd, $targetMonth);
                if ($calc['error']) {
                    $errors[] = "Empresa {$cid}: " . $calc['error'];
                    continue;
                }
                if (empty($calc['items']) || $calc['total'] <= 0) {
                    $skipped[] = ['company_id' => $cid, 'reason' => 'Sin cargos para el mes'];
                    continue;
                }

                $invoiceId = null;
                if (!$dryRun) {
                    $invoiceId = $this->createUnifiedInvoice($company, $calc['items'], $calc['total'], $calc['currency_id'], $targetMonth);
                    $generated++;
                }
                $invoices[] = [
                    'company_id' => $cid,
                    'company_name' => $company['legal_name'],
                    'invoice_id' => $invoiceId,
                    'currency_id' => $calc['currency_id'],
                    'collaborators' => $calc['collaborators'],
                    'total' => round($calc['total'], 2),
                    'items' => $calc['items'],
                ];
            } catch (\Throwable $e) {
                $errors[] = "Empresa {$cid}: " . $e->getMessage();
            }
        }

        return [
            'message' => $dryRun
                ? 'Simulación completada. Facturas que se generarían: ' . count($invoices)
                : "Proceso completado. Invoices generados: $generated",
            'month' => $targetMonth,
            'dry_run' => $dryRun,
            'generated' => $generated,
            'invoices' => $invoices,
            'skipped' => $skipped,
            'errors' => $errors,
        ];
    }

    /**
     * Marca como vencidas las facturas cuya fecha de vencimiento ya pasó
     * (mismo criterio que el listado de facturas de la empresa).
     */
    public function markOverdueInvoices(): int
    {
        $stmt = $this->pdo->prepare("
            UPDATE invoices
            SET status = 'overdue'
            WHERE status IN ('draft', 'sent', 'issued')
              AND due_date < CURRENT_DATE
        ");
        $stmt->execute();
        return $stmt->rowCount();
    }

    private function monthlyInvoiceExists(string $companyId, string $month): bool
    {
        $stmt = $this->pdo->prepare("
            SELECT 1 FROM invoices
            WHERE company_id = :cid
              AND (notes LIKE :descr OR invoice_number = :num)
              AND status != 'voided'
            LIMIT 1
        ");
        $stmt->execute([
            ':cid' => $companyId,
            ':descr' => '%Monthly Invoice ' . $month . '%',
            ':num' => $this->invoiceNumber($companyId, $month),
        ]);
        return (bool)$stmt->fetchColumn();
    }

    private function calculateCompanyCharges(array $company, string $periodStart, string $periodEnd, string $month): array
    {
        $cid = (string)$company['id'];
        $defaultCurrency = (int)($company['default_currency_id'] ?? 0) ?: 1;
        $items = [];
        $currencies = [];

        $ruleOf = function (string $type) use ($cid): ?array {
            $stmt = $this->pdo->prepare("
                SELECT * FROM company_fee_rules
                WHERE company_id = :cid AND type = :type AND active = 1 AND deleted_at IS NULL
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1
            ");
            $stmt->execute([':cid' => $cid, ':type' => $type]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            return $row ?: null;
        };
        $currencyOf = fn(array $rule): int => !empty($rule['currency_id']) ? (int)$rule['currency_id'] : $defaultCurrency;

        // 1. Cuota fija mensual
        $platformRule = $ruleOf('platform_fee');
        if ($platformRule && (float)$platformRule['value'] > 0) {
            $items[] = ['concept' => "Cuota mensual de plataforma - $month", 'price' => (float)$platformRule['value'], 'type' => 'platform_fee'];
            $currencies[$currencyOf($platformRule)] = true;
        }

        // 2. Contratos activos que se solapan con el periodo
        $stmtContracts = $this->pdo->prepare("
            SELECT c.id, c.title, c.freelancer_id, u.full_name AS freelancer_name,
                   COALESCE(NULLIF(TRIM(c.area), ''), fp.area) AS area
            FROM contracts c
            LEFT JOIN users u ON u.id = c.freelancer_id
            LEFT JOIN freelancer_profiles fp ON fp.user_id = c.freelancer_id
            WHERE c.company_id = :cid
              AND c.status = 'active'
              AND (c.start_date IS NULL OR c.start_date <= :pend)
              AND (c.end_date IS NULL OR c.end_date >= :pstart)
            ORDER BY c.created_at ASC
        ");
        $stmtContracts->execute([':cid' => $cid, ':pstart' => $periodStart, ':pend' => $periodEnd]);
        $contracts = $stmtContracts->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $collaborators = count(array_unique(array_filter(array_column($contracts, 'freelancer_id'))));

        if ($contracts) {
            if (FeeRuleResolver::hasContractFeeRules($this->pdo, $cid)) {
                // 2a. Tarifa por contrato (puesto / área / rango de colaboradores)
                foreach ($contracts as $contract) {
                    $rule = FeeRuleResolver::resolveContractFee(
                        $this->pdo,
                        $cid,
                        (string)($contract['title'] ?? ''),
                        $collaborators,
                        isset($contract['area']) ? (string)$contract['area'] : null
                    );
                    if (!$rule || (float)$rule['value'] <= 0) continue;

                    $title = trim((string)($contract['title'] ?? 'Contrato'));
                    $concept = 'Tarifa contrato: ' . $title;
                    $freelancer = trim((string)($contract['freelancer_name'] ?? ''));
                    if ($freelancer !== '') $concept .= ' - ' . $freelancer;
                    if (!empty($contract['area'])) $concept .= ' (' . $contract['area'] . ')';

                    $items[] = [
                        'concept' => $concept,
                        'price' => (float)$rule['value'],
                        'type' => 'contract_fee',
                        'contract_id' => $contract['id'],
                        'rule_id' => $rule['id'],
                    ];
                    $currencies[$currencyOf($rule)] = true;
                }
            } else {
                // 2b. Tarifa por freelancer activo
                $perRule = $ruleOf('per_freelancer_fee');
                if ($perRule && (float)$perRule['value'] > 0 && $collaborators > 0) {
                    $unit = (float)$perRule['value'];
                    $items[] = [
                        'concept' => "Tarifa por freelancer activo ($collaborators x " . number_format($unit, 2) . ") - $month",
                        'price' => $unit * $collaborators,
                        'type' => 'per_freelancer_fee',
                    ];
                    $currencies[$currencyOf($perRule)] = true;
                }
            }
        }

        $error = null;
        if (count($currencies) > 1) {
            $error = 'las reglas de tarifa usan monedas distintas. Unifica la moneda de las reglas.';
        }

        return [
            'items' => $items,
            'total' => (float)array_sum(array_column($items, 'price')),
            'currency_id' => $currencies ? (int)array_key_first($currencies) : $defaultCurrency,
            'collaborators' => $collaborators,
            'error' => $error,
        ];
    }

    private function invoiceNumber(string $companyId, string $month): string
    {
        return 'INV-' . str_replace('-', '', $month) . '-' . strtoupper(substr($companyId, 0, 8));
    }

    private function createUnifiedInvoice(array $company, array $items, float $totalAmount, int $currencyId, string $month): string
    {
        $invoiceId = $this->generateUuid();
        $now = date('Y-m-d H:i:s');
        $dueDate = date('Y-m-d', strtotime('+7 days'));

        $invoiceNumber = $this->invoiceNumber((string)$company['id'], $month);
        $periodStart = date('Y-m-01', strtotime($month . '-01'));
        $periodEnd = date('Y-m-t', strtotime($month . '-01'));

        $ownTx = !$this->pdo->inTransaction();
        if ($ownTx) $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare("INSERT INTO invoices (
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
            )");
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
                ':updated' => $now,
            ]);

            $stmtLine = $this->pdo->prepare("INSERT INTO invoice_lines (
                id, invoice_id, concept, quantity, unit_price, tax_rate, line_total, created_at
            ) VALUES (
                :id, :invId, :concept, 1.00, :price, 0.0000, :total, :created
            )");
            foreach ($items as $item) {
                $stmtLine->execute([
                    ':id' => $this->generateUuid(),
                    ':invId' => $invoiceId,
                    ':concept' => mb_substr((string)$item['concept'], 0, 200),
                    ':price' => $item['price'],
                    ':total' => $item['price'],
                    ':created' => $now,
                ]);
            }
            if ($ownTx) $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($ownTx && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $e;
        }

        try {
            $this->audit->log('invoice.generated_monthly', 'invoice', $invoiceId, [
                'company_id' => $company['id'],
                'month' => $month,
                'total' => $totalAmount,
                'items_count' => count($items),
            ], (string)$company['id']);
        } catch (\Throwable $e) { }

        return $invoiceId;
    }

    private function generateUuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
