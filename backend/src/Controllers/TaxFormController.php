<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class TaxFormController
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
            CREATE TABLE IF NOT EXISTS tax_forms (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                type ENUM('w8ben', 'w9') NOT NULL,
                data JSON NOT NULL,
                status ENUM('draft', 'submitted', 'verified', 'rejected') DEFAULT 'draft',
                signed_at DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (user_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/tax-forms
        // /api/tax-forms/my
        // /api/tax-forms/submit
        // /api/tax-forms/{id}/pdf

        $action = $segments[2] ?? null;
        $id = $segments[3] ?? null;

        if ($method === 'GET' && $action === 'my') {
            $this->getMyForm(Auth::userId());
        } elseif ($method === 'GET' && !$action) {
             // Admin List
             $this->index();
        } elseif ($method === 'POST' && $action === 'submit') {
            $this->submit();
        } elseif ($method === 'GET' && $id && $segments[4] === 'pdf') {
            $this->downloadPdf($id);
        } else {
            Response::error('Ruta no encontrada', 404);
        }
    }

    public function index(): void
    {
        // Admin check
        $user = Auth::user();
        if (!in_array($user['platform_role'], ['admin', 'super_admin', 'finance'])) {
            Response::error('Unauthorized', 403);
            return;
        }

        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;
        
        $status = $_GET['status'] ?? null;
        $type = $_GET['type'] ?? null;

        $sql = "SELECT t.*, u.full_name, u.email FROM tax_forms t JOIN users u ON t.user_id LIKE u.id WHERE 1=1";
        $params = [];

        if ($status) {
            $sql .= " AND t.status LIKE :status";
            $params[':status'] = $status;
        }
        if ($type) {
            $sql .= " AND t.type LIKE :type";
            $params[':type'] = $type;
        }

        $sql .= " ORDER BY t.created_at DESC LIMIT :limit OFFSET :offset";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Count total
        $countSql = "SELECT COUNT(*) FROM tax_forms t WHERE 1=1";
        if ($status) $countSql .= " AND t.status LIKE :status";
        if ($type) $countSql .= " AND t.type LIKE :type";
        
        $countStmt = $this->pdo->prepare($countSql);
        foreach ($params as $k => $v) {
            $countStmt->bindValue($k, $v);
        }
        $countStmt->execute();
        $total = (int)$countStmt->fetchColumn();

        Response::json([
            'data' => $data,
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => ceil($total / $limit)
            ]
        ]);
    }

    public function getMyForm(string $userId): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM tax_forms WHERE user_id LIKE ? ORDER BY created_at DESC LIMIT 1");
        $stmt->execute([$userId]);
        $form = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($form) {
            $form['data'] = json_decode($form['data'], true);
        }

        Response::json($form);
    }

    public function submit(): void
    {
        $userId = Auth::userId();
        $input = json_decode(file_get_contents('php://input'), true);

        if (empty($input['type']) || empty($input['data'])) {
            Response::error('Faltan datos requeridos', 400);
            return;
        }

        if (!in_array($input['type'], ['w8ben', 'w9'])) {
            Response::error('Tipo de formulario inválido', 400);
            return;
        }

        // Generate ID
        $id = $this->uuid();
        
        // If "signed" is true in data, set status to submitted and signed_at
        $status = 'submitted';
        $signedAt = date('Y-m-d H:i:s');

        $stmt = $this->pdo->prepare("
            INSERT INTO tax_forms (id, user_id, type, data, status, signed_at)
            VALUES (:id, :user_id, :type, :data, :status, :signed_at)
        ");

        $stmt->execute([
            ':id' => $id,
            ':user_id' => $userId,
            ':type' => $input['type'],
            ':data' => json_encode($input['data']),
            ':status' => $status,
            ':signed_at' => $signedAt
        ]);

        Response::json(['message' => 'Formulario enviado correctamente', 'id' => $id]);
    }

    public function downloadPdf(string $id): void
    {
        // Simple HTML view for PDF printing
        // Solo el dueño del formulario o roles con acceso amplio pueden descargar
        $userId = Auth::userId();
        if (!$userId) {
            http_response_code(401);
            echo "No autenticado";
            exit;
        }

        $user = Auth::user();
        $role = strtolower((string)($user['platform_role'] ?? ''));

        $wideAccess = in_array($role, ['super_admin', 'admin', 'finance', 'legal'], true);
        $stmt = $this->pdo->prepare("SELECT * FROM tax_forms WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $form = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$form) {
            http_response_code(404);
            echo "Formulario no encontrado";
            exit;
        }

        if (!$wideAccess && (string)($form['user_id'] ?? '') !== (string)$userId) {
            http_response_code(403);
            echo "No tienes permiso para ver este formulario";
            exit;
        }

        $data = json_decode($form['data'], true);
        $isW9 = $form['type'] === 'w9';
        
        header('Content-Type: text/html');
        ?>
        <!DOCTYPE html>
        <html>
        <head>
            <title>Tax Form <?php echo strtoupper($form['type']); ?></title>
            <style>
                body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; }
                .header { border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px; }
                .title { font-size: 24px; font-weight: bold; }
                .row { margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
                .label { font-weight: bold; display: block; margin-bottom: 5px; color: #555; }
                .value { font-size: 16px; }
                .signature-box { margin-top: 50px; border: 2px solid #000; padding: 20px; background: #f9f9f9; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">Form <?php echo $isW9 ? 'W-9' : 'W-8BEN'; ?></div>
                <p><?php echo $isW9 ? 'Request for Taxpayer Identification Number and Certification' : 'Certificate of Foreign Status of Beneficial Owner for United States Tax Withholding and Reporting'; ?></p>
            </div>

            <?php foreach ($data as $key => $value): ?>
                <?php if ($key === 'signature') continue; ?>
                <div class="row">
                    <span class="label"><?php echo ucwords(str_replace('_', ' ', $key)); ?></span>
                    <span class="value"><?php echo htmlspecialchars(is_string($value) ? $value : json_encode($value)); ?></span>
                </div>
            <?php endforeach; ?>

            <div class="signature-box">
                <div class="label">Electronic Signature</div>
                <div class="value" style="font-family: 'Courier New', monospace; font-size: 18px;"><?php echo htmlspecialchars($data['signature'] ?? ''); ?></div>
                <div class="label" style="margin-top: 10px">Date</div>
                <div class="value"><?php echo $form['signed_at']; ?></div>
            </div>
            
            <script>window.print();</script>
        </body>
        </html>
        <?php
        exit;
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
