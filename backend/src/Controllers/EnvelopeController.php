<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class EnvelopeController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
        $this->ensureSignatureSchema();
    }

    /**
     * Garantiza las columnas de Spectra Sign incluso en BDs ya migradas.
     * Cacheado para no ejecutar DDL en cada request.
     */
    private function ensureSignatureSchema(): void
    {
        if (\App\Support\Cache::get('spectra_sign_schema_v1') !== null) {
            return;
        }
        $this->ensureTables();
        \App\Support\Cache::set('spectra_sign_schema_v1', time(), 86400 * 365);
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS docusign_envelopes (
                id VARCHAR(36) PRIMARY KEY,
                contract_id VARCHAR(36) NOT NULL,
                amendment_id VARCHAR(36) NULL,
                envelope_id VARCHAR(255) NOT NULL,
                status VARCHAR(50) DEFAULT 'sent',
                last_event_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (contract_id),
                INDEX (amendment_id),
                INDEX (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        
        // Add amendment_id column if it doesn't exist (for existing tables)
        try {
            $this->pdo->exec("ALTER TABLE docusign_envelopes ADD COLUMN amendment_id VARCHAR(36) NULL AFTER contract_id");
            $this->pdo->exec("CREATE INDEX idx_amendment_id ON docusign_envelopes(amendment_id)");
        } catch (\Exception $e) {
            // Column likely exists
        }

        // Add provider column for fallback
        try {
            $this->pdo->exec("ALTER TABLE docusign_envelopes ADD COLUMN provider VARCHAR(20) DEFAULT 'docusign' AFTER envelope_id");
            $this->pdo->exec("CREATE INDEX idx_provider ON docusign_envelopes(provider)");
        } catch (\Exception $e) {
            // Column likely exists
        }

        // Spectra Sign: columnas para firma digital dibujada (sin DocuSign)
        $this->addColumn('docusign_envelopes', 'sign_token', "VARCHAR(64) NULL");
        $this->addColumn('docusign_envelopes', 'signer_name', "VARCHAR(200) NULL");
        $this->addColumn('docusign_envelopes', 'signer_email', "VARCHAR(200) NULL");
        $this->addColumn('docusign_envelopes', 'signer_id', "CHAR(36) NULL");
        $this->addColumn('docusign_envelopes', 'signature_data', "LONGTEXT NULL");
        $this->addColumn('docusign_envelopes', 'signature_svg', "LONGTEXT NULL");
        $this->addColumn('docusign_envelopes', 'signed_pdf', "LONGTEXT NULL");
        $this->addColumn('docusign_envelopes', 'signature_ip', "VARCHAR(64) NULL");
        $this->addColumn('docusign_envelopes', 'signature_ua', "VARCHAR(255) NULL");
        $this->addColumn('docusign_envelopes', 'signed_at', "DATETIME NULL");
        $this->addColumn('docusign_envelopes', 'expires_at', "DATETIME NULL");
        try {
            $this->pdo->exec("CREATE UNIQUE INDEX idx_sign_token ON docusign_envelopes(sign_token)");
        } catch (\Exception $e) {
            // Index already exists
        }

        \App\Support\Cache::set('spectra_sign_schema_v1', time(), 86400 * 365);
    }

    private function addColumn(string $table, string $column, string $definition): void
    {
        try {
            $stmt = $this->pdo->prepare("SHOW COLUMNS FROM `$table` LIKE '$column'");
            $stmt->execute();
            if ($stmt->fetchColumn() === false) {
                $this->pdo->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
            }
        } catch (\Exception $e) {
            // Tabla o columna inexistente: se ignora
        }
    }

    public function handle(string $method, ?string $id = null): void
    {
        // Require auth
        $user = Auth::user();
        if (!$user) {
            Response::error('No autenticado', 401);
            return;
        }

        switch ($method) {
            case 'GET':
                $id ? $this->show($id) : $this->index();
                break;
            case 'POST':
                if ($id) {
                    if (isset($_GET['action'])) {
                        switch ($_GET['action']) {
                            case 'sync':
                                $this->sync($id);
                                break;
                            case 'void':
                                $this->void($id);
                                break;
                            case 'sign':
                                $this->sign($id);
                                break;
                            case 'view':
                                $this->view($id);
                                break;
                            default:
                                Response::error('Action not supported', 400);
                        }
                    } else {
                        Response::error('Action parameter required', 400);
                    }
                } else {
                    $this->store();
                }
                break;
            default:
                Response::error('Method not allowed', 405);
        }
    }

    private function index(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(100, (int)($_GET['per_page'] ?? 10)));
        $q = trim((string)($_GET['q'] ?? ''));
        $offset = ($page - 1) * $perPage;

        $where = [];
        $params = [];

        if (!empty($_GET['status'])) {
            $where[] = 'e.status = :status';
            $params[':status'] = $_GET['status'];
        }

        // Search by envelope_id or contract title (via template) or company name
        if ($q !== '') {
            $where[] = '(e.envelope_id LIKE :q OR ct.title LIKE :q OR comp.legal_name LIKE :q)';
            $params[':q'] = "%$q%";
        }

        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        // Query
        // Join contracts to get relation
        // Join contract_templates (via contracts.template_id) to get title
        // Join companies (via contracts.company_id) to get tenant name
        
        $sqlBase = "
            FROM docusign_envelopes e
            LEFT JOIN contracts c ON e.contract_id = c.id
            LEFT JOIN contract_templates ct ON c.template_id = ct.id
            LEFT JOIN companies comp ON c.company_id = comp.id
            $whereSql
        ";

        // Count
        $stmt = $this->pdo->prepare("SELECT COUNT(*) $sqlBase");
        $stmt->execute($params);
        $total = (int)$stmt->fetchColumn();

        // Fetch
        $sql = "
            SELECT 
                e.*,
                COALESCE(c.title, ct.title) as contract_title,
                ct.title as template_title,
                comp.legal_name as company_name,
                comp.id as company_id
            $sqlBase
            ORDER BY e.last_event_at DESC, e.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($data as &$row) {
            $this->attachLinks($row);
        }
        unset($row);

        Response::json([
            'data' => $data,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage)
            ]
        ]);
    }

    private function show(string $id): void
    {
        $stmt = $this->pdo->prepare("
            SELECT 
                e.*,
                COALESCE(c.title, ct.title) as contract_title,
                ct.title as template_title,
                comp.legal_name as company_name
            FROM docusign_envelopes e
            LEFT JOIN contracts c ON e.contract_id = c.id
            LEFT JOIN contract_templates ct ON c.template_id = ct.id
            LEFT JOIN companies comp ON c.company_id = comp.id
            WHERE e.id LIKE :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$item) {
            Response::error('Envelope not found', 404);
            return;
        }

        $this->attachLinks($item);

        Response::json(['data' => $item]);
    }

    private function sync(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM docusign_envelopes WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$item) {
            Response::error('Envelope not found', 404);
            return;
        }

        // Spectra Sign: el estado se calcula de la firma guardada (sin API externa)
        if (!empty($item['signed_at']) && $item['status'] !== 'completed') {
            $this->pdo->prepare("UPDATE docusign_envelopes SET status = 'completed', last_event_at = NOW() WHERE id LIKE :id")
                 ->execute([':id' => $id]);
            $status = 'completed';
        } else {
            $status = $item['status'];
        }

        Response::json(['message' => 'Estado sincronizado', 'status' => $status, 'signed_at' => $item['signed_at'] ?? null]);
    }

    private function sign(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM docusign_envelopes WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$item) {
            Response::error('Envelope not found', 404);
            return;
        }

        $provider = $item['provider'] ?? 'docusign';

        // Los sobres Spectra Sign se firman en el portal público (/sign/{token}) con la firma dibujada.
        if ($provider === 'spectra_sign') {
            if (!empty($item['sign_token'])) {
                Response::json([
                    'message' => 'Abre el enlace de firma para dibujar y guardar tu firma',
                    'url' => $this->signingUrl($item['sign_token'])
                ]);
            } else {
                Response::error('Este sobre no tiene enlace de firma válido', 400);
            }
            return;
        }

        if ($provider !== 'local') {
            Response::error('Este sobre fue creado con DocuSign, servicio discontinuado. Crea un nuevo sobre para firmar.', 400);
            return;
        }

        if ($item['status'] === 'completed') {
            Response::json(['message' => 'Already signed']);
            return;
        }

        // Mark as signed
        $this->pdo->prepare("UPDATE docusign_envelopes SET status = 'completed', last_event_at = NOW() WHERE id LIKE :id")
             ->execute([':id' => $id]);

        // Trigger hooks
        if (!empty($item['amendment_id'])) {
            $this->handleAmendmentSigned($item['amendment_id']);
        } else {
            $this->handleContractSigned($item['contract_id']);
        }

        Response::json(['message' => 'Envelope signed successfully (Local)']);
    }



    private function handleContractSigned(string $contractId): void
    {
        // 1. Update Contract Status to 'active'
        $stmt = $this->pdo->prepare("UPDATE contracts SET status = 'active' WHERE id LIKE :id");
        $stmt->execute([':id' => $contractId]);

        // 2. Complete Onboarding Task
        // Get User ID from contract
        $stmt = $this->pdo->prepare("SELECT user_id FROM contracts WHERE id = ?");
        $stmt->execute([$contractId]);
        $userId = $stmt->fetchColumn();

        if ($userId) {
            // Update task
            $stmt = $this->pdo->prepare("
                UPDATE onboarding_tasks 
                SET status = 'completed', completed_at = NOW() 
                WHERE user_id = ? AND title LIKE '%Firmar Contrato%' AND status != 'completed'
            ");
            $stmt->execute([$userId]);
        }
    }

    private function handleAmendmentSigned(string $amendmentId): void
    {
        // 1. Fetch Amendment Details
        $stmt = $this->pdo->prepare("SELECT * FROM contract_amendments WHERE id = :id");
        $stmt->execute([':id' => $amendmentId]);
        $amendment = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$amendment || $amendment['status'] === 'signed') {
            return; // Already processed or not found
        }

        // 2. Update Amendment Status
        $stmt = $this->pdo->prepare("
            UPDATE contract_amendments 
            SET status = 'signed', signed_at = NOW(), effective_date = IFNULL(effective_date, NOW())
            WHERE id LIKE :id
        ");
        $stmt->execute([':id' => $amendmentId]);

        // 3. Apply Changes to Contract
        $changes = json_decode($amendment['changes_json'], true);
        if (is_array($changes)) {
            $updates = [];
            $params = [':id' => $amendment['contract_id']];
            
            foreach ($changes as $field => $vals) {
                // Sanitize field name to prevent SQL injection (though keys come from internal logic)
                // Allowed fields: title, rate, start_date, end_date, scope_of_work, special_clause
                if (in_array($field, ['title', 'rate', 'start_date', 'end_date', 'scope_of_work', 'special_clause'])) {
                    $updates[] = "$field = :$field";
                    $params[":$field"] = $vals['new'];
                }
            }

            if (!empty($updates)) {
                $sql = "UPDATE contracts SET " . implode(', ', $updates) . " WHERE id = :id";
                $this->pdo->prepare($sql)->execute($params);
            }
        }
    }

    private function store(): void
    {
        $input = json_decode(file_get_contents('php://input'), true);
        
        // Check if this is for an amendment
        if (!empty($input['amendment_id'])) {
            $this->storeAmendmentEnvelope($input['amendment_id']);
            return;
        }

        if (empty($input['contract_id'])) {
            Response::error('contract_id is required', 400);
            return;
        }

        $this->storeContractEnvelope($input['contract_id']);
    }

    private function storeAmendmentEnvelope(string $amendmentId): void
    {
        // 1. Fetch Amendment Details
        $stmt = $this->pdo->prepare("
            SELECT ca.*, c.id as contract_id, c.title, u.email as user_email, u.full_name as user_name, comp.legal_name as company_name
            FROM contract_amendments ca
            JOIN contracts c ON ca.contract_id = c.id
            LEFT JOIN users u ON c.freelancer_id = u.id 
            LEFT JOIN companies comp ON c.company_id = comp.id
            WHERE ca.id LIKE :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $amendmentId]);
        $amendment = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$amendment) {
            // Try fetching with user_id instead of freelancer_id if null (legacy support)
            $stmt = $this->pdo->prepare("
                SELECT ca.*, c.id as contract_id, c.title, u.email as user_email, u.full_name as user_name, comp.legal_name as company_name
                FROM contract_amendments ca
                JOIN contracts c ON ca.contract_id = c.id
                LEFT JOIN users u ON c.user_id = u.id 
                LEFT JOIN companies comp ON c.company_id = comp.id
                WHERE ca.id = :id
                LIMIT 1
            ");
            $stmt->execute([':id' => $amendmentId]);
            $amendment = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if (!$amendment) {
            Response::error('Amendment not found', 404);
            return;
        }

        // 2. Generate Document
        $changes = json_decode($amendment['changes_json'], true);
        $docContent = "AMENDMENT TO AGREEMENT\n\n";
        $docContent .= "This Amendment modifies the contract titled: " . ($amendment['title'] ?? 'N/A') . "\n";
        $docContent .= "Effective Date: " . date('Y-m-d') . "\n\n";
        $docContent .= "The following changes are agreed upon:\n\n";
        
        if (is_array($changes)) {
            foreach ($changes as $field => $vals) {
                $docContent .= "- " . ucfirst(str_replace('_', ' ', $field)) . ": Changed from '" . ($vals['old'] ?? 'N/A') . "' to '" . ($vals['new'] ?? 'N/A') . "'\n";
            }
        }
        
        $docContent .= "\n\nAll other terms remain unchanged.\n\n";
        $docContent .= "Signatures:\n\n__________________________\n" . ($amendment['user_name'] ?? 'Contractor') . "\n";
        $docContent .= "\n__________________________\n" . ($amendment['company_name'] ?? 'Company Representative');

        // 3. Crear sobre de firma (Spectra Sign: portal propio, sin DocuSign)
        $token = $this->newSignToken();
        $envelopeId = 'SPEC-' . $this->uuid();
        $signingUrl = $this->signingUrl($token);

        try {
            $id = $this->uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO docusign_envelopes (id, contract_id, amendment_id, envelope_id, status, last_event_at, provider, sign_token)
                VALUES (:id, :cid, :aid, :eid, 'sent', NOW(), 'spectra_sign', :token)
            ");
            $stmt->execute([
                ':id' => $id,
                ':cid' => $amendment['contract_id'],
                ':aid' => $amendmentId,
                ':eid' => $envelopeId,
                ':token' => $token
            ]);
            
            // Update Amendment status
            $this->pdo->prepare("UPDATE contract_amendments SET status = 'sent', envelope_id = :eid WHERE id LIKE :id")
                 ->execute([':eid' => $envelopeId, ':id' => $amendmentId]);

            Response::json([
                'message' => 'Enmienda enviada para firma (Spectra Sign)',
                'envelope_id' => $envelopeId,
                'provider' => 'spectra_sign',
                'signing_url' => $signingUrl
            ]);
        } catch (\Exception $e) {
            Response::error('Database Error: ' . $e->getMessage(), 500);
        }
    }

    private function storeContractEnvelope(string $contractId): void
    {
        // Verify contract exists and fetch details
        $contract = $this->getContractDetails($contractId);

        if (!$contract) {
            Response::error('Contract not found', 404);
            return;
        }

        // Verify no active envelope exists
        $stmt = $this->pdo->prepare("
            SELECT id FROM docusign_envelopes 
            WHERE contract_id = :contract_id AND amendment_id IS NULL AND status NOT IN ('voided', 'declined') 
            LIMIT 1
        ");
        $stmt->execute([':contract_id' => $contractId]);
        if ($stmt->fetch()) {
            Response::error('Active envelope already exists for this contract', 409);
            return;
        }

        // Crear sobre de firma (Spectra Sign: portal propio, sin DocuSign)
        $token = $this->newSignToken();
        $envelopeId = 'SPEC-' . $this->uuid();
        $signingUrl = $this->signingUrl($token);

        try {
            // Save Envelope Record
            $id = $this->uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO docusign_envelopes (id, contract_id, envelope_id, status, last_event_at, provider, sign_token)
                VALUES (:id, :cid, :eid, 'sent', NOW(), 'spectra_sign', :token)
            ");
            $stmt->execute([
                ':id' => $id,
                ':cid' => $contractId,
                ':eid' => $envelopeId,
                ':token' => $token
            ]);

            // Update contract status to pending
            $stmt = $this->pdo->prepare("UPDATE contracts SET status = 'pending' WHERE id LIKE :id");
            $stmt->execute([':id' => $contractId]);

            Response::json([
                'message' => 'Contrato enviado para firma digital (Spectra Sign)',
                'envelope_id' => $envelopeId,
                'provider' => 'spectra_sign',
                'signing_url' => $signingUrl
            ]);

        } catch (\Exception $e) {
             Response::error('Database Error: ' . $e->getMessage(), 500);
        }
    }

    private function void(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM docusign_envelopes WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$item) {
            Response::error('Envelope not found', 404);
            return;
        }

        if ($item['status'] === 'voided') {
            Response::error('Envelope is already voided', 400);
            return;
        }

        // Update status to voided
        $stmt = $this->pdo->prepare("UPDATE docusign_envelopes SET status = 'voided', last_event_at = NOW() WHERE id LIKE :id");
        $stmt->execute([':id' => $id]);

        Response::json(['message' => 'Envelope voided successfully']);
    }

    private function view(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM docusign_envelopes WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $envelope = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$envelope) {
            Response::error('Envelope not found', 404);
            return;
        }

        if (($envelope['provider'] ?? 'docusign') === 'spectra_sign') {
            if (!empty($envelope['sign_token'])) {
                $payload = [
                    'provider' => 'spectra_sign',
                    'token' => $envelope['sign_token'],
                    'url' => $this->signingUrl($envelope['sign_token']),
                    'status' => $envelope['status'],
                    'signed_at' => $envelope['signed_at'] ?? null
                ];
                if (!empty($envelope['signed_pdf'])) {
                    $payload['pdf_url'] = $this->pdfUrl($envelope['sign_token']);
                }
                Response::json($payload);
                return;
            }
            Response::error('Este sobre no tiene enlace de firma válido', 400);
            return;
        }

        if (($envelope['provider'] ?? 'docusign') === 'local') {
            $contract = $this->getContractDetails($envelope['contract_id']);
            if (!$contract) {
                Response::error('Contract not found', 404);
                return;
            }
            $content = $this->generateContractDocument($contract);
            
            // If it's a browser request, we might want to show it as plain text
            header('Content-Type: text/plain; charset=utf-8');
            echo $content;
            exit;
        }

        // DocuSign heredado: servicio discontinuado
        Response::json([
            'message' => 'Este sobre fue creado con DocuSign, servicio discontinuado. Crea un nuevo sobre para firmar.',
            'provider' => 'docusign',
            'status' => $envelope['status']
        ]);
    }

    private function getContractDetails(string $contractId): ?array
    {
        $sql = "
            SELECT c.*, 
                   u.email as user_email, u.full_name as user_name, 
                   u.national_id as user_national_id, u.address as user_address, u.nationality as user_nationality,
                   comp.legal_name as company_name, comp.tax_id as company_tax_id, comp.address as company_address, comp.representative_name,
                   ct.docusign_template_id, ct.body as template_body,
                   curr.code as currency_code
            FROM contracts c
            LEFT JOIN users u ON c.freelancer_id = u.id
            LEFT JOIN companies comp ON c.company_id = comp.id
            LEFT JOIN contract_templates ct ON c.template_id = ct.id
            LEFT JOIN currencies curr ON c.currency_id = curr.id
            WHERE c.id = :id 
            LIMIT 1
        ";
        
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([':id' => $contractId]);
        $contract = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$contract) {
            // Legacy user_id check
            $sqlLegacy = "
                SELECT c.*, 
                       u.email as user_email, u.full_name as user_name, 
                       u.national_id as user_national_id, u.address as user_address, u.nationality as user_nationality,
                       comp.legal_name as company_name, comp.tax_id as company_tax_id, comp.address as company_address, comp.representative_name,
                       ct.docusign_template_id, ct.body as template_body,
                       curr.code as currency_code
                FROM contracts c
                LEFT JOIN users u ON c.user_id = u.id
                LEFT JOIN companies comp ON c.company_id = comp.id
                LEFT JOIN contract_templates ct ON c.template_id = ct.id
                LEFT JOIN currencies curr ON c.currency_id = curr.id
                WHERE c.id = :id 
                LIMIT 1
            ";
            $stmt = $this->pdo->prepare($sqlLegacy);
            $stmt->execute([':id' => $contractId]);
            $contract = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        return $contract ?: null;
    }

    private function generateContractDocument(array $contract): string
    {
        if (!empty($contract['template_body'])) {
            $docContent = $contract['template_body'];
            $docContent = $this->plainText($docContent);

            $replacements = [
                '{{company_name}}' => $contract['company_name'] ?? 'Company',
                '{{company_tax_id}}' => $contract['company_tax_id'] ?? 'N/A',
                '{{company_address}}' => $contract['company_address'] ?? 'Remote',
                '{{representative_name}}' => $contract['representative_name'] ?? 'Company Representative',
                '{{employee_name}}' => $contract['user_name'] ?? 'Contractor',
                '{{employee_id_number}}' => $contract['user_national_id'] ?? 'N/A',
                '{{employee_address}}' => $contract['user_address'] ?? 'Remote',
                '{{employee_nationality}}' => $contract['user_nationality'] ?? 'N/A',
                '{{job_title}}' => $contract['title'] ?? 'Contractor',
                '{{start_date}}' => $contract['start_date'] ?? date('Y-m-d'),
                '{{salary}}' => $contract['rate'] ?? '0',
                '{{currency}}' => $contract['currency_code'] ?? 'USD',
                '{{position}}' => $contract['title'] ?? 'Contractor',
                '{{functions}}' => $contract['scope_of_work'] ?? 'To be defined',
                '{{work_modality}}' => $contract['special_clause'] ?? 'Remoto',
                '{{notice_period}}' => $contract['notice_period'] ?? '15',
                '{{payment_frequency}}' => $contract['payment_frequency'] ?? 'monthly',
                '{{work_schedule}}' => 'According to project needs',
                '{{city_signing}}' => 'Remote',
                '{{day}}' => date('d'),
                '{{month}}' => date('m'),
                '{{year}}' => date('Y'),
                '{{notice_days}}' => $contract['notice_period'] ?? '30',
                '{{contractor_name}}' => $contract['user_name'] ?? 'Contractor',
                '{{services_description}}' => $contract['scope_of_work'] ?? 'Services as agreed.',
                '{{rate_unit}}' => 'month',
                '{{state_law}}' => 'Delaware',
            ];
            
            foreach ($replacements as $key => $val) {
                $docContent = str_replace($key, $this->plainText((string)$val), $docContent);
            }
            
            return preg_replace('/\{\{[^}]+\}\}/', '_____', $docContent);
        }

        // Fallback Manual
        $docContent = "CONTRACT AGREEMENT\n\n";
        $docContent .= "Between: " . ($contract['company_name'] ?? 'Company') . "\n";
        $docContent .= "And: " . ($contract['user_name'] ?? 'Contractor') . "\n\n";
        $docContent .= "Job Title: " . ($contract['title'] ?? 'N/A') . "\n";
        $docContent .= "Start Date: " . ($contract['start_date'] ?? 'N/A') . "\n";
        $docContent .= "Rate: " . ($contract['rate'] ?? '0') . " " . ($contract['currency_code'] ?? 'USD') . "\n";
        $docContent .= "\nScope of Work:\n" . ($contract['scope_of_work'] ?? 'See attached details.') . "\n";
        $docContent .= "\n\nSignatures:\n\n__________________________\n" . ($contract['user_name'] ?? 'Contractor');
        
        return $docContent;
    }

    private function plainText(string $html): string
    {
        $html = str_ireplace(['<div>', '</div>'], ["\n", ''], $html);
        $html = preg_replace('/<br\s*\/?>/i', "\n", $html);
        $html = str_ireplace(
            ['</p>', '</h1>', '</h2>', '</h3>', '</h4>', '</li>', '</ul>', '</ol>', '</blockquote>', '<hr>', '<hr/>', '<hr />'],
            "\n",
            $html
        );
        $text = strip_tags($html);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace("/\r\n?/", "\n", $text);
        $text = preg_replace("/\n{3,}/", "\n\n", $text);
        return trim($text);
    }

    /**
     * Dispara las automatizaciones tras una firma (contrato activo / enmienda aplicada).
     * Lo usa el portal público de firma (SignatureController).
     */
    public function handleSignedEnvelope(string $envelopeId): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM docusign_envelopes WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $envelopeId]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$item) {
            return;
        }
        if (!empty($item['amendment_id'])) {
            $this->handleAmendmentSigned($item['amendment_id']);
        } else {
            $this->handleContractSigned($item['contract_id']);
        }
    }

    public function attachLinks(array &$row): void
    {
        $token = $row['sign_token'] ?? null;
        if ($token) {
            $row['signing_url'] = $this->signingUrl($token);
            if (!empty($row['signed_pdf'])) {
                $row['pdf_url'] = $this->pdfUrl($token);
            }
        }
    }

    private function signingUrl(string $token): string
    {
        return $this->baseUrl() . '/sign/' . $token;
    }

    private function pdfUrl(string $token): string
    {
        return $this->apiBaseUrl() . '/api/sign/' . $token . '/pdf';
    }

    private function baseUrl(): string
    {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        return $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    }

    private function apiBaseUrl(): string
    {
        $base = $this->baseUrl();
        $script = $_SERVER['SCRIPT_NAME'] ?? '';
        if (strpos($script, '/public/') !== false) {
            return $base . str_replace('/index.php', '', $script);
        }
        return $base;
    }

    private function newSignToken(): string
    {
        return bin2hex(random_bytes(32));
    }

    private function uuid(): string
    {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
}
