<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;
use Exception;

class TimesheetController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
        $this->ensureExtensions();
    }

    private function ensureExtensions(): void
    {
        if (\App\Support\Cache::get('timesheet_extensions_v1') !== null) return;

        try {
            $this->migrateLegacyTimesheets();

            if ($this->tableExists('timesheets') && !$this->columnExists('timesheets', 'completion_status')) {
                $this->pdo->exec("ALTER TABLE timesheets ADD COLUMN completion_status ENUM('pending', 'completed') NOT NULL DEFAULT 'pending' AFTER status");
            }

            $this->pdo->exec("
                CREATE TABLE IF NOT EXISTS timesheet_attachments (
                    id CHAR(36) PRIMARY KEY,
                    timesheet_id CHAR(36) NOT NULL,
                    uploaded_by_user_id CHAR(36) NULL,
                    file_name VARCHAR(255) NOT NULL,
                    stored_name VARCHAR(255) NOT NULL,
                    mime_type VARCHAR(120) NULL,
                    size_bytes BIGINT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_timesheet (timesheet_id),
                    FOREIGN KEY (timesheet_id) REFERENCES timesheets(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            $this->pdo->exec("
                CREATE TABLE IF NOT EXISTS timesheet_comments (
                    id CHAR(36) PRIMARY KEY,
                    timesheet_id CHAR(36) NOT NULL,
                    user_id CHAR(36) NULL,
                    body TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_timesheet (timesheet_id),
                    FOREIGN KEY (timesheet_id) REFERENCES timesheets(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            \App\Support\Cache::set('timesheet_extensions_v1', time(), 86400 * 365);
        } catch (\Throwable $e) {
            error_log('[Timesheets] Extension migration failed: ' . $e->getMessage());
        }
    }

    private function migrateLegacyTimesheets(): void
    {
        if (!$this->tableExists('timesheets') || $this->columnExists('timesheets', 'period_start')) {
            return;
        }

        $countStmt = $this->pdo->query("SELECT COUNT(*) FROM timesheets");
        $rowCount = (int)($countStmt ? $countStmt->fetchColumn() : 0);

        if ($rowCount === 0) {
            $this->pdo->exec("SET FOREIGN_KEY_CHECKS=0");
            try {
                if (!$this->tableExists('timesheets_legacy_v1')) {
                    $this->pdo->exec("RENAME TABLE timesheets TO timesheets_legacy_v1");
                }
                if ($this->tableExists('timesheet_entries') && !$this->tableExists('timesheet_entries_legacy_v1')) {
                    $this->pdo->exec("RENAME TABLE timesheet_entries TO timesheet_entries_legacy_v1");
                }
            } finally {
                $this->pdo->exec("SET FOREIGN_KEY_CHECKS=1");
            }

            $this->ensureTables();
            return;
        }

        $columns = [
            "ADD COLUMN user_id CHAR(36) NULL AFTER company_id",
            "ADD COLUMN project_id CHAR(36) NULL AFTER user_id",
            "ADD COLUMN period_start DATE NULL AFTER project_id",
            "ADD COLUMN period_end DATE NULL AFTER period_start",
            "ADD COLUMN total_hours DECIMAL(10,2) DEFAULT 0 AFTER period_end",
            "ADD COLUMN notes TEXT NULL AFTER total_hours",
            "ADD COLUMN rejection_reason TEXT NULL AFTER notes",
        ];

        foreach ($columns as $definition) {
            try {
                $this->pdo->exec("ALTER TABLE timesheets " . $definition);
            } catch (Exception $e) { }
        }

        try {
            $this->pdo->exec("ALTER TABLE timesheets MODIFY assignment_id CHAR(36) NULL, MODIFY work_date DATE NULL, MODIFY hours DECIMAL(5,2) NULL");
        } catch (Exception $e) { }

        $this->pdo->exec("
            UPDATE timesheets SET
                period_start = COALESCE(period_start, work_date),
                period_end = COALESCE(period_end, work_date),
                total_hours = COALESCE(total_hours, hours, 0)
        ");

        try {
            $this->pdo->exec("
                UPDATE timesheets t
                LEFT JOIN assignments a ON t.assignment_id = a.id
                SET t.user_id = COALESCE(t.user_id, a.freelancer_id),
                    t.project_id = COALESCE(t.project_id, a.project_id)
            ");
        } catch (Exception $e) { }
    }

    private function tableExists(string $table): bool
    {
        $stmt = $this->pdo->query("SHOW TABLES LIKE " . $this->pdo->quote($table));
        return (bool)$stmt->fetchColumn();
    }

    private function columnExists(string $table, string $column): bool
    {
        $stmt = $this->pdo->query("SHOW COLUMNS FROM `{$table}` LIKE " . $this->pdo->quote($column));
        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    }

    private function getCompanyId(): ?string
    {
        $companyId = $_GET['company_id'] ?? null;
        if ($companyId) return $companyId;

        $userId = Auth::userId();
        if (!$userId) return null;

        $stmt = $this->pdo->prepare("SELECT company_id FROM company_users WHERE user_id = :uid LIMIT 1");
        $stmt->execute([':uid' => $userId]);
        return $stmt->fetchColumn() ?: null;
    }

    public function handle(array $segments, string $method): void
    {
        // Lazy migration for rejection_reason
        try {
            $this->pdo->exec("ALTER TABLE timesheets ADD COLUMN rejection_reason TEXT AFTER notes");
        } catch (Exception $e) { }

        // Lazy migration for entry details
        try {
            $this->pdo->exec("ALTER TABLE timesheet_entries ADD COLUMN start_time TIME NULL, ADD COLUMN end_time TIME NULL, ADD COLUMN break_time INT DEFAULT 0");
        } catch (Exception $e) { }

        $id = $segments[2] ?? null;

        if ($id) {
            // Handle sub-resources
            if (isset($segments[3]) && $segments[3] === 'entries') {
                if ($method === 'POST') {
                    $this->storeEntry($id);
                    return;
                }
            }

            if (isset($segments[3]) && $segments[3] === 'attachments') {
                $attachmentId = $segments[4] ?? null;
                $action = $segments[5] ?? null;

                if ($method === 'POST' && !$attachmentId) {
                    $this->uploadAttachment($id);
                    return;
                }
                if ($method === 'GET' && $attachmentId && $action === 'download') {
                    $this->downloadAttachment($id, $attachmentId);
                    return;
                }
                if ($method === 'DELETE' && $attachmentId) {
                    $this->deleteAttachment($id, $attachmentId);
                    return;
                }
            }

            if (isset($segments[3]) && $segments[3] === 'comments' && $method === 'POST') {
                $this->storeComment($id);
                return;
            }

            if ($method === 'GET') $this->show($id);
            elseif ($method === 'PUT' || $method === 'PATCH') $this->update($id);
            elseif ($method === 'DELETE') $this->delete($id);
            else Response::error('Method not allowed', 405);
            return;
        }

        if ($method === 'GET') $this->index();
        elseif ($method === 'POST') $this->store();
        else Response::error('Method not allowed', 405);
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS timesheets (
                id CHAR(36) PRIMARY KEY,
                company_id CHAR(36) NOT NULL,
                user_id CHAR(36) NOT NULL,
                project_id CHAR(36) NULL,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                total_hours DECIMAL(10, 2) DEFAULT 0,
                status ENUM('draft', 'submitted', 'approved', 'rejected') DEFAULT 'draft',
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_company (company_id),
                INDEX idx_user (user_id),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS timesheet_entries (
                id CHAR(36) PRIMARY KEY,
                timesheet_id CHAR(36) NOT NULL,
                date DATE NOT NULL,
                hours DECIMAL(5, 2) NOT NULL,
                description VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (timesheet_id) REFERENCES timesheets(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    private function index(): void
    {
        $companyId = $this->getCompanyId();
        if (!$companyId) {
            Response::error('company_id required', 400);
            return;
        }
        
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;

        // Count
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM timesheets WHERE company_id = :cid");
        $countStmt->execute([':cid' => $companyId]);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("SELECT * FROM timesheets WHERE company_id = :cid ORDER BY created_at DESC LIMIT :limit OFFSET :offset");
        $stmt->bindValue(':cid', $companyId);
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

    private function store(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $companyId = $data['company_id'] ?? $this->getCompanyId();
        $userId = $data['user_id'] ?? Auth::userId();

        if (!$companyId || !$userId) {
            Response::error('company_id and user_id required', 400);
            return;
        }
        
        $id = $this->uuid();
        $stmt = $this->pdo->prepare("
            INSERT INTO timesheets (id, company_id, user_id, project_id, period_start, period_end, status)
            VALUES (:id, :cid, :uid, :pid, :start, :end, 'draft')
        ");
        $stmt->execute([
            ':id' => $id,
            ':cid' => $companyId,
            ':uid' => $userId,
            ':pid' => $data['project_id'] ?? null,
            ':start' => $data['period_start'],
            ':end' => $data['period_end']
        ]);
        
        Response::json(['message' => 'Timesheet created', 'id' => $id], 201);
    }
    
    private function show(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM timesheets WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $ts = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$ts) { Response::error('Timesheet not found', 404); return; }
        
        $stmtEntries = $this->pdo->prepare("SELECT * FROM timesheet_entries WHERE timesheet_id = :tid ORDER BY date ASC, created_at ASC");
        $stmtEntries->execute([':tid' => $id]);
        $ts['entries'] = $stmtEntries->fetchAll(PDO::FETCH_ASSOC);

        $stmtAttachments = $this->pdo->prepare("
            SELECT a.*, COALESCE(u.full_name, u.email, 'Usuario') AS uploaded_by_name
            FROM timesheet_attachments a
            LEFT JOIN users u ON a.uploaded_by_user_id = u.id
            WHERE a.timesheet_id = :tid
            ORDER BY a.created_at DESC
        ");
        $stmtAttachments->execute([':tid' => $id]);
        $ts['attachments'] = $stmtAttachments->fetchAll(PDO::FETCH_ASSOC);

        $stmtComments = $this->pdo->prepare("
            SELECT c.*, COALESCE(u.full_name, u.email, 'Usuario') AS user_name
            FROM timesheet_comments c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.timesheet_id = :tid
            ORDER BY c.created_at ASC
        ");
        $stmtComments->execute([':tid' => $id]);
        $ts['comments'] = $stmtComments->fetchAll(PDO::FETCH_ASSOC);

        Response::json($ts);
    }

    private function update(string $id): void 
    {
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $fields = [];
        $params = [':id' => $id];

        if (isset($data['completion_status'])) {
            $completionStatus = (string)$data['completion_status'];
            if (!in_array($completionStatus, ['pending', 'completed'], true)) {
                Response::error('Estado de completitud inválido', 422);
                return;
            }
            $fields[] = "completion_status = :completion_status";
            $params[':completion_status'] = $completionStatus;
        }

        if (isset($data['status'])) {
            $status = (string)$data['status'];
            if (!in_array($status, ['draft', 'submitted', 'approved', 'rejected'], true)) {
                Response::error('Estado inválido', 422);
                return;
            }
            $fields[] = "status = :status";
            $params[':status'] = $status;

            if (isset($data['rejection_reason'])) {
                $fields[] = "rejection_reason = :reason";
                $params[':reason'] = (string)$data['rejection_reason'];
            }
        }

        if (empty($fields)) {
            Response::json(['message' => 'No changes']);
            return;
        }

        $sql = "UPDATE timesheets SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        Response::json(['message' => 'Updated']);
    }

    private function uploadAttachment(string $timesheetId): void
    {
        $stmt = $this->pdo->prepare("SELECT id FROM timesheets WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $timesheetId]);
        if (!$stmt->fetch()) {
            Response::error('Hoja de tiempo no encontrada', 404);
            return;
        }

        if (empty($_FILES['file']) || (int)($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            Response::error('Archivo requerido (campo "file")', 422);
            return;
        }

        $file = $_FILES['file'];
        $maxBytes = 10 * 1024 * 1024;
        if ((int)$file['size'] > $maxBytes) {
            Response::error('El archivo supera el límite de 10 MB', 422);
            return;
        }

        $allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'jpg', 'jpeg', 'png', 'webp', 'zip'];
        $originalName = basename((string)$file['name']);
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if (!in_array($extension, $allowedExtensions, true)) {
            Response::error('Tipo de archivo no permitido', 422);
            return;
        }

        $uploadDir = __DIR__ . '/../../uploads/timesheets/' . $timesheetId . '/';
        if (!is_dir($uploadDir) && !@mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
            Response::error('No se pudo crear el directorio de documentos', 500);
            return;
        }

        $storedName = bin2hex(random_bytes(12)) . '.' . $extension;
        $targetPath = $uploadDir . $storedName;
        if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
            Response::error('No se pudo subir el archivo', 500);
            return;
        }

        $mime = $file['type'] ?? (mime_content_type($targetPath) ?: 'application/octet-stream');
        $size = (int)($file['size'] ?? filesize($targetPath) ?: 0);
        $attachmentId = $this->uuid();
        $userId = Auth::userId();

        $this->pdo->prepare("
            INSERT INTO timesheet_attachments (
                id, timesheet_id, uploaded_by_user_id, file_name, stored_name, mime_type, size_bytes
            ) VALUES (
                :id, :tid, :uid, :name, :stored, :mime, :size
            )
        ")->execute([
            ':id' => $attachmentId,
            ':tid' => $timesheetId,
            ':uid' => $userId,
            ':name' => $originalName,
            ':stored' => $storedName,
            ':mime' => $mime,
            ':size' => $size,
        ]);

        Response::json([
            'message' => 'Documento subido',
            'attachment' => [
                'id' => $attachmentId,
                'file_name' => $originalName,
                'mime_type' => $mime,
                'size_bytes' => $size,
            ],
        ], 201);
    }

    private function downloadAttachment(string $timesheetId, string $attachmentId): void
    {
        $stmt = $this->pdo->prepare("
            SELECT * FROM timesheet_attachments
            WHERE id = :id AND timesheet_id = :tid
            LIMIT 1
        ");
        $stmt->execute([':id' => $attachmentId, ':tid' => $timesheetId]);
        $attachment = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$attachment) {
            Response::error('Documento no encontrado', 404);
            return;
        }

        $path = __DIR__ . '/../../uploads/timesheets/' . $timesheetId . '/' . basename((string)$attachment['stored_name']);
        if (!is_file($path)) {
            Response::error('Archivo no disponible', 404);
            return;
        }

        $fileName = (string)$attachment['file_name'];
        $safeFileName = str_replace(['"', "\r", "\n"], '', $fileName);
        $mime = (string)($attachment['mime_type'] ?: 'application/octet-stream');
        if (!preg_match('#^[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+$#', $mime)) {
            $mime = 'application/octet-stream';
        }

        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string)filesize($path));
        header('Content-Disposition: attachment; filename="' . $safeFileName . '"');
        header('Cache-Control: private, max-age=0, must-revalidate');
        readfile($path);
        exit;
    }

    private function deleteAttachment(string $timesheetId, string $attachmentId): void
    {
        $stmt = $this->pdo->prepare("
            SELECT * FROM timesheet_attachments
            WHERE id = :id AND timesheet_id = :tid
            LIMIT 1
        ");
        $stmt->execute([':id' => $attachmentId, ':tid' => $timesheetId]);
        $attachment = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$attachment) {
            Response::error('Documento no encontrado', 404);
            return;
        }

        $path = __DIR__ . '/../../uploads/timesheets/' . $timesheetId . '/' . basename((string)$attachment['stored_name']);
        if (is_file($path)) {
            @unlink($path);
        }

        $this->pdo->prepare("DELETE FROM timesheet_attachments WHERE id = :id")->execute([':id' => $attachmentId]);

        Response::json(['message' => 'Documento eliminado']);
    }

    private function storeComment(string $timesheetId): void
    {
        $stmt = $this->pdo->prepare("SELECT id FROM timesheets WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $timesheetId]);
        if (!$stmt->fetch()) {
            Response::error('Hoja de tiempo no encontrada', 404);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $body = trim((string)($data['body'] ?? ''));
        if ($body === '') {
            Response::error('El comentario no puede estar vacío', 422);
            return;
        }
        $bodyLength = function_exists('mb_strlen') ? mb_strlen($body) : strlen($body);
        if ($bodyLength > 5000) {
            Response::error('El comentario supera el límite de 5000 caracteres', 422);
            return;
        }

        $id = $this->uuid();
        $userId = Auth::userId();

        $this->pdo->prepare("
            INSERT INTO timesheet_comments (id, timesheet_id, user_id, body)
            VALUES (:id, :tid, :uid, :body)
        ")->execute([
            ':id' => $id,
            ':tid' => $timesheetId,
            ':uid' => $userId,
            ':body' => $body,
        ]);

        $userName = 'Usuario';
        if ($userId) {
            $stmtUser = $this->pdo->prepare("SELECT COALESCE(full_name, email) FROM users WHERE id = :id LIMIT 1");
            $stmtUser->execute([':id' => $userId]);
            $userName = $stmtUser->fetchColumn() ?: $userName;
        }

        Response::json([
            'message' => 'Comentario agregado',
            'comment' => [
                'id' => $id,
                'timesheet_id' => $timesheetId,
                'user_id' => $userId,
                'user_name' => $userName,
                'body' => $body,
                'created_at' => date('Y-m-d H:i:s'),
            ],
        ], 201);
    }

    private function storeEntry(string $timesheetId): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $this->uuid();
        
        $stmt = $this->pdo->prepare("
            INSERT INTO timesheet_entries (id, timesheet_id, date, hours, start_time, end_time, break_time, description)
            VALUES (:id, :tid, :date, :hours, :start, :end, :break, :desc)
        ");
        
        $stmt->execute([
            ':id' => $id,
            ':tid' => $timesheetId,
            ':date' => $data['date'],
            ':hours' => $data['hours'],
            ':start' => $data['start_time'] ?? null,
            ':end' => $data['end_time'] ?? null,
            ':break' => $data['break_time'] ?? 0,
            ':desc' => $data['description'] ?? ''
        ]);
        
        // Update total hours
        $this->updateTotalHours($timesheetId);
        
        Response::json(['message' => 'Entry added', 'id' => $id]);
    }

    private function updateTotalHours(string $timesheetId): void
    {
        $stmt = $this->pdo->prepare("SELECT SUM(hours) FROM timesheet_entries WHERE timesheet_id = ?");
        $stmt->execute([$timesheetId]);
        $total = $stmt->fetchColumn() ?: 0;
        
        $stmt = $this->pdo->prepare("UPDATE timesheets SET total_hours = ? WHERE id = ?");
        $stmt->execute([$total, $timesheetId]);
    }

    private function getOvertimeRules(): void
    {
        $stmt = $this->pdo->query("SELECT * FROM overtime_rules");
        Response::json(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    private function storeOvertimeRule(): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $this->uuid();
        
        $stmt = $this->pdo->prepare("
            INSERT INTO overtime_rules (id, country_code, daily_limit, weekly_limit, rate_multiplier)
            VALUES (:id, :cc, :dl, :wl, :rm)
            ON DUPLICATE KEY UPDATE daily_limit = :dl_u, weekly_limit = :wl_u, rate_multiplier = :rm_u
        ");
        
        $stmt->execute([
            ':id' => $id,
            ':cc' => $data['country_code'],
            ':dl' => $data['daily_limit'] ?? 8.00,
            ':wl' => $data['weekly_limit'] ?? 40.00,
            ':rm' => $data['rate_multiplier'] ?? 1.50,
            ':dl_u' => $data['daily_limit'] ?? 8.00,
            ':wl_u' => $data['weekly_limit'] ?? 40.00,
            ':rm_u' => $data['rate_multiplier'] ?? 1.50,
        ]);
        
        Response::json(['message' => 'Rule saved']);
    }

    private function delete(string $id): void
    {
        $stmt = $this->pdo->prepare("DELETE FROM timesheets WHERE id = :id");
        $stmt->execute([':id' => $id]);
        Response::json(['message' => 'Deleted']);
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
