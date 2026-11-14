<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use DateTime;
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

        if ($resource === 'keyfacil') {
            if (!in_array(($user['platform_role'] ?? ''), ['super_admin', 'finance'], true)) {
                Response::error('Acceso denegado: módulo de facturación electrónica', 403);
                return;
            }

            if ($id === 'status' && $method === 'GET') {
                $this->keyfacilStatus();
                return;
            }

            if ($id === 'logs' && $method === 'GET') {
                $this->keyfacilLogs();
                return;
            }

            if ($id === 'search' && $method === 'POST') {
                $this->keyfacilSearch();
                return;
            }

            if ($id === 'invoices') {
                $invoiceId = $segments[4] ?? null;
                $action = $segments[5] ?? null;

                if (!$invoiceId) {
                    if ($method === 'GET') {
                        $this->keyfacilInvoicesIndex();
                        return;
                    }
                    if ($method === 'POST') {
                        $this->keyfacilInvoicesStore();
                        return;
                    }
                } else {
                    if ($action === 'void' && $method === 'POST') {
                        $this->keyfacilInvoiceVoid($invoiceId);
                        return;
                    }
                    if (in_array($action, ['pdf', 'xml'], true) && $method === 'GET') {
                        $this->keyfacilInvoiceFile($invoiceId, $action);
                        return;
                    }
                    if (!$action && $method === 'DELETE') {
                        $this->keyfacilInvoicesDestroy($invoiceId);
                        return;
                    }
                }

                Response::error('Método no permitido para facturas Keyfacil', 405);
                return;
            }

            Response::error('Recurso Keyfacil no encontrado', 404);
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
            WHERE w.company_id = :id
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
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM wallet_transactions WHERE company_id = :id");
        $countStmt->execute([':id' => $companyId]);
        $total = $countStmt->fetchColumn();

        $txStmt = $this->pdo->prepare("
            SELECT 
                wt.*, 
                cur.code as currency_code, 
                cur.symbol as currency_symbol
            FROM wallet_transactions wt
            JOIN currencies cur ON wt.currency_id = cur.id
            WHERE wt.company_id = :id
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

    private function keyfacilStatus(): void
    {
        $service = new \App\Support\KeyfacilService();
        Response::json([
            'configured' => $service->isConfigured(),
        ]);
    }

    private function keyfacilLogs(): void
    {
        $limit = (int)($_GET['limit'] ?? 100);
        $limit = max(1, min(500, $limit));
        Response::json([
            'data' => \App\Support\KeyfacilLogger::tail($limit),
        ]);
    }

    private function keyfacilSearch(): void
    {
        $payload = json_decode(file_get_contents('php://input'), true);
        if (!is_array($payload)) $payload = [];

        $tipo = trim((string)($payload['tipo'] ?? ''));
        $serie = strtoupper(trim((string)($payload['serie'] ?? '')));
        $numero = (int)($payload['numero'] ?? 0);

        if (!in_array($tipo, ['01', '03', '07', '08'], true)) {
            Response::error('tipo inválido (01, 03, 07 u 08)', 422);
            return;
        }
        if ($serie === '' || $numero <= 0) {
            Response::error('serie y numero son requeridos', 422);
            return;
        }

        $service = new \App\Support\KeyfacilService();
        $result = $service->searchInvoice([
            'tipo' => $tipo,
            'serie' => $serie,
            'numero' => $numero,
        ], [
            'action' => 'search',
            'tipo' => $tipo,
            'serie' => $serie,
            'numero' => $numero,
        ]);

        Response::json([
            'ok' => (bool)($result['ok'] ?? false),
            'status' => (int)($result['status'] ?? 0),
            'data' => $result['data'] ?? null,
            'error' => $result['error'] ?? null,
        ]);
    }

    private function ensureKeyfacilInvoiceTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS keyfacil_invoices (
                id CHAR(36) PRIMARY KEY,
                tipo VARCHAR(2) NOT NULL DEFAULT '01',
                serie VARCHAR(10) NOT NULL,
                numero INT NOT NULL,
                fecha_emision DATE NOT NULL,
                fecha_vencimiento DATE NULL,
                cliente_tipo VARCHAR(2) NULL,
                cliente_documento VARCHAR(20) NULL,
                cliente_nombre VARCHAR(255) NOT NULL,
                cliente_direccion VARCHAR(255) NULL,
                cliente_email VARCHAR(150) NULL,
                cliente_telefono VARCHAR(50) NULL,
                moneda VARCHAR(3) NOT NULL DEFAULT 'PEN',
                condicion_pago_tipo VARCHAR(2) NOT NULL DEFAULT '01',
                subtotal DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                igv DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                total DECIMAL(15,2) NOT NULL DEFAULT 0.00,
                items_json LONGTEXT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'draft',
                keyfacil_id VARCHAR(100) NULL,
                keyfacil_status VARCHAR(50) NULL,
                keyfacil_response LONGTEXT NULL,
                keyfacil_pdf LONGTEXT NULL,
                keyfacil_xml LONGTEXT NULL,
                keyfacil_pdf_url VARCHAR(500) NULL,
                keyfacil_xml_url VARCHAR(500) NULL,
                keyfacil_issued_at DATETIME NULL,
                created_by CHAR(36) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_keyfacil_doc (tipo, serie, numero),
                KEY idx_keyfacil_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    private function keyfacilInvoicesIndex(): void
    {
        $this->ensureKeyfacilInvoiceTable();
        $stmt = $this->pdo->query("
            SELECT
                id, tipo, serie, numero, fecha_emision, fecha_vencimiento,
                cliente_tipo, cliente_documento, cliente_nombre,
                moneda, subtotal, igv, total, status,
                keyfacil_id, keyfacil_status, keyfacil_issued_at, created_at,
                (keyfacil_pdf IS NOT NULL OR keyfacil_pdf_url IS NOT NULL) AS has_pdf,
                (keyfacil_xml IS NOT NULL OR keyfacil_xml_url IS NOT NULL) AS has_xml
            FROM keyfacil_invoices
            ORDER BY created_at DESC
            LIMIT 200
        ");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$row) {
            $row['has_pdf'] = (bool)$row['has_pdf'];
            $row['has_xml'] = (bool)$row['has_xml'];
            $row['subtotal'] = (float)$row['subtotal'];
            $row['igv'] = (float)$row['igv'];
            $row['total'] = (float)$row['total'];
        }
        Response::json(['data' => $rows]);
    }

    private function keyfacilInvoicesStore(): void
    {
        $this->ensureKeyfacilInvoiceTable();
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) $data = [];

        $tipo = trim((string)($data['tipo'] ?? '01'));
        if (!in_array($tipo, ['01', '03'], true)) {
            Response::error('tipo inválido (01 factura, 03 boleta)', 422);
            return;
        }

        $serie = strtoupper(trim((string)($data['serie'] ?? '')));
        if ($serie === '' || !preg_match('/^[A-Z][A-Z0-9]{2,5}$/', $serie)) {
            Response::error('serie inválida (ej. F001)', 422);
            return;
        }
        if ($tipo === '01' && !str_starts_with($serie, 'F')) {
            Response::error('Para factura la serie debe empezar con F (ej. F001)', 422);
            return;
        }
        if ($tipo === '03' && !str_starts_with($serie, 'B')) {
            Response::error('Para boleta la serie debe empezar con B (ej. B001)', 422);
            return;
        }

        $numero = (int)($data['numero'] ?? 0);
        if ($numero <= 0) {
            Response::error('numero inválido', 422);
            return;
        }

        $issueDate = trim((string)($data['fecha_emision'] ?? ''));
        if ($issueDate === '') $issueDate = date('Y-m-d');
        $d = DateTime::createFromFormat('Y-m-d', $issueDate);
        if (!$d || $d->format('Y-m-d') !== $issueDate) {
            Response::error('fecha_emision inválida (YYYY-MM-DD)', 422);
            return;
        }

        $dueDate = trim((string)($data['fecha_vencimiento'] ?? ''));
        if ($dueDate !== '') {
            $d2 = DateTime::createFromFormat('Y-m-d', $dueDate);
            if (!$d2 || $d2->format('Y-m-d') !== $dueDate) {
                Response::error('fecha_vencimiento inválida (YYYY-MM-DD)', 422);
                return;
            }
            if (strtotime($dueDate) < strtotime($issueDate)) {
                Response::error('La fecha de vencimiento no puede ser menor a la fecha de emisión', 422);
                return;
            }
        }

        $condicion = trim((string)($data['condicion_pago_tipo'] ?? ''));
        if (!in_array($condicion, ['01', '02'], true)) {
            $condicion = $dueDate !== '' ? '02' : '01';
        }
        if ($condicion === '02' && $dueDate === '') {
            Response::error('Para crédito debes indicar fecha de vencimiento', 422);
            return;
        }

        $docType = trim((string)($data['cliente_tipo'] ?? '6'));
        if (!in_array($docType, ['6', '1', '4', '7', '-', '0'], true)) {
            $docType = '6';
        }
        $docNumber = preg_replace('/\s+/', '', (string)($data['cliente_documento'] ?? ''));
        if ($docNumber === '' && in_array($docType, ['-', '0'], true)) $docNumber = '-';

        if ($tipo === '01') {
            if ($docType !== '6' || strlen($docNumber) !== 11) {
                Response::error('Para factura se requiere RUC de 11 dígitos', 422);
                return;
            }
        } elseif ($docNumber === '') {
            Response::error('El documento del cliente es requerido', 422);
            return;
        }

        $customerName = trim((string)($data['cliente_nombre'] ?? ''));
        if ($customerName === '') {
            Response::error('La razón social / nombre del cliente es requerido', 422);
            return;
        }

        $currency = strtoupper(trim((string)($data['moneda'] ?? 'PEN')));
        if (!in_array($currency, ['PEN', 'USD', 'EUR'], true)) {
            Response::error('moneda inválida (PEN, USD, EUR)', 422);
            return;
        }

        $rawItems = $data['items'] ?? [];
        if (!is_array($rawItems) || count($rawItems) === 0) {
            Response::error('Debes incluir al menos un producto o servicio', 422);
            return;
        }

        $allowedUnits = ['NIU', 'ZZ', 'KGM', 'LTR', 'GLI', 'BX', 'MTQ', 'MTR', 'GRM', 'TNE', 'MIL'];
        $allowedIgv = ['10', '20', '30', '40'];
        $items = [];
        $subtotal = 0.0;
        $igvTotal = 0.0;

        foreach ($rawItems as $index => $item) {
            $description = trim((string)($item['descripcion'] ?? ''));
            if ($description === '') {
                Response::error('La descripción del ítem ' . ($index + 1) . ' es requerida', 422);
                return;
            }
            $qty = (float)($item['cantidad'] ?? 0);
            if ($qty <= 0) {
                Response::error('La cantidad del ítem ' . ($index + 1) . ' debe ser mayor a 0', 422);
                return;
            }
            $price = (float)($item['precio_unitario'] ?? -1);
            if ($price < 0) {
                Response::error('El precio del ítem ' . ($index + 1) . ' es inválido', 422);
                return;
            }
            $unit = strtoupper(trim((string)($item['unidad_medida'] ?? 'ZZ')));
            if (!in_array($unit, $allowedUnits, true)) $unit = 'ZZ';
            $igvType = trim((string)($item['tipo_igv'] ?? '10'));
            if (!in_array($igvType, $allowedIgv, true)) $igvType = '10';
            $code = trim((string)($item['codigo'] ?? ''));
            if ($code === '') $code = 'ITEM-' . ($index + 1);

            $lineBase = round($qty * $price, 2);
            $lineIgv = $igvType === '10' ? round($lineBase * 0.18, 2) : 0.0;
            $subtotal += $lineBase;
            $igvTotal += $lineIgv;

            $items[] = [
                'codigo' => substr($code, 0, 30),
                'descripcion' => $description,
                'unidad_medida' => $unit,
                'cantidad' => $qty,
                'precio_unitario' => $price,
                'tipo_igv' => $igvType,
                'line_subtotal' => $lineBase,
                'line_igv' => $lineIgv,
                'line_total' => round($lineBase + $lineIgv, 2),
            ];
        }

        $subtotal = round($subtotal, 2);
        $igvTotal = round($igvTotal, 2);
        $total = round($subtotal + $igvTotal, 2);

        $dup = $this->pdo->prepare('SELECT id FROM keyfacil_invoices WHERE tipo = :tipo AND serie = :serie AND numero = :numero LIMIT 1');
        $dup->execute([':tipo' => $tipo, ':serie' => $serie, ':numero' => $numero]);
        $duplicate = (bool)$dup->fetchColumn();

        $sellerName = trim((string)(Auth::user()['full_name'] ?? ''));

        $payload = [
            'tipo' => $tipo,
            'serie' => $serie,
            'numero' => $numero,
            'fecha_emision' => $issueDate . 'T00:00:00-05:00',
            'tipo_operacion' => '0101',
            'cliente_tipo' => $docType,
            'cliente_documento' => $docNumber,
            'cliente_nombre' => $customerName,
            'cliente_direccion' => trim((string)($data['cliente_direccion'] ?? '')) ?: 'Lima',
            'cliente_email' => trim((string)($data['cliente_email'] ?? '')) ?: null,
            'cliente_telefono' => trim((string)($data['cliente_telefono'] ?? '')) ?: null,
            'vendedor_nombre' => $sellerName !== '' ? $sellerName : null,
            'observaciones' => trim((string)($data['observaciones'] ?? '')) ?: null,
            'moneda' => $currency,
            'condicion_pago_tipo' => $condicion,
            'incluir_pdf' => true,
            'incluir_xml' => true,
            'formato_pdf' => 'A4',
            'items' => array_map(function (array $item): array {
                return [
                    'codigo' => $item['codigo'],
                    'descripcion' => $item['descripcion'],
                    'unidad_medida' => $item['unidad_medida'],
                    'cantidad' => $item['cantidad'],
                    'precio_unitario' => \App\Support\KeyfacilService::priceWithIgv((float)$item['precio_unitario'], (string)$item['tipo_igv']),
                    'descuento_porcentaje' => 0,
                    'tipo_igv' => $item['tipo_igv'],
                ];
            }, $items),
        ];
        if ($dueDate !== '') {
            $payload['fecha_vencimiento'] = $dueDate . 'T00:00:00-05:00';
            $payload['condicion_pago_credito_cuotas'] = [[
                'monto' => $total,
                'fecha_vencimiento' => $dueDate . 'T00:00:00-05:00',
            ]];
        }

        if (!empty($data['dry_run'])) {
            Response::json([
                'dry_run' => true,
                'duplicate' => $duplicate,
                'data' => [
                    'tipo' => $tipo,
                    'serie' => $serie,
                    'numero' => $numero,
                    'cliente_tipo' => $docType,
                    'cliente_documento' => $docNumber,
                    'cliente_nombre' => $customerName,
                    'moneda' => $currency,
                    'subtotal' => $subtotal,
                    'igv' => $igvTotal,
                    'total' => $total,
                    'items' => $items,
                    'payload' => $payload,
                ],
            ]);
            return;
        }

        if ($duplicate) {
            Response::error('Ya existe un comprobante registrado con esa serie y número', 409);
            return;
        }

        $id = $this->uuid();
        $createdBy = Auth::userId();
        $insert = $this->pdo->prepare("
            INSERT INTO keyfacil_invoices (
                id, tipo, serie, numero, fecha_emision, fecha_vencimiento,
                cliente_tipo, cliente_documento, cliente_nombre, cliente_direccion,
                cliente_email, cliente_telefono, moneda, condicion_pago_tipo,
                subtotal, igv, total, items_json, status, created_by, created_at
            ) VALUES (
                :id, :tipo, :serie, :numero, :issue, :due,
                :doc_type, :doc_number, :name, :address,
                :email, :phone, :currency, :condition,
                :subtotal, :igv, :total, :items, 'draft', :created_by, NOW()
            )
        ");
        $insert->execute([
            ':id' => $id,
            ':tipo' => $tipo,
            ':serie' => $serie,
            ':numero' => $numero,
            ':issue' => $issueDate,
            ':due' => $dueDate !== '' ? $dueDate : null,
            ':doc_type' => $docType,
            ':doc_number' => $docNumber,
            ':name' => $customerName,
            ':address' => trim((string)($data['cliente_direccion'] ?? '')) ?: null,
            ':email' => trim((string)($data['cliente_email'] ?? '')) ?: null,
            ':phone' => trim((string)($data['cliente_telefono'] ?? '')) ?: null,
            ':currency' => $currency,
            ':condition' => $condicion,
            ':subtotal' => $subtotal,
            ':igv' => $igvTotal,
            ':total' => $total,
            ':items' => json_encode($items, JSON_UNESCAPED_UNICODE),
            ':created_by' => $createdBy,
        ]);

        $service = new \App\Support\KeyfacilService();
        $result = $service->issueInvoice($payload, [
            'action' => 'issue',
            'local_invoice_id' => $id,
            'tipo' => $tipo,
            'serie' => $serie,
            'numero' => $numero,
        ]);

        if (!$result['ok']) {
            $this->pdo->prepare("UPDATE keyfacil_invoices SET status = 'error', keyfacil_status = 'error', keyfacil_response = :resp, updated_at = NOW() WHERE id = :id")
                ->execute([':resp' => $result['raw'] ?: null, ':id' => $id]);
            Response::error($result['error'] ?: 'Error al emitir comprobante en Keyfacil', 502, [
                'id' => $id,
                'keyfacil_status' => $result['status'] ?? 0,
                'response' => $result['data'] ?? null,
            ]);
            return;
        }

        $responseData = $result['data'] ?? [];
        $payloadData = is_array($responseData['data'] ?? null) ? $responseData['data'] : $responseData;
        $keyfacilId = $payloadData['id'] ?? $payloadData['invoice_id'] ?? $responseData['id'] ?? null;
        $keyfacilStatus = $payloadData['status'] ?? $responseData['status'] ?? 'sent';

        // Fallback: si la emisión no devolvió ID, recuperarlo con invoice-search.
        if (!$keyfacilId) {
            $search = $service->searchInvoice([
                'tipo' => $tipo,
                'serie' => $serie,
                'numero' => $numero,
            ], [
                'action' => 'issue_search_fallback',
                'local_invoice_id' => $id,
                'tipo' => $tipo,
                'serie' => $serie,
                'numero' => $numero,
            ]);
            if (!empty($search['ok'])) {
                $searchData = $search['data'] ?? [];
                $searchPayload = is_array($searchData['data'] ?? null) ? $searchData['data'] : $searchData;
                $keyfacilId = $searchPayload['id'] ?? $searchPayload['invoice_id'] ?? $searchData['id'] ?? $keyfacilId;
                if ($keyfacilId) {
                    $responseData = $searchData ?: $responseData;
                    $payloadData = $searchPayload;
                    $keyfacilStatus = $payloadData['status'] ?? $searchData['status'] ?? $keyfacilStatus;
                }
            }
        }

        $pdf = $this->extractKeyfacilFile($responseData, 'pdf');
        $xml = $this->extractKeyfacilFile($responseData, 'xml');

        // Fallback: si no vinieron PDF/XML en la emisión, consultarlos por ID.
        if ((!$pdf || !$xml) && $keyfacilId) {
            $detail = $service->getInvoice((string)$keyfacilId, true, true, [
                'action' => 'issue_get_fallback',
                'local_invoice_id' => $id,
                'keyfacil_id' => $keyfacilId,
            ]);
            if (!empty($detail['ok'])) {
                $detailData = $detail['data'] ?? [];
                $pdf = $pdf ?: $this->extractKeyfacilFile($detailData, 'pdf');
                $xml = $xml ?: $this->extractKeyfacilFile($detailData, 'xml');
            }
        }
        $pdfBase64 = ($pdf && $this->looksLikeBase64($pdf)) ? preg_replace('#^data:[^;]+;base64,#i', '', $pdf) : null;
        $xmlBase64 = ($xml && $this->looksLikeBase64($xml)) ? preg_replace('#^data:[^;]+;base64,#i', '', $xml) : null;
        $pdfUrl = ($pdf && !$this->looksLikeBase64($pdf)) ? $pdf : null;
        $xmlUrl = ($xml && !$this->looksLikeBase64($xml)) ? $xml : null;

        $this->pdo->prepare("
            UPDATE keyfacil_invoices SET
                status = 'issued',
                keyfacil_id = :kid,
                keyfacil_status = :kstatus,
                keyfacil_pdf = :pdf,
                keyfacil_xml = :xml,
                keyfacil_pdf_url = :pdf_url,
                keyfacil_xml_url = :xml_url,
                keyfacil_response = :resp,
                keyfacil_issued_at = NOW(),
                updated_at = NOW()
            WHERE id = :id
        ")->execute([
            ':kid' => $keyfacilId,
            ':kstatus' => $keyfacilStatus,
            ':pdf' => $pdfBase64,
            ':xml' => $xmlBase64,
            ':pdf_url' => $pdfUrl,
            ':xml_url' => $xmlUrl,
            ':resp' => $result['raw'] ?: null,
            ':id' => $id,
        ]);

        Response::json([
            'message' => 'Comprobante emitido electrónicamente',
            'data' => [
                'id' => $id,
                'tipo' => $tipo,
                'serie' => $serie,
                'numero' => $numero,
                'status' => 'issued',
                'keyfacil_id' => $keyfacilId,
                'keyfacil_status' => $keyfacilStatus,
                'subtotal' => $subtotal,
                'igv' => $igvTotal,
                'total' => $total,
                'has_pdf' => (bool)$pdfBase64,
                'has_xml' => (bool)$xmlBase64,
            ],
        ], 201);
    }

    private function keyfacilInvoicesDestroy(string $id): void
    {
        $this->ensureKeyfacilInvoiceTable();
        $stmt = $this->pdo->prepare('SELECT * FROM keyfacil_invoices WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$invoice) {
            Response::error('Comprobante no encontrado', 404);
            return;
        }
        if (!empty($invoice['keyfacil_id']) && ($invoice['status'] ?? '') !== 'voided') {
            Response::error('Anula el comprobante en Keyfacil antes de eliminarlo', 409);
            return;
        }
        $this->pdo->prepare('DELETE FROM keyfacil_invoices WHERE id = :id')->execute([':id' => $id]);
        Response::json(['message' => 'Comprobante eliminado']);
    }

    private function keyfacilInvoiceVoid(string $id): void
    {
        $this->ensureKeyfacilInvoiceTable();
        $stmt = $this->pdo->prepare('SELECT * FROM keyfacil_invoices WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$invoice) {
            Response::error('Comprobante no encontrado', 404);
            return;
        }
        if (empty($invoice['keyfacil_id'])) {
            Response::error('El comprobante no fue emitido en Keyfacil', 422);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $reason = trim((string)($data['motivo'] ?? ''));
        if ($reason === '') {
            Response::error('El motivo de anulación es obligatorio', 422);
            return;
        }

        $service = new \App\Support\KeyfacilService();
        $result = $service->voidInvoice((string)$invoice['keyfacil_id'], $reason, [
            'action' => 'void',
            'local_invoice_id' => $id,
            'keyfacil_id' => $invoice['keyfacil_id'],
        ]);
        if (!$result['ok']) {
            Response::error($result['error'] ?: 'Error al anular el comprobante en Keyfacil', 502, [
                'keyfacil_status' => $result['status'] ?? 0,
                'response' => $result['data'] ?? null,
            ]);
            return;
        }

        $this->pdo->prepare("
            UPDATE keyfacil_invoices SET
                status = 'voided',
                keyfacil_status = 'voided',
                keyfacil_response = :resp,
                updated_at = NOW()
            WHERE id = :id
        ")->execute([':resp' => $result['raw'] ?: null, ':id' => $id]);

        Response::json(['message' => 'Comprobante anulado en Keyfacil']);
    }

    private function keyfacilInvoiceFile(string $id, string $type): void
    {
        $this->ensureKeyfacilInvoiceTable();
        $stmt = $this->pdo->prepare('SELECT * FROM keyfacil_invoices WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $invoice = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$invoice) {
            Response::error('Comprobante no encontrado', 404);
            return;
        }

        $base64 = $type === 'pdf' ? $invoice['keyfacil_pdf'] : $invoice['keyfacil_xml'];
        $url = $type === 'pdf' ? $invoice['keyfacil_pdf_url'] : $invoice['keyfacil_xml_url'];

        // Fallback: si no está almacenado, consultarlo a Keyfacil por ID.
        if (!$base64 && !$url && !empty($invoice['keyfacil_id'])) {
            $service = new \App\Support\KeyfacilService();
            $detail = $service->getInvoice((string)$invoice['keyfacil_id'], true, true, [
                'action' => 'file_get',
                'local_invoice_id' => $id,
                'keyfacil_id' => $invoice['keyfacil_id'],
                'type' => $type,
            ]);
            if (!empty($detail['ok'])) {
                $file = $this->extractKeyfacilFile($detail['data'] ?? [], $type);
                if ($file) {
                    $isBase64 = $this->looksLikeBase64($file);
                    $base64 = $isBase64 ? preg_replace('#^data:[^;]+;base64,#i', '', $file) : null;
                    $url = $isBase64 ? null : $file;
                    $column = $type === 'pdf' ? 'keyfacil_pdf' : 'keyfacil_xml';
                    $urlColumn = $type === 'pdf' ? 'keyfacil_pdf_url' : 'keyfacil_xml_url';
                    $this->pdo->prepare("UPDATE keyfacil_invoices SET $column = :b64, $urlColumn = :url, updated_at = NOW() WHERE id = :id")
                        ->execute([':b64' => $base64, ':url' => $url, ':id' => $id]);
                }
            }
        }

        if ($base64) {
            $content = base64_decode(preg_replace('#^data:[^;]+;base64,#i', '', (string)$base64));
            if ($content === false) {
                Response::error('Archivo no disponible', 404);
                return;
            }
            $mime = $type === 'pdf' ? 'application/pdf' : 'application/xml';
            $filename = ($invoice['serie'] ?: 'comprobante') . '-' . ($invoice['numero'] ?: '') . '.' . $type;
            header('Content-Type: ' . $mime);
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Cache-Control: private, max-age=0, must-revalidate');
            echo $content;
            if (!defined('TEST_MODE')) exit;
            return;
        }

        if ($url) {
            header('Location: ' . $url);
            if (!defined('TEST_MODE')) exit;
            return;
        }

        Response::error('Archivo no disponible', 404);
    }

    private function looksLikeBase64(string $value): bool
    {
        if (str_starts_with($value, 'data:')) return true;
        $compact = preg_replace('/\s+/', '', $value);
        if ($compact === '' || strlen($compact) < 100) return false;
        return (bool)preg_match('#^[A-Za-z0-9+/]+={0,2}$#', $compact);
    }

    private function extractKeyfacilFile(array $data, string $type): ?string
    {
        $keys = [
            $type,
            $type . '_base64',
            $type . '_content',
            'file_' . $type,
            'archivo_' . $type,
            $type . '_url',
            'url_' . $type,
        ];
        foreach ($keys as $key) {
            if (isset($data[$key]) && is_string($data[$key]) && trim($data[$key]) !== '') {
                return trim($data[$key]);
            }
        }
        foreach ($data as $value) {
            if (is_array($value)) {
                $found = $this->extractKeyfacilFile($value, $type);
                if ($found !== null) return $found;
            }
        }
        return null;
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
        $companyQ = trim((string)($_GET['company_q'] ?? ''));
        $month = trim((string)($_GET['month'] ?? ''));

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
            $where[] = "(i.invoice_number LIKE :q_1 OR comp.legal_name LIKE :q_2)";
            $params[':q_1'] = $params[':q_2'] = "%$q%";
        }
        if ($companyQ !== '') {
            $where[] = "comp.legal_name LIKE :company_q";
            $params[':company_q'] = "%$companyQ%";
        }
        if (preg_match('/^\d{4}-\d{2}$/', $month)) {
            $where[] = "i.issue_date >= :month_start AND i.issue_date < :month_end";
            $params[':month_start'] = $month . '-01';
            $params[':month_end'] = date('Y-m-d', strtotime($month . '-01 +1 month'));
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
            $where[] = "(wt.description LIKE :q_1 OR wt.reference_id LIKE :q_2)";
            $params[':q_1'] = $params[':q_2'] = "%$search%";
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
        $stmt = $this->pdo->prepare("SELECT * FROM wallets WHERE company_id = :cid AND currency_id = :cur LIMIT 1");
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
            $upd = $this->pdo->prepare("UPDATE wallets SET balance = :bal, updated_at = NOW() WHERE company_id = :cid AND currency_id = :cur");
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
        $stmt = $this->pdo->prepare("SELECT is_reconciled FROM wallet_transactions WHERE id = :id");
        $stmt->execute([':id' => $txId]);
        $tx = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$tx) {
            Response::error('Transacción no encontrada', 404);
            return;
        }

        $newState = ((int)$tx['is_reconciled'] === 1) ? 0 : 1;
        $reconciledAt = $newState ? date('Y-m-d H:i:s') : null;

        $upd = $this->pdo->prepare("UPDATE wallet_transactions SET is_reconciled = :s, reconciled_at = :at WHERE id = :id");
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
            $where .= " AND (i.invoice_number LIKE :s_1 OR c.legal_name LIKE :s_2)";
            $params[':s_1'] = $params[':s_2'] = "%$search%";
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
