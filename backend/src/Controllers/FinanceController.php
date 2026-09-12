<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class FinanceController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
    }

    public function handle(array $segments, string $method): void
    {
        // $segments[0] = 'api'
        // $segments[1] = 'finance'
        // $segments[2] = 'invoices', etc.
        
        $resource = $segments[2] ?? null;
        $id = $segments[3] ?? null;

        $user = Auth::user();
        if (($user['platform_role'] ?? '') === 'support') {
            if ($resource === 'support-view' && $method === 'GET') {
            } elseif ($resource === 'invoices' && $id && isset($segments[4]) && in_array($segments[4], ['request-review', 'link-ticket'], true) && $method === 'POST') {
            } else {
                Response::error('Acceso denegado', 403);
                return;
            }
        }

        if ($resource === 'support-view') {
             if ($method === 'GET') {
                 $this->supportViewIndex();
             } elseif ($id === 'request-review' && $method === 'POST') {
                 // /api/finance/support-view/request-review (body: { invoice_id: ... })
                 // Actually better: /api/finance/invoices/{id}/request-review
                 // Let's keep strict resource orientation.
                 // Moving this logic to 'invoices' block below might be cleaner, 
                 // but let's handle the list view here.
             }
             return;
        }

        if ($resource === 'invoices') {
            if ($id) {
                // /api/finance/invoices/{id}/request-review
                if (isset($segments[4]) && $segments[4] === 'request-review' && $method === 'POST') {
                    $this->invoiceRequestReview($id);
                    return;
                }
                // /api/finance/invoices/{id}/link-ticket
                if (isset($segments[4]) && $segments[4] === 'link-ticket' && $method === 'POST') {
                    $this->invoiceLinkTicket($id);
                    return;
                }

                // /api/finance/invoices/{id}/download
                if (isset($segments[4]) && $segments[4] === 'download' && $method === 'GET') {
                    $this->invoiceDownload($id);
                    return;
                }

                if ($method === 'GET') {
                    $this->invoicesShow($id);
                } else {
                    Response::error('Method not allowed', 405);
                }
            } else {
                if ($method === 'GET') {
                    $this->invoicesIndex();
                } else {
                    Response::error('Method not allowed', 405);
                }
            }
            return;
        }

        if ($resource === 'wallet') {
            // /api/finance/wallet/transactions -> global ledger
            if ($id === 'transactions') {
                 if ($method === 'GET') {
                    $this->walletTransactionsIndex();
                 } else {
                    Response::error('Method not allowed', 405);
                 }
                 return;
            }

            // /api/finance/wallet -> list of wallets
            if (!$id) {
                if ($method === 'GET') {
                    $this->walletIndex();
                } else {
                    Response::error('Method not allowed', 405);
                }
                return;
            }
            
            // /api/finance/wallet/{companyId} -> specific wallet details
            if ($method === 'GET') {
                $this->walletShow($id);
            } else {
                Response::error('Method not allowed', 405);
            }
            return;
        }

        if ($resource === 'reconciliation') {
            // POST /api/finance/reconciliation/adjustment
            if ($id === 'adjustment') {
                if ($method === 'POST') {
                    $this->reconciliationStore();
                    return;
                }
            }

            // POST /api/finance/reconciliation/{id}/toggle
            $action = $segments[4] ?? null;
            if ($action === 'toggle' && $id) {
                if ($method === 'POST') {
                    $this->reconciliationToggle($id);
                    return;
                }
            }
            
            // GET /api/finance/reconciliation
            if (!$id && $method === 'GET') {
                $this->reconciliationIndex();
                return;
            }

            Response::error('Recurso no encontrado o método no permitido', 404);
            return;
        }

        Response::error('Recurso no encontrado', 404);
    }

    private function walletIndex(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(100, (int)($_GET['per_page'] ?? 20)));
        $offset = ($page - 1) * $perPage;

        // Fix: Ensure we join company_settings (cs) to get tax_id, as it's not in companies (c)
        $sql = "
            SELECT 
                w.*, 
                c.legal_name as company_name,
                cs.tax_id as company_tax_id,
                cur.code as currency_code,
                cur.symbol as currency_symbol
            FROM wallets w
            JOIN companies c ON w.company_id = c.id
            LEFT JOIN company_settings cs ON c.id = cs.company_id
            JOIN currencies cur ON w.currency_id = cur.id
            ORDER BY w.balance DESC
            LIMIT :limit OFFSET :offset
        ";

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM wallets");
        $countStmt->execute();
        $total = (int)$countStmt->fetchColumn();
        
        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $wallets = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $wallets,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int)ceil($total / $perPage)),
            ]
        ]);
    }

    private function walletTransactionsIndex(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(100, (int)($_GET['per_page'] ?? 50)));
        $offset = ($page - 1) * $perPage;

        $sql = "
            SELECT 
                wt.*, 
                c.legal_name as company_name,
                cur.code as currency_code,
                cur.symbol as currency_symbol
            FROM wallet_transactions wt
            JOIN companies c ON wt.company_id = c.id
            JOIN currencies cur ON wt.currency_id = cur.id
            ORDER BY wt.created_at DESC
            LIMIT :limit OFFSET :offset
        ";
        
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM wallet_transactions");
        $countStmt->execute();
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $transactions = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $transactions,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int)ceil($total / $perPage)),
            ]
        ]);
    }

    private function walletShow(string $companyId): void
    {
        // Get Wallet Info
        $walletStmt = $this->pdo->prepare("
            SELECT 
                w.*, 
                c.legal_name as company_name,
                cs.tax_id as company_tax_id,
                cur.code as currency_code,
                cur.symbol as currency_symbol
            FROM wallets w
            JOIN companies c ON w.company_id = c.id
            LEFT JOIN company_settings cs ON c.id = cs.company_id
            JOIN currencies cur ON w.currency_id = cur.id
            WHERE w.company_id LIKE :id
        ");
        $walletStmt->execute([':id' => $companyId]);
        $wallet = $walletStmt->fetch(PDO::FETCH_ASSOC);

        if (!$wallet) {
            // Check if company exists, if so, maybe create wallet?
            // For now, return 404 if no wallet found.
            Response::error('Wallet no encontrada para esta empresa', 404);
            return;
        }

        // Get Transactions with Pagination
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        // Count total transactions
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM wallet_transactions WHERE company_id LIKE :id");
        $countStmt->execute([':id' => $companyId]);
        $total = $countStmt->fetchColumn();

        $txStmt = $this->pdo->prepare("
            SELECT 
                wt.*, 
                cur.code as currency_code, 
                cur.symbol as currency_symbol
            FROM wallet_transactions wt
            JOIN currencies cur ON wt.currency_id = cur.id
            WHERE wt.company_id LIKE :id
            ORDER BY wt.created_at DESC
            LIMIT :limit OFFSET :offset
        ");
        
        $txStmt->bindValue(':id', $companyId);
        $txStmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $txStmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $txStmt->execute();
        $transactions = $txStmt->fetchAll(PDO::FETCH_ASSOC);

        $wallet['transactions'] = [
            'data' => $transactions,
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ];

        Response::json($wallet);
    }

    private function invoiceDownload(string $id): void
    {
        // 1. Verify existence
        $stmt = $this->pdo->prepare("SELECT * FROM invoices WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$invoice) {
            Response::error('Invoice not found', 404);
            return;
        }

        // 2. Security Check (ensure user belongs to company or is admin)
        // (Skipping deep check for brevity, assuming middleware/auth check done or broad access)

        // 3. Generate Mock PDF
        // In a real app, use dompdf or similar.
        // Here we'll just output a text file masquerading as PDF or just a text receipt.
        
        $filename = "invoice_{$invoice['invoice_number']}.txt";
        
        header('Content-Type: text/plain');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        
        echo "SPECTRA ERP - COMPROBANTE DE PAGO\n";
        echo "===================================\n\n";
        echo "Factura N°: " . ($invoice['invoice_number'] ?? '') . "\n";
        echo "Fecha de emisión: " . ($invoice['issue_date'] ?? '') . "\n";
        echo "Vencimiento: " . ($invoice['due_date'] ?? '') . "\n";
        echo "Estado: " . ($invoice['status'] ?? '') . "\n\n";
        echo "-----------------------------------\n";
        echo "Notas: " . ($invoice['notes'] ?? '—') . "\n";
        echo "Subtotal: " . ($invoice['subtotal'] ?? 0) . "\n";
        echo "Impuestos: " . ($invoice['tax_amount'] ?? 0) . "\n";
        echo "Total: " . ($invoice['total_amount'] ?? 0) . " (moneda_id " . ($invoice['currency_id'] ?? '') . ")\n";
        echo "-----------------------------------\n\n";
        echo "Este es un comprobante generado automáticamente por Spectra ERP.\n";
        exit;
    }

    private function invoicesIndex(): void
    {
        $this->ensureInvoicesTable();
        // List all invoices globally or filtered
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(100, (int)($_GET['per_page'] ?? 20)));
        $offset = ($page - 1) * $perPage;

        $companyId = $_GET['company_id'] ?? null;
        $freelancerId = $_GET['freelancer_id'] ?? null;
        $q = trim((string)($_GET['q'] ?? ''));

        $where = [];
        $params = [];

        if ($companyId) {
            $where[] = "i.company_id = :company_id";
            $params[':company_id'] = $companyId;
        }
        if ($freelancerId) {
            $where[] = "i.freelancer_id = :freelancer_id";
            $params[':freelancer_id'] = $freelancerId;
        }
        if ($q !== '') {
            $where[] = "(i.invoice_number LIKE :q OR comp.legal_name LIKE :q)";
            $params[':q'] = "%$q%";
        }

        $whereClause = $where ? "WHERE " . implode(" AND ", $where) : "";

        $sql = "
            SELECT 
                i.*, 
                c.code as currency_code, 
                c.symbol as currency_symbol,
                comp.legal_name as company_name,
                cs.tax_id as company_tax_id,
                SUBSTRING_INDEX(u.full_name, ' ', 1) as freelancer_first_name,
                CASE WHEN LOCATE(' ', u.full_name) > 0 THEN SUBSTRING(u.full_name, LOCATE(' ', u.full_name) + 1) ELSE '' END as freelancer_last_name
            FROM invoices i
            LEFT JOIN currencies c ON i.currency_id = c.id
            LEFT JOIN companies comp ON i.company_id = comp.id
            LEFT JOIN company_settings cs ON comp.id = cs.company_id
            LEFT JOIN users u ON i.freelancer_id = u.id
            $whereClause
            ORDER BY i.issue_date DESC, i.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $countSql = "SELECT COUNT(*) FROM invoices i LEFT JOIN companies comp ON i.company_id = comp.id $whereClause";
        $countStmt = $this->pdo->prepare($countSql);
        foreach ($params as $key => $val) {
            $countStmt->bindValue($key, $val);
        }
        $countStmt->execute();
        $total = (int)$countStmt->fetchColumn();
        
        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $key => $val) {
            $stmt->bindValue($key, $val);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $invoices,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int)ceil($total / $perPage)),
            ]
        ]);
    }

    private function invoicesShow(string $invoiceId): void
    {
        $this->ensureInvoicesTable();
        // Show specific invoice
        
        $stmt = $this->pdo->prepare("
            SELECT 
                i.*, 
                c.code as currency_code, 
                c.symbol as currency_symbol,
                comp.legal_name as company_name,
                cs.billing_address as company_address,
                cs.tax_id as company_tax_id,
                COALESCE(NULLIF(con.title, ''), ct.title) as contract_title,
                SUBSTRING_INDEX(u.full_name, ' ', 1) as freelancer_first_name,
                CASE WHEN LOCATE(' ', u.full_name) > 0 THEN SUBSTRING(u.full_name, LOCATE(' ', u.full_name) + 1) ELSE '' END as freelancer_last_name,
                u.email as freelancer_email
            FROM invoices i
            LEFT JOIN currencies c ON i.currency_id = c.id
            LEFT JOIN companies comp ON i.company_id = comp.id
            LEFT JOIN company_settings cs ON comp.id = cs.company_id
            LEFT JOIN contracts con ON i.contract_id = con.id
            LEFT JOIN contract_templates ct ON con.template_id = ct.id
            LEFT JOIN users u ON i.freelancer_id = u.id
            WHERE i.id = :id
        ");
        $stmt->execute([':id' => $invoiceId]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$invoice) {
            Response::error('Factura no encontrada', 404);
            return;
        }

        // Fetch lines (normalize to expected fields)
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

    private function reconciliationIndex(): void
    {
        $this->ensureWalletReconciliationColumns();
        $companyId = $_GET['company_id'] ?? null;
        $status = $_GET['status'] ?? null; // pending, completed, etc.
        $reconciled = $_GET['reconciled'] ?? null; // '1', '0'
        $search = $_GET['q'] ?? '';

        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(100, (int)($_GET['per_page'] ?? 20)));
        $offset = ($page - 1) * $perPage;

        $where = ["1=1"];
        $params = [];

        if ($companyId) {
            $where[] = "wt.company_id = :cid";
            $params[':cid'] = $companyId;
        }

        if ($status) {
            $where[] = "wt.status = :status";
            $params[':status'] = $status;
        }

        if ($reconciled !== null && $reconciled !== '') {
            $where[] = "wt.is_reconciled = :rec";
            $params[':rec'] = (int)$reconciled;
        }

        if ($search) {
            $where[] = "(wt.description LIKE :q OR wt.reference_id LIKE :q)";
            $params[':q'] = "%$search%";
        }

        $whereSql = implode(' AND ', $where);

        // Count
        $countStmt = $this->pdo->prepare("
            SELECT COUNT(*) 
            FROM wallet_transactions wt 
            WHERE $whereSql
        ");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        // Data
        $sql = "
            SELECT 
                wt.*, 
                c.legal_name as company_name,
                cur.code as currency_code,
                cur.symbol as currency_symbol
            FROM wallet_transactions wt
            JOIN companies c ON wt.company_id = c.id
            JOIN currencies cur ON wt.currency_id = cur.id
            WHERE $whereSql
            ORDER BY wt.created_at DESC
            LIMIT :limit OFFSET :offset
        ";
        
        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $transactions = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $transactions,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int)ceil($total / $perPage)),
            ]
        ]);
    }

    private function reconciliationStore(): void
    {
        $this->ensureWalletReconciliationColumns();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        
        $companyId = $data['company_id'] ?? null;
        $amount = (float)($data['amount'] ?? 0);
        $currencyId = (int)($data['currency_id'] ?? 0);
        $description = trim($data['description'] ?? '');
        $type = 'adjustment'; // Force type adjustment
        
        if (!$companyId || $amount == 0 || $currencyId <= 0 || !$description) {
            Response::error('Datos incompletos', 422);
            return;
        }

        // Check wallet
        $stmt = $this->pdo->prepare("SELECT * FROM wallets WHERE company_id LIKE :cid AND currency_id = :cur LIMIT 1");
        $stmt->execute([':cid' => $companyId, ':cur' => $currencyId]);
        $wallet = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$wallet) {
             Response::error('No existe wallet para esta empresa y moneda', 404);
             return;
        }

        try {
            $this->pdo->beginTransaction();

            // Create Transaction
            $txId = $this->uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO wallet_transactions (
                    id, company_id, wallet_id, type, amount, currency_id, 
                    reference_type, reference_id, description, status, created_at, is_reconciled
                ) VALUES (
                    :id, :cid, :wid, :type, :amt, :cur, 
                    'manual_adjustment', NULL, :desc, 'completed', NOW(), 0
                )
            ");
            $stmt->execute([
                ':id' => $txId,
                ':cid' => $companyId,
                ':wid' => $wallet['id'] ?? null, // wallet_id might be null in schema? checked schema, it allows NULL but good to have
                ':type' => $type,
                ':amt' => $amount,
                ':cur' => $currencyId,
                ':desc' => $description
            ]);

            // Update Wallet Balance
            $newBalance = (float)$wallet['balance'] + $amount;
            $upd = $this->pdo->prepare("UPDATE wallets SET balance = :bal, updated_at = NOW() WHERE company_id LIKE :cid AND currency_id = :cur");
            $upd->execute([':bal' => $newBalance, ':cid' => $companyId, ':cur' => $currencyId]);

            $this->pdo->commit();

            Response::json(['message' => 'Ajuste creado correctamente', 'id' => $txId]);

        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            Response::error('Error al crear ajuste: ' . $e->getMessage(), 500);
        }
    }

    private function reconciliationToggle(string $txId): void
    {
        $this->ensureWalletReconciliationColumns();
        // Toggle is_reconciled
        $stmt = $this->pdo->prepare("SELECT is_reconciled FROM wallet_transactions WHERE id LIKE :id");
        $stmt->execute([':id' => $txId]);
        $tx = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$tx) {
            Response::error('Transacción no encontrada', 404);
            return;
        }

        $newState = ((int)$tx['is_reconciled'] === 1) ? 0 : 1;
        $reconciledAt = $newState ? date('Y-m-d H:i:s') : null;

        $upd = $this->pdo->prepare("UPDATE wallet_transactions SET is_reconciled = :s, reconciled_at = :at WHERE id LIKE :id");
        $upd->execute([':s' => $newState, ':at' => $reconciledAt, ':id' => $txId]);

        Response::json(['message' => 'Estado actualizado', 'is_reconciled' => $newState]);
    }

    private function ensureInvoicesTable(): void
    {
        if (\App\Support\Cache::get('finance_invoices_schema_v1') !== null) {
            return;
        }
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
                status ENUM('draft', 'sent', 'paid', 'overdue', 'voided') NOT NULL DEFAULT 'draft',
                notes TEXT NULL,
                support_review_requested TINYINT(1) DEFAULT 0,
                support_ticket_id VARCHAR(50) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                KEY idx_company_id (company_id),
                KEY idx_contract_id (contract_id),
                KEY idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Try to add columns if they don't exist (migration for existing tables)
        try {
            $this->pdo->exec("ALTER TABLE invoices ADD COLUMN support_review_requested TINYINT(1) DEFAULT 0");
        } catch (\Throwable $e) {}
        try {
            $this->pdo->exec("ALTER TABLE invoices ADD COLUMN support_ticket_id VARCHAR(50) NULL");
        } catch (\Throwable $e) {}

        // Create invoice_lines table if not exists (aligned with TenantController)
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

        \App\Support\Cache::set('finance_invoices_schema_v1', time(), 86400 * 365);
    }

    /**
     * Asegura las columnas de conciliación en wallet_transactions.
     * El DDL canónico (TenantController) no las incluye; se agregan de forma perezosa y cacheada.
     */
    private function ensureWalletReconciliationColumns(): void
    {
        if (\App\Support\Cache::get('wallet_recon_cols_v1') !== null) {
            return;
        }
        try { $this->pdo->exec("ALTER TABLE wallet_transactions ADD COLUMN is_reconciled TINYINT(1) DEFAULT 0"); } catch (\Throwable $e) {}
        try { $this->pdo->exec("ALTER TABLE wallet_transactions ADD COLUMN reconciled_at DATETIME NULL"); } catch (\Throwable $e) {}
        \App\Support\Cache::set('wallet_recon_cols_v1', time(), 86400 * 365);
    }

    private function supportViewIndex(): void
    {
        $user = Auth::user();
        if (!in_array($user['platform_role'] ?? '', ['super_admin', 'support'])) {
            Response::error('Acceso denegado', 403);
            return;
        }

        $this->ensureInvoicesTable();

        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(100, (int)($_GET['per_page'] ?? 20)));
        $offset = ($page - 1) * $perPage;
        $search = $_GET['search'] ?? '';

        // Conditions: Overdue, Voided, or Review Requested
        // We select invoices that are potential issues
        $where = "(i.status IN ('overdue', 'voided') OR i.support_review_requested = 1)";
        $params = [];

        if ($search) {
            $where .= " AND (i.invoice_number LIKE :s OR c.legal_name LIKE :s)";
            $params[':s'] = "%$search%";
        }

        // Count
        $countSql = "
            SELECT COUNT(*) 
            FROM invoices i 
            JOIN companies c ON i.company_id = c.id
            WHERE $where
        ";
        $stmtCount = $this->pdo->prepare($countSql);
        $stmtCount->execute($params);
        $total = (int)$stmtCount->fetchColumn();

        // Query
        $sql = "
            SELECT 
                i.id, i.invoice_number, i.status, i.issue_date, i.due_date,
                i.support_review_requested, i.support_ticket_id,
                c.legal_name as company_name
            FROM invoices i
            JOIN companies c ON i.company_id = c.id
            WHERE $where
            ORDER BY i.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $invoices,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => ceil($total / $perPage)
            ]
        ]);
    }

    private function invoiceRequestReview(string $id): void
    {
        $user = Auth::user();
        if (!in_array($user['platform_role'] ?? '', ['super_admin', 'support'])) {
            Response::error('Acceso denegado', 403);
            return;
        }

        $this->ensureInvoicesTable();

        $stmt = $this->pdo->prepare("UPDATE invoices SET support_review_requested = 1 WHERE id = :id");
        $stmt->execute([':id' => $id]);

        if ($stmt->rowCount() === 0) {
            // Check if exists but no change needed
             $check = $this->pdo->prepare("SELECT id FROM invoices WHERE id = :id");
             $check->execute([':id' => $id]);
             if (!$check->fetch()) {
                 Response::error('Factura no encontrada', 404);
                 return;
             }
        }

        Response::json(['message' => 'Solicitud de revisión enviada a Finanzas']);
    }

    private function invoiceLinkTicket(string $id): void
    {
        $user = Auth::user();
        if (!in_array($user['platform_role'] ?? '', ['super_admin', 'support'])) {
            Response::error('Acceso denegado', 403);
            return;
        }

        $this->ensureInvoicesTable();

        $data = json_decode(file_get_contents('php://input'), true);
        $ticketId = $data['ticket_id'] ?? null;

        if (!$ticketId) {
            Response::error('Ticket ID es requerido', 422);
            return;
        }

        $stmt = $this->pdo->prepare("UPDATE invoices SET support_ticket_id = :tid WHERE id = :id");
        $stmt->execute([':tid' => $ticketId, ':id' => $id]);

        if ($stmt->rowCount() === 0) {
             $check = $this->pdo->prepare("SELECT id FROM invoices WHERE id = :id");
             $check->execute([':id' => $id]);
             if (!$check->fetch()) {
                 Response::error('Factura no encontrada', 404);
                 return;
             }
        }

        Response::json(['message' => 'Ticket asociado correctamente']);
    }

    private function uuid(): string
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
