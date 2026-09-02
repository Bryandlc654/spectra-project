<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class NotificationController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->ensureTables();
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS notifications (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                company_id VARCHAR(36) NULL,
                type VARCHAR(20) DEFAULT 'info', -- info, success, warning, error
                title VARCHAR(255) NOT NULL,
                message TEXT,
                link VARCHAR(255) NULL,
                is_read TINYINT(1) DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user (user_id),
                INDEX idx_read (is_read)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Lazy migrations for existing tables
        try {
            $this->pdo->exec("ALTER TABLE notifications ADD COLUMN is_read TINYINT(1) DEFAULT 0");
            $this->pdo->exec("CREATE INDEX idx_read ON notifications(is_read)");
        } catch (\Exception $e) {
            // Ignore if exists
        }

        try {
            $this->pdo->exec("ALTER TABLE notifications ADD COLUMN type VARCHAR(20) DEFAULT 'info'");
        } catch (\Exception $e) {
            // Ignore
        }

        try {
            $this->pdo->exec("ALTER TABLE notifications ADD COLUMN company_id VARCHAR(36) NULL");
        } catch (\Exception $e) {
            // Ignore
        }

        try {
            $this->pdo->exec("ALTER TABLE notifications ADD COLUMN link VARCHAR(255) NULL");
        } catch (\Exception $e) {
            // Ignore
        }
    }

    public function handle(array $segments, string $method): void
    {
        // /api/notifications
        $user = Auth::user();
        if (!$user) {
            Response::error('No autenticado', 401);
            return;
        }
        
        $sub = $segments[2] ?? null;

        if ($sub === null && $method === 'GET') {
            $this->index($user['id']);
            return;
        }

        if ($sub === 'read-all' && $method === 'POST') {
            $this->markAllAsRead($user['id']);
            return;
        }

        if ($sub !== null && $method === 'PATCH') {
            // /api/notifications/{id}
            $this->markAsRead($user['id'], $sub);
            return;
        }

        Response::error('Ruta no encontrada', 404);
    }

    private function index(string $userId): void
    {
        $page = isset($_GET['page']) ? (int)$_GET['page'] : null;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
        if ($limit < 1) $limit = 50;
        if ($limit > 100) $limit = 100;

        $offset = 0;
        if ($page) {
            $page = max(1, $page);
            $offset = ($page - 1) * $limit;
        }

        $stmt = $this->pdo->prepare("
            SELECT * FROM notifications 
            WHERE user_id LIKE :user_id 
            ORDER BY created_at DESC 
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':user_id', $userId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Count unread
        $stmtCount = $this->pdo->prepare("SELECT COUNT(*) FROM notifications WHERE user_id LIKE :user_id AND is_read = 0");
        $stmtCount->execute([':user_id' => $userId]);
        $unread = $stmtCount->fetchColumn();

        $response = [
            'items' => $items,
            'unread_count' => (int)$unread
        ];

        if ($page) {
            // Count total for pagination
            $stmtTotal = $this->pdo->prepare("SELECT COUNT(*) FROM notifications WHERE user_id LIKE :user_id");
            $stmtTotal->execute([':user_id' => $userId]);
            $total = (int)$stmtTotal->fetchColumn();

            $response['pagination'] = [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => ceil($total / $limit)
            ];
        }

        Response::json($response);
    }

    private function markAsRead(string $userId, string $id): void
    {
        $stmt = $this->pdo->prepare("UPDATE notifications SET is_read = 1 WHERE id LIKE :id AND user_id LIKE :user_id");
        $stmt->execute([':id' => $id, ':user_id' => $userId]);
        Response::json(['success' => true]);
    }

    private function markAllAsRead(string $userId): void
    {
        $stmt = $this->pdo->prepare("UPDATE notifications SET is_read = 1 WHERE user_id LIKE :user_id");
        $stmt->execute([':user_id' => $userId]);
        Response::json(['success' => true]);
    }

    // Helper for internal use (static-like or instance)
    public function create(string $userId, string $title, string $message, string $type = 'info', ?string $companyId = null, ?string $link = null): void
    {
        $id = \App\Support\Str::uuid();
        $stmt = $this->pdo->prepare("
            INSERT INTO notifications (id, user_id, company_id, type, title, message, link, is_read, created_at)
            VALUES (:id, :user_id, :company_id, :type, :title, :message, :link, 0, NOW())
        ");
        $stmt->execute([
            ':id' => $id,
            ':user_id' => $userId,
            ':company_id' => $companyId,
            ':type' => $type,
            ':title' => $title,
            ':message' => $message,
            ':link' => $link
        ]);
    }
}
