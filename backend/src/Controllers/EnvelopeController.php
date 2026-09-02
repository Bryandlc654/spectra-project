<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use App\Services\DocuSignService;
use PDO;

class EnvelopeController
{
    private PDO $pdo;
    private DocuSignService $docusign;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->docusign = new DocuSignService();
        $this->ensureTables();
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
                ct.title as contract_title,
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
                ct.title as contract_title,
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

        // Check Provider
        $provider = $item['provider'] ?? 'docusign';
        if ($provider === 'local') {
            Response::json(['message' => 'Local envelope managed manually', 'status' => $item['status']]);
            return;
        }

        try {
            $status = $this->docusign->getEnvelopeStatus($item['envelope_id']);
            
            // Update envelope status
            $stmt = $this->pdo->prepare("UPDATE docusign_envelopes SET status = :status, last_event_at = NOW() WHERE id LIKE :id");
            $stmt->execute([':status' => $status, ':id' => $id]);

            // AUTOMATION: If status is 'completed' (Signed)
            if ($status === 'completed') {
                if (!empty($item['amendment_id'])) {
                    $this->handleAmendmentSigned($item['amendment_id']);
                } else {
                    $this->handleContractSigned($item['contract_id']);
                }
            }

            Response::json(['message' => 'Sincronización exitosa', 'status' => $status]);
        } catch (\Exception $e) {
            // Fallback for simulation or error
            $this->pdo->prepare("UPDATE docusign_envelopes SET last_event_at = NOW() WHERE id LIKE :id")->execute([':id' => $id]);
            Response::json(['message' => 'Sincronización simulada (API Error: ' . $e->getMessage() . ')']);
        }
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

        if (($item['provider'] ?? 'docusign') !== 'local') {
            Response::error('Only local envelopes can be signed via this endpoint', 400);
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

        $docBase64 = base64_encode($docContent);

        // 3. Create Envelope
        $provider = 'docusign';
        $envelopeId = null;
        $errorMsg = null;

        try {
            if ($this->docusign->isConfigured()) {
                $envelopeId = $this->docusign->createEnvelope(
                    [[
                        'name' => 'Amendment_' . $amendmentId . '.txt', 
                        'file_base64' => $docBase64, 
                        'file_extension' => 'txt'
                    ]],
                    [[
                        'email' => $amendment['user_email'] ?? 'demo@example.com',
                        'name' => $amendment['user_name'] ?? 'Signer',
                        'recipientId' => '1'
                    ]],
                    'Please sign the amendment for ' . ($amendment['title'] ?? 'Contract')
                );
            } else {
                $provider = 'local';
            }
        } catch (\Exception $e) {
            $errorMsg = $e->getMessage();
            $provider = 'local';
        }

        if ($provider === 'local') {
            $envelopeId = 'LOC-' . $this->uuid();
        }

        try {
            $id = $this->uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO docusign_envelopes (id, contract_id, amendment_id, envelope_id, status, last_event_at, provider)
                VALUES (:id, :cid, :aid, :eid, 'sent', NOW(), :provider)
            ");
            $stmt->execute([
                ':id' => $id,
                ':cid' => $amendment['contract_id'],
                ':aid' => $amendmentId,
                ':eid' => $envelopeId,
                ':provider' => $provider
            ]);
            
            // Update Amendment status
            $this->pdo->prepare("UPDATE contract_amendments SET status = 'sent', envelope_id = :eid WHERE id LIKE :id")
                 ->execute([':eid' => $envelopeId, ':id' => $amendmentId]);

            Response::json([
                'message' => $provider === 'local' ? 'Amendment envelope created locally (Fallback)' : 'Amendment envelope sent',
                'envelope_id' => $envelopeId,
                'provider' => $provider,
                'warning' => $errorMsg
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

        $provider = 'docusign';
        $envelopeId = null;
        $errorMsg = null;

        try {
            if ($this->docusign->isConfigured()) {
                if (!empty($contract['docusign_template_id'])) {
                    // Create Envelope from Template
                    $envelopeId = $this->docusign->createEnvelopeFromTemplate(
                        $contract['docusign_template_id'],
                        [[
                            'email' => $contract['user_email'] ?? 'demo@example.com',
                            'name' => $contract['user_name'] ?? 'Signer',
                            'roleName' => 'Signer',
                            'clientUserId' => (string)($contract['freelancer_id'] ?? $contract['user_id'] ?? '1001')
                        ]],
                        'Please sign your contract with ' . ($contract['company_name'] ?? 'Spectra')
                    );
                } else {
                    // Prepare Document Content
                    $docContent = $this->generateContractDocument($contract);
                    $docBase64 = base64_encode($docContent);

                    // Create Envelope via Service
                    $envelopeId = $this->docusign->createEnvelope(
                        [[
                            'name' => 'Contract_' . $contractId . '.txt', 
                            'file_base64' => $docBase64, 
                            'file_extension' => 'txt'
                        ]],
                        [[
                            'email' => $contract['user_email'] ?? 'demo@example.com',
                            'name' => $contract['user_name'] ?? 'Signer',
                            'recipientId' => '1',
                            'clientUserId' => (string)($contract['freelancer_id'] ?? $contract['user_id'] ?? '1001')
                        ]],
                        'Please sign your contract with ' . ($contract['company_name'] ?? 'Spectra')
                    );
                }
            } else {
                $provider = 'local';
            }
        } catch (\Exception $e) {
            $errorMsg = $e->getMessage();
            $provider = 'local';
        }

        if ($provider === 'local') {
            $envelopeId = 'LOC-' . $this->uuid();
        }

        try {
            // Save Envelope Record
            $id = $this->uuid();
            $stmt = $this->pdo->prepare("
                INSERT INTO docusign_envelopes (id, contract_id, envelope_id, status, last_event_at, provider)
                VALUES (:id, :cid, :eid, 'sent', NOW(), :provider)
            ");
            $stmt->execute([
                ':id' => $id,
                ':cid' => $contractId,
                ':eid' => $envelopeId,
                ':provider' => $provider
            ]);

            // Update contract status to pending
            $stmt = $this->pdo->prepare("UPDATE contracts SET status = 'pending' WHERE id LIKE :id");
            $stmt->execute([':id' => $contractId]);

            Response::json([
                'message' => $provider === 'local' ? 'Contract envelope created locally (Fallback)' : 'Contract envelope created',
                'envelope_id' => $envelopeId,
                'provider' => $provider,
                'warning' => $errorMsg
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
        } else {
            $contract = $this->getContractDetails($envelope['contract_id']);
            if (!$contract) {
                Response::error('Contract not found', 404);
                return;
            }

            try {
                $clientUserId = (string)($contract['freelancer_id'] ?? $contract['user_id'] ?? '1001');
                // Use a default return URL for now - can be updated to environment variable later
                $returnUrl = 'http://localhost:5173/signing-complete'; 

                $url = $this->docusign->createRecipientView(
                    $envelope['envelope_id'],
                    $contract['user_name'] ?? 'Signer',
                    $contract['user_email'] ?? 'demo@example.com',
                    $clientUserId,
                    $returnUrl
                );

                Response::json([
                    'provider' => 'docusign',
                    'url' => $url
                ]);
            } catch (\Exception $e) {
                Response::json([
                    'message' => 'This is a DocuSign envelope. Please check your email to sign.',
                    'provider' => 'docusign',
                    'status' => $envelope['status'],
                    'error' => $e->getMessage()
                ]);
            }
        }
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
            $docContent = preg_replace('/<br\s*\/?>/i', "\n", $docContent);
            $docContent = strip_tags((string)$docContent);
            $docContent = html_entity_decode((string)$docContent, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $docContent = preg_replace("/\r\n?/", "\n", $docContent);
            $docContent = trim((string)$docContent);
            
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
                $docContent = str_replace($key, (string)$val, $docContent);
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
