<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use App\Support\AuditLogger;
use PDO;

class KybController
{
    private PDO $pdo;
    private AuditLogger $audit;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->audit = new AuditLogger($this->pdo);
        $this->ensureTable();
    }

    private function ensureTable(): void
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
    }

    public function handle(array $segments, string $method)
    {
        // /api/kyb
        // /api/kyb/{id}
        // /api/kyb/{id}/approve
        // /api/kyb/{id}/reject
        // /api/kyb/{id}/reopen
        // /api/kyb/{id}/documents/{attId}/download

        $id = $segments[2] ?? null;
        $action = $segments[3] ?? null;
        $subId = $segments[4] ?? null;
        $subAction = $segments[5] ?? null;

        if (!$this->requireKybManager()) return;

        if ($id && $action === 'documents' && $subId && $subAction === 'download' && $method === 'GET') {
            $this->downloadDocument($id, $subId);
            return;
        }

        if ($id && $action === 'approve' && $method === 'POST') {
            $this->approve($id);
            return;
        }

        if ($id && $action === 'reject' && $method === 'POST') {
            $this->reject($id);
            return;
        }

        if ($id && $action === 'reopen' && $method === 'POST') {
            $this->reopen($id);
            return;
        }

        if ($id && $method === 'GET') {
            $this->show($id);
            return;
        }

        if (!$id && $method === 'GET') {
            $this->index();
            return;
        }

        // Create KYB request? Maybe POST /api/kyb
        if (!$id && $method === 'POST') {
            $this->store();
            return;
        }

        Response::error('Ruta no encontrada', 404);
    }

    private function requireKybManager(): bool
    {
        $user = Auth::user();
        if (!in_array($user['platform_role'] ?? '', ['super_admin', 'admin', 'legal', 'security'], true)) {
            Response::error('Acceso denegado', 403);
            return false;
        }
        return true;
    }

    private function index()
    {
        $status = $_GET['status'] ?? null;
        $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;
        
        $baseSql = "FROM kyb_requests k JOIN companies c ON k.company_id = c.id WHERE 1=1";
        $params = [];
        
        if ($status) {
            $baseSql .= " AND k.status = :status";
            $params[':status'] = $status;
        }

        // Count
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) " . $baseSql);
        $countStmt->execute($params);
        $total = $countStmt->fetchColumn();
        
        // Fetch
        $sql = "
            SELECT k.*, c.legal_name as company_name, c.trade_name 
            " . $baseSql . "
            ORDER BY k.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        
        // Bind named params
        foreach ($params as $key => $val) {
            $stmt->bindValue($key, $val);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Decode documents for list? maybe not needed, but safe
        foreach ($items as &$item) {
            $item['documents'] = json_decode($item['documents'] ?? '[]', true);
        }

        Response::json([
            'data' => $items,
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ]);
    }

    private function show(string $id)
    {
        $stmt = $this->pdo->prepare("
            SELECT k.*, c.legal_name as company_name, c.trade_name,
                   u.full_name as reviewer_name
            FROM kyb_requests k
            JOIN companies c ON k.company_id = c.id
            LEFT JOIN users u ON k.reviewed_by_user_id = u.id
            WHERE k.id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$item) {
            Response::error('KYB Request no encontrado', 404);
            return;
        }

        $documents = [];

        $stmt = $this->pdo->prepare("
            SELECT a.*
            FROM attachment_links al
            JOIN attachments a ON a.id = al.attachment_id
            WHERE al.object_type = 'kyb_request' AND al.object_id = :kid
            ORDER BY a.created_at DESC
        ");
        $stmt->execute([':kid' => $item['id']]);
        $documents = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach (json_decode($item['documents'] ?? '[]', true) as $doc) {
            $documents[] = is_string($doc) ? ['url' => $doc] : $doc;
        }

        $item['documents'] = $documents;
        $this->hydrateReviewDates($item);
        Response::json(['data' => $item]);
    }

    private function hydrateReviewDates(array &$item): void
    {
        if ($item['status'] === 'approved') {
            $item['approved_at'] = $item['reviewed_at'] ?? null;
        }
        if ($item['status'] === 'rejected') {
            $item['rejected_at'] = $item['reviewed_at'] ?? null;
        }
    }

    private function store()
    {
        // Allow creating a request manually or by system
        $data = json_decode(file_get_contents('php://input'), true);
        $companyId = $data['company_id'] ?? null;
        
        if (!$companyId) {
            Response::error('company_id requerido', 400);
            return;
        }

        // Check if pending exists
        $stmt = $this->pdo->prepare("SELECT id FROM kyb_requests WHERE company_id = ? AND (status = 'pending' OR status = 'pending_review')");
        $stmt->execute([$companyId]);
        if ($stmt->fetch()) {
            Response::error('Ya existe una solicitud pendiente para esta empresa', 409);
            return;
        }

        $id = $this->uuid();
        $docs = json_encode($data['documents'] ?? []);

        $stmt = $this->pdo->prepare("
            INSERT INTO kyb_requests (id, company_id, status, documents, created_at)
            VALUES (:id, :cid, 'pending_review', :docs, NOW())
        ");
        $stmt->execute([':id' => $id, ':cid' => $companyId, ':docs' => $docs]);

        $this->audit->log('kyb.created', 'company', $companyId, ['kyb_id' => $id]);

        Response::json(['message' => 'Solicitud KYB creada', 'id' => $id], 201);
    }

    private function approve(string $id)
    {
        $stmt = $this->pdo->prepare("SELECT * FROM kyb_requests WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$req) {
            Response::error('Solicitud no encontrada', 404);
            return;
        }

        if ($req['status'] !== 'pending' && $req['status'] !== 'pending_review') {
            Response::error('La solicitud no está pendiente', 400);
            return;
        }

        $userId = Auth::userId();

        $stmt = $this->pdo->prepare("
            UPDATE kyb_requests 
            SET status = 'approved', reviewed_by_user_id = :uid, reviewed_at = NOW() 
            WHERE id = :id
        ");
        $stmt->execute([':uid' => $userId, ':id' => $id]);

        // Optional: Update company status to 'active' or 'verified' if you have such flag
        // $stmt = $this->pdo->prepare("UPDATE companies SET kyb_status = 'verified' WHERE id = ?"); ...

        $this->audit->log('kyb.approved', 'company', $req['company_id'], ['kyb_id' => $id]);

        Response::json(['message' => 'Solicitud Aprobada']);
    }

    private function reject(string $id)
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $reason = trim($data['reason'] ?? '');

        if (empty($reason)) {
            Response::error('El motivo de rechazo es obligatorio', 400);
            return;
        }

        $stmt = $this->pdo->prepare("SELECT * FROM kyb_requests WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$req) {
            Response::error('Solicitud no encontrada', 404);
            return;
        }

        if ($req['status'] !== 'pending' && $req['status'] !== 'pending_review') {
            Response::error('La solicitud no está pendiente', 400);
            return;
        }

        $userId = Auth::userId();

        $stmt = $this->pdo->prepare("
            UPDATE kyb_requests 
            SET status = 'rejected', 
                rejection_reason = :reason,
                reviewed_by_user_id = :uid, 
                reviewed_at = NOW() 
            WHERE id = :id
        ");
        $stmt->execute([':reason' => $reason, ':uid' => $userId, ':id' => $id]);

        $this->audit->log('kyb.rejected', 'company', $req['company_id'], ['kyb_id' => $id, 'reason' => $reason]);

        Response::json(['message' => 'Solicitud Rechazada']);
    }

    private function reopen(string $id)
    {
        $stmt = $this->pdo->prepare("SELECT * FROM kyb_requests WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$req) {
            Response::error('Solicitud no encontrada', 404);
            return;
        }

        if (!in_array($req['status'], ['rejected', 'more_info_required'], true)) {
            Response::error('Solo se puede reabrir una solicitud rechazada o pendiente de más información', 400);
            return;
        }

        $stmt = $this->pdo->prepare("
            UPDATE kyb_requests 
            SET status = 'pending_review',
                rejection_reason = NULL,
                reviewed_by_user_id = NULL,
                reviewed_at = NULL
            WHERE id = :id
        ");
        $stmt->execute([':id' => $id]);

        $this->audit->log('kyb.reopened', 'company', $req['company_id'], ['kyb_id' => $id]);

        Response::json(['message' => 'Solicitud reabierta para revisión']);
    }

    private function downloadDocument(string $kybId, string $attachmentId)
    {
        $stmt = $this->pdo->prepare("SELECT company_id FROM kyb_requests WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $kybId]);
        $kyb = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$kyb) {
            Response::error('Solicitud KYB no encontrada', 404);
            return;
        }

        $stmt = $this->pdo->prepare("
            SELECT a.*
            FROM attachment_links al
            JOIN attachments a ON a.id = al.attachment_id
            WHERE al.object_type = 'kyb_request' AND al.object_id = :kid AND a.id = :aid
            LIMIT 1
        ");
        $stmt->execute([':kid' => $kybId, ':aid' => $attachmentId]);
        $att = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$att) {
            Response::error('Documento no encontrado', 404);
            return;
        }

        $filePath = __DIR__ . '/../../storage/' . ltrim((string)$att['object_key'], '/');
        $realRoot = realpath(__DIR__ . '/../../storage/');
        $realFile = realpath($filePath);

        if ($realFile === false || $realRoot === false || strpos($realFile, $realRoot) !== 0 || !is_file($realFile)) {
            Response::error('Archivo no encontrado', 404);
            return;
        }

        $filename = basename((string)$att['file_name']);

        header('Content-Type: ' . ($att['mime_type'] ?: 'application/octet-stream'));
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . (int)$att['size_bytes']);
        header('X-Content-Type-Options: nosniff');
        readfile($realFile);
        exit;
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
