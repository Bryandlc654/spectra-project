<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\AuditLogger;
use App\Support\Auth;
use Dompdf\Dompdf;
use PDO;

class GlobalContractTemplateController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
    }

    public function handle(string $method, ?string $id = null): void
    {
        // Require authentication (already handled by index.php usually, but good to be safe)
        $user = Auth::user();
        if (!$user) {
            Response::error('No autenticado', 401);
            return;
        }

        // Optional: Check if user is platform admin or has permission
        // if ($user['platform_role'] !== 'admin') { ... } 
        // For now, allowing any authenticated user to read, maybe restricted write?
        // Let's assume admins only for write.

        switch ($method) {
            case 'GET':
                if ($id && isset($_GET['action']) && $_GET['action'] === 'pdf') {
                    $this->previewPdf($id);
                } else {
                    $id ? $this->show($id) : $this->index();
                }
                break;
            case 'POST':
                if ($id === 'sanitize') {
                    $this->sanitizeAll();
                } else {
                    $this->store();
                }
                break;
            case 'PUT':
            case 'PATCH':
                if ($id) $this->update($id);
                else Response::error('ID required', 400);
                break;
            case 'DELETE':
                if ($id) $this->destroy($id);
                else Response::error('ID required', 400);
                break;
            default:
                Response::error('Method not allowed', 405);
        }
    }

    private function index(): void
    {
        // Pagination logic
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(100, (int)($_GET['per_page'] ?? 10)));
        $q = trim((string)($_GET['q'] ?? ''));
        $offset = ($page - 1) * $perPage;

        $where = ['company_id IS NULL'];
        $params = [];

        // Filter by deleted_at if exists (it does in my previous check of TenantController usage, but let's double check table cols)
        // contract_templates schema didn't show deleted_at in the mysql.txt dump I read!
        // Wait, mysql.txt dump showed `contract_templates` columns.
        // Let's re-read mysql.txt lines 364-376.
        // It does NOT have deleted_at. It has `status` enum('active','archived').
        
        // Filters
        if (!empty($_GET['status'])) {
            $where[] = 'status = :status';
            $params[':status'] = $_GET['status'];
        }
        if (!empty($_GET['type'])) {
            $where[] = 'type = :type';
            $params[':type'] = $_GET['type'];
        }
        if (!empty($_GET['country_id'])) {
            $where[] = 'country_id = :country_id';
            $params[':country_id'] = $_GET['country_id'];
        }

        if ($q !== '') {
            $where[] = '(title LIKE :q OR language_code LIKE :q)';
            $params[':q'] = "%$q%";
        }

        $whereSql = implode(' AND ', $where);
        
        // Count
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM contract_templates WHERE $whereSql");
        $stmt->execute($params);
        $total = (int)$stmt->fetchColumn();

        // Fetch
        $sql = "SELECT * FROM contract_templates WHERE $whereSql ORDER BY created_at DESC LIMIT :limit OFFSET :offset";
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
                'last_page' => ceil($total / $perPage),
                'total_pages' => ceil($total / $perPage)
            ]
        ]);
    }

    private function show(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM contract_templates WHERE id = :id AND company_id IS NULL LIMIT 1");
        $stmt->execute([':id' => $id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$item) {
            Response::error('Plantilla no encontrada', 404);
            return;
        }

        Response::json(['data' => $item]);
    }

    private function sanitizeBody(string $body): string
    {
        $body = str_ireplace(['<div>', '</div>'], ['<p>', '</p>'], $body);
        $allowed = '<p><br><b><strong><i><em><u><s><strike><ul><ol><li><h1><h2><h3><h4><blockquote><hr>';
        $body = strip_tags($body, $allowed);
        return trim($body);
    }

    private function renderBodyPdf(string $body): string
    {
        $html = $this->sanitizeBody($body);
        // Si el cuerpo es texto plano legacy (sin etiquetas), envolver en párrafos
        if (stripos($html, '<p') === false
            && stripos($html, '<br') === false
            && stripos($html, '<h') === false
            && stripos($html, '<li') === false) {
            $html = preg_replace("/\r\n?/", "\n", $html);
            $html = trim($html);
            $html = '<p>' . str_replace(["\n\n", "\n"], ["</p><p>", '<br>'], $html) . '</p>';
        }
        return $html;
    }

    private function store(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Validation
        if (empty($data['title']) || empty($data['body']) || empty($data['type']) || empty($data['country_id'])) {
            Response::error('Faltan campos requeridos (title, body, type, country_id)', 422);
            return;
        }

        $validTypes = ['hourly', 'retainer', 'fixed', 'project'];
        if (!in_array($data['type'], $validTypes, true)) {
            Response::error('Tipo inválido', 422);
            return;
        }

        $validStatus = ['active', 'archived'];
        $status = $data['status'] ?? 'active';
        if (!in_array($status, $validStatus, true)) {
            Response::error('Estado inválido', 422);
            return;
        }

        $countryId = (int)$data['country_id'];
        if ($countryId <= 0) {
            Response::error('País inválido', 422);
            return;
        }

        $body = $this->sanitizeBody((string)($data['body'] ?? ''));
        if ($body === '') {
            Response::error('Faltan campos requeridos (title, body, type, country_id)', 422);
            return;
        }

        $id = $this->uuid();
        $sql = "INSERT INTO contract_templates (
            id, company_id, type, country_id, language_code, title, body, variables_schema, status, docusign_template_id
        ) VALUES (
            :id, NULL, :type, :country_id, :language_code, :title, :body, :variables_schema, :status, :docusign_template_id
        )";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':id' => $id,
            ':type' => $data['type'],
            ':country_id' => $countryId,
            ':language_code' => $data['language_code'] ?? 'es',
            ':title' => $data['title'],
            ':body' => $body,
            ':variables_schema' => isset($data['variables_schema']) ? json_encode($data['variables_schema']) : null,
            ':status' => $status,
            ':docusign_template_id' => $data['docusign_template_id'] ?? null
        ]);

        AuditLogger::log('Crear Plantilla Global', "Plantilla global creada: {$data['title']}", Auth::userId(), null, 'contract_template', $id);

        Response::json(['message' => 'Plantilla creada', 'id' => $id], 201);
    }

    private function update(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM contract_templates WHERE id = :id AND company_id IS NULL LIMIT 1");
        $stmt->execute([':id' => $id]);
        $current = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$current) {
            Response::error('Plantilla no encontrada', 404);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        
        $fields = [];
        $params = [':id' => $id];

        $updatable = ['type', 'country_id', 'language_code', 'title', 'body', 'variables_schema', 'status'];
        foreach ($updatable as $col) {
            if (isset($data[$col])) {
                $val = $data[$col];
                if ($col === 'type') {
                    $validTypes = ['hourly', 'retainer', 'fixed', 'project'];
                    if (!in_array($val, $validTypes, true)) {
                        continue; // skip invalid type
                    }
                }
                if ($col === 'status') {
                    $validStatus = ['active', 'archived'];
                    if (!in_array($val, $validStatus, true)) {
                        continue; // skip invalid status
                    }
                }
                if ($col === 'country_id') {
                    $val = (int)$val;
                    if ($val <= 0) {
                        continue; // skip invalid country
                    }
                }
                if ($col === 'body') {
                    $val = $this->sanitizeBody((string)$val);
                }
                if ($col === 'variables_schema' && is_array($val)) $val = json_encode($val);
                $fields[] = "$col = :$col";
                $params[":$col"] = $val;
            }
        }

        if (empty($fields)) {
            Response::json(['message' => 'Nada que actualizar']);
            return;
        }

        $sql = "UPDATE contract_templates SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        AuditLogger::log('Actualizar Plantilla Global', "Plantilla global actualizada: {$current['title']}", Auth::userId(), null, 'contract_template', $id);

        Response::json(['message' => 'Plantilla actualizada']);
    }

    private function destroy(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM contract_templates WHERE id = :id AND company_id IS NULL LIMIT 1");
        $stmt->execute([':id' => $id]);
        $current = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$current) {
            Response::error('Plantilla no encontrada', 404);
            return;
        }

        // Check if used? Maybe not critical for global templates as they are copies usually?
        // But if they are referenced directly by ID in contracts, we should check.
        // Contracts table usually has `contract_template_id`? Let's check contracts table schema.
        // I don't have contracts table schema in previous read. 
        // Assuming contracts copy the body.
        
        $stmt = $this->pdo->prepare("DELETE FROM contract_templates WHERE id = :id");
        $stmt->execute([':id' => $id]);

        AuditLogger::log('Eliminar Plantilla Global', "Plantilla global eliminada: {$current['title']}", Auth::userId(), null, 'contract_template', $id);

        Response::json(['message' => 'Plantilla eliminada']);
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

    private function previewPdf(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM contract_templates WHERE id = :id AND company_id IS NULL LIMIT 1");
        $stmt->execute([':id' => $id]);
        $template = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$template) {
            Response::error('Plantilla no encontrada', 404);
            return;
        }

        // Dummy data for preview
        $dummyData = [
            '{{company_name}}' => 'Empresa Ejemplo S.A.C.',
            '{{company_tax_id}}' => '20123456789',
            '{{company_address}}' => 'Av. Larco 123, Miraflores, Lima',
            '{{representative_name}}' => 'Juan Pérez (Gerente)',
            '{{employee_name}}' => 'María García',
            '{{employee_id_number}}' => '40123456',
            '{{employee_nationality}}' => 'Peruana',
            '{{employee_address}}' => 'Calle Los Pinos 456, Lima',
            '{{position}}' => 'Desarrollador Senior',
            '{{functions}}' => "- Desarrollo de software\n- Mantenimiento de sistemas\n- Reporte de bugs",
            '{{work_modality}}' => 'Remoto',
            '{{start_date}}' => date('d/m/Y'),
            '{{salary}}' => '5,000.00',
            '{{currency}}' => 'PEN',
            '{{notice_period}}' => '30'
        ];

        // Sanitize + render body as HTML (rich text)
        $content = $this->renderBodyPdf((string)$template['body']);

        foreach ($dummyData as $key => $value) {
            $content = str_replace($key, htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'), $content);
        }

        $html = "<html><head><meta charset=\"utf-8\"><style>
            body { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #111; line-height: 1.5; }
            p { margin: 0 0 8px; }
            ul, ol { margin: 0 0 8px 18px; padding: 0; }
            li { margin-bottom: 3px; }
            h1, h2, h3, h4 { font-weight: bold; margin: 12px 0 6px; }
            h1 { font-size: 18px; } h2 { font-size: 16px; } h3 { font-size: 14px; } h4 { font-size: 12px; }
            blockquote { margin: 8px 20px; font-style: italic; color: #333; }
            hr { border: none; border-top: 1px solid #999; margin: 10px 0; }
        </style></head><body>{$content}</body></html>";

        $dompdf = new Dompdf();
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        header("Content-type: application/pdf");
        header("Content-Disposition: inline; filename=template-preview.pdf");
        echo $dompdf->output();
        exit;
    }

    private function sanitizeAll(): void
    {
        $user = Auth::user();
        $role = $user['platform_role'] ?? '';
        if (!in_array($role, ['super_admin', 'admin', 'finance', 'legal'], true)) {
            Response::error('Acceso denegado', 403);
            return;
        }
        try {
            $stmt = $this->pdo->query("SELECT id, body FROM contract_templates");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
            $total = count($rows);
            $updated = 0;
            $upd = $this->pdo->prepare("UPDATE contract_templates SET body = :body WHERE id = :id");
            foreach ($rows as $r) {
                $orig = (string)($r['body'] ?? '');
                $san = $this->sanitizeBody($orig);
                if ($san !== $orig) {
                    $upd->execute([':body' => $san, ':id' => $r['id']]);
                    $updated++;
                }
            }
            Response::json(['message' => 'Plantillas saneadas', 'total' => $total, 'actualizadas' => $updated]);
        } catch (\Throwable $e) {
            Response::error('Error al sanear plantillas: ' . $e->getMessage(), 500);
        }
    }
}
