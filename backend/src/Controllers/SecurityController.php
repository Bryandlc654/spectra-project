<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class SecurityController
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
            CREATE TABLE IF NOT EXISTS user_sessions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                token_hash VARCHAR(64),
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (user_id),
                INDEX (token_hash)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Ensure last_activity column exists (migration)
        try {
            $this->pdo->query("SELECT last_activity FROM user_sessions LIMIT 1");
        } catch (\Throwable $e) {
            try {
                $this->pdo->exec("ALTER TABLE user_sessions ADD COLUMN last_activity DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
            } catch (\Throwable $ex) {
                // Ignore error if column already added or other issue
            }
        }
    }

    public function handle(array $segments, string $method): void
    {
        // /api/security/sessions
        // /api/security/sessions/{id}/revoke

        $resource = $segments[2] ?? null;
        $id = $segments[3] ?? null; // if resource is sessions, this might be ID
        
        // Actually segments: 0=api, 1=security, 2=sessions, 3={id}, 4=revoke

        if ($resource === 'sessions') {
            if ($id === 'revoke-all' && $method === 'POST') {
                $this->revokeAll();
                return;
            }

            if ($id && ($segments[4] ?? '') === 'revoke' && $method === 'POST') {
                $this->revokeSession($id);
                return;
            }

            if ($method === 'GET') {
                $this->listSessions();
                return;
            }
        }

        Response::error('Ruta no encontrada', 404);
    }

    private function listSessions(): void
    {
        $user = Auth::user();
        // Only admins/security/support should see all sessions.
        // Users see their own.
        
        $role = $user['platform_role'] ?? '';
        $canViewAll = in_array($role, ['super_admin', 'admin', 'security', 'support']);

        $page = (int)($_GET['page'] ?? 1);
        $perPage = (int)($_GET['per_page'] ?? 20);
        $perPage = max(1, min(100, $perPage));
        $offset = ($page - 1) * $perPage;

        $where = [];
        $params = [];

        if (!$canViewAll) {
            $where[] = "s.user_id = :user_id";
            $params[':user_id'] = $user['id'];
        } else {
            // Optional filter by user_id for admins
            if (!empty($_GET['user_id'])) {
                $where[] = "s.user_id = :uid";
                $params[':uid'] = $_GET['user_id'];
            }
        }

        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $countSql = "SELECT COUNT(*) FROM user_sessions s $whereClause";
        $stmt = $this->pdo->prepare($countSql);
        $stmt->execute($params);
        $total = $stmt->fetchColumn();

        $sql = "SELECT s.*, u.full_name as user_name, u.email as user_email
                FROM user_sessions s
                LEFT JOIN users u ON s.user_id = u.id
                $whereClause
                ORDER BY s.last_activity DESC
                LIMIT $perPage OFFSET $offset";
        
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'data' => $items,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => (int)$total,
                'last_page' => ceil($total / $perPage)
            ]
        ]);
    }

    private function revokeAll(): void
    {
        $user = Auth::user();
        $role = $user['platform_role'] ?? '';
        $canRevoke = in_array($role, ['super_admin', 'admin', 'security']);

        if (!$canRevoke) {
             Response::error('No autorizado', 403);
             return;
        }
        
        $this->pdo->exec("UPDATE user_sessions SET is_active = 0 WHERE is_active = 1");
        
        Response::json(['message' => 'Todas las sesiones han sido revocadas']);
    }

    private function revokeSession(string $id): void
    {
        $user = Auth::user();
        $role = $user['platform_role'] ?? '';
        $canRevoke = in_array($role, ['super_admin', 'admin', 'security']);

        // Check ownership if not admin
        if (!$canRevoke) {
            $stmt = $this->pdo->prepare("SELECT user_id FROM user_sessions WHERE id = :id");
            $stmt->execute([':id' => $id]);
            $session = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$session || $session['user_id'] !== $user['id']) {
                Response::error('No autorizado', 403);
                return;
            }
        }

        $stmt = $this->pdo->prepare("UPDATE user_sessions SET is_active = 0 WHERE id = :id");
        $stmt->execute([':id' => $id]);

        Response::json(['message' => 'Sesión revocada']);
    }
}
