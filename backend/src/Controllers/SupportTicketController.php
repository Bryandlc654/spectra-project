<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;
use Pusher\Pusher;

class SupportTicketController
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
            CREATE TABLE IF NOT EXISTS support_tickets (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) DEFAULT 'open',
                priority VARCHAR(50) DEFAULT 'medium',
                assignee_id VARCHAR(36) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (user_id),
                INDEX (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        
        // Fix for missing user_id column if table existed before
        try {
            $stmt = $this->pdo->query("SHOW COLUMNS FROM support_tickets LIKE 'user_id'");
            if ($stmt->rowCount() === 0) {
                $this->pdo->exec("ALTER TABLE support_tickets ADD COLUMN user_id VARCHAR(36) NOT NULL AFTER id");
                $this->pdo->exec("CREATE INDEX idx_support_tickets_user_id ON support_tickets(user_id)");
            }

            $stmt = $this->pdo->query("SHOW COLUMNS FROM support_tickets LIKE 'assignee_id'");
            if ($stmt->rowCount() === 0) {
                $this->pdo->exec("ALTER TABLE support_tickets ADD COLUMN assignee_id VARCHAR(36) NULL AFTER priority");
            }

            $stmt = $this->pdo->query("SHOW COLUMNS FROM support_tickets LIKE 'company_id'");
            if ($stmt->rowCount() === 0) {
                $this->pdo->exec("ALTER TABLE support_tickets ADD COLUMN company_id VARCHAR(36) NULL AFTER user_id");
                $this->pdo->exec("CREATE INDEX idx_support_tickets_company_id ON support_tickets(company_id)");
            }
        } catch (\Throwable $e) {
            // Ignore error
        }

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS support_ticket_messages (
                id VARCHAR(36) PRIMARY KEY,
                ticket_id VARCHAR(36) NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                message TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (ticket_id),
                FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/support-tickets
        // /api/support-tickets/{id}
        // /api/support-tickets/{id}/messages

        $id = $segments[2] ?? null;
        $sub = $segments[3] ?? null;

        if ($id && $sub === 'messages' && $method === 'POST') {
            $this->addMessage($id);
            return;
        }

        if ($id && $sub === 'messages' && $method === 'GET') {
            $this->getMessages($id);
            return;
        }

        if ($id && $method === 'GET') {
            $this->show($id);
            return;
        }

        if ($id && ($method === 'PUT' || $method === 'PATCH')) {
            $this->update($id);
            return;
        }

        if (!$id && $method === 'GET') {
            $this->index();
            return;
        }

        if (!$id && $method === 'POST') {
            $this->store();
            return;
        }

        Response::error('Ruta no encontrada', 404);
    }

    private function index(): void
    {
        $user = Auth::user();
        $isSupport = in_array($user['platform_role'] ?? '', ['super_admin', 'support']);
        $companyId = $_GET['company_id'] ?? null;

        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
        $limit = max(1, min(100, $limit));
        
        $offset = ($page - 1) * $limit;

        $sql = "SELECT t.*, u.full_name as user_name, u.email as user_email 
                FROM support_tickets t
                LEFT JOIN users u ON t.user_id = u.id";
        
        $params = [];
        $where = ["1=1"];

        // If not support, only see own tickets
        if (!$isSupport) {
            $where[] = "t.user_id = :uid";
            $params[':uid'] = $user['id'];
        } else {
            // Support filters
            if ($companyId) {
                $where[] = "t.company_id = :company_id";
                $params[':company_id'] = $companyId;
            }
        }

        $sql .= " WHERE " . implode(' AND ', $where);
        $sql .= " ORDER BY t.created_at DESC LIMIT :limit OFFSET :offset";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $tickets = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $countSql = "SELECT COUNT(*) FROM support_tickets t";
        $countParams = [];
        
        if (!$isSupport) {
            $countSql .= " WHERE t.user_id = :uid";
            $countParams[':uid'] = $user['id'];
        } else {
             if ($companyId) {
                $countSql .= " WHERE t.company_id = :company_id";
                $countParams[':company_id'] = $companyId;
            }
        }
        
        $countStmt = $this->pdo->prepare($countSql);
        $countStmt->execute($countParams);
        $total = (int)$countStmt->fetchColumn();

        Response::json([
            'data' => $tickets,
            'pagination' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'total_pages' => ceil($total / $limit)
            ]
        ]);
    }

    private function show(string $id): void
    {
        $user = Auth::user();
        $isSupport = in_array($user['platform_role'] ?? '', ['super_admin', 'support']);

        $stmt = $this->pdo->prepare("
            SELECT t.*, u.full_name as user_name, u.email as user_email
            FROM support_tickets t
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.id = :id
        ");
        $stmt->execute([':id' => $id]);
        $ticket = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$ticket) {
            Response::error('Ticket no encontrado', 404);
            return;
        }

        if (!$isSupport && $ticket['user_id'] !== $user['id']) {
            Response::error('No autorizado', 403);
            return;
        }

        Response::json(['data' => $ticket]);
    }

    private function store(): void
    {
        $user = Auth::user();
        $input = json_decode(file_get_contents('php://input'), true);

        $subject = trim($input['subject'] ?? '');
        $description = trim($input['description'] ?? '');
        $priority = $input['priority'] ?? 'medium';

        if (!$subject) {
            Response::error('El asunto es requerido', 422);
            return;
        }

        $id = $this->uuid();
        
        $stmt = $this->pdo->prepare("
            INSERT INTO support_tickets (id, user_id, created_by_user_id, company_id, subject, description, priority, status, created_at)
            VALUES (:id, :uid, :created_by, :cid, :sub, :desc, :prio, 'open', NOW())
        ");
        $stmt->execute([
            ':id' => $id,
            ':uid' => $user['id'],
            ':created_by' => $user['id'],
            ':cid' => $user['company_id'] ?? null,
            ':sub' => $subject,
            ':desc' => $description,
            ':prio' => $priority
        ]);

        Response::json(['message' => 'Ticket creado', 'id' => $id], 201);
    }

    private function update(string $id): void
    {
        $user = Auth::user();
        $isSupport = in_array($user['platform_role'] ?? '', ['super_admin', 'support']);

        $stmt = $this->pdo->prepare("SELECT user_id FROM support_tickets WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $ticket = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$ticket) {
            Response::error('Ticket no encontrado', 404);
            return;
        }

        if (!$isSupport && $ticket['user_id'] !== $user['id']) {
            Response::error('No autorizado', 403);
            return;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        
        // Users can only close tickets? Or maybe update description?
        // Support can update status, priority, assignee
        
        $fields = [];
        $params = [':id' => $id];

        if ($isSupport) {
            if (isset($input['status'])) {
                $fields[] = "status = :status";
                $params[':status'] = $input['status'];
            }
            if (isset($input['priority'])) {
                $fields[] = "priority = :priority";
                $params[':priority'] = $input['priority'];
            }
            if (isset($input['assignee_id'])) {
                $fields[] = "assignee_id = :assignee";
                $fields[] = "assigned_to_user_id = :assignee";
                $params[':assignee'] = $input['assignee_id'];
            }
        }

        // Common updates (maybe re-opening?)
        // For simplicity, let's allow status update for owner too (e.g. to close)
        if (!$isSupport && isset($input['status']) && $input['status'] === 'closed') {
             $fields[] = "status = :status";
             $params[':status'] = 'closed';
        }

        if (empty($fields)) {
            Response::json(['message' => 'Nada que actualizar']);
            return;
        }

        $sql = "UPDATE support_tickets SET " . implode(', ', $fields) . " WHERE id LIKE :id";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        Response::json(['message' => 'Ticket actualizado']);
    }

    private function getMessages(string $ticketId): void
    {
        $user = Auth::user();
        $isSupport = in_array($user['platform_role'] ?? '', ['super_admin', 'support']);

        $stmt = $this->pdo->prepare("SELECT user_id FROM support_tickets WHERE id = :id");
        $stmt->execute([':id' => $ticketId]);
        $ticket = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$ticket) {
            Response::error('Ticket no encontrado', 404);
            return;
        }

        if (!$isSupport && $ticket['user_id'] !== $user['id']) {
            Response::error('No autorizado', 403);
            return;
        }
        
        $stmt = $this->pdo->prepare("
            SELECT m.*, u.full_name as user_name 
            FROM support_ticket_messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.ticket_id LIKE :tid
            ORDER BY m.created_at ASC
        ");
        $stmt->execute([':tid' => $ticketId]);
        $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json(['data' => $messages]);
    }

    private function addMessage(string $ticketId): void
    {
        $user = Auth::user();
        $isSupport = in_array($user['platform_role'] ?? '', ['super_admin', 'support']);

        $stmt = $this->pdo->prepare("SELECT user_id FROM support_tickets WHERE id = :id");
        $stmt->execute([':id' => $ticketId]);
        $ticket = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$ticket) {
            Response::error('Ticket no encontrado', 404);
            return;
        }

        if (!$isSupport && $ticket['user_id'] !== $user['id']) {
            Response::error('No autorizado', 403);
            return;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $message = trim($input['message'] ?? '');

        if (!$message) {
            Response::error('Mensaje vacío', 422);
            return;
        }

        $id = $this->uuid();
        $stmt = $this->pdo->prepare("
            INSERT INTO support_ticket_messages (id, ticket_id, user_id, message, created_at)
            VALUES (:id, :tid, :uid, :msg, NOW())
        ");
        $stmt->execute([
            ':id' => $id,
            ':tid' => $ticketId,
            ':uid' => $user['id'],
            ':msg' => $message
        ]);

        try {
            $pusher = new Pusher(
                $_ENV['PUSHER_APP_KEY'] ?? '',
                $_ENV['PUSHER_APP_SECRET'] ?? '',
                $_ENV['PUSHER_APP_ID'] ?? '',
                [
                    'cluster' => $_ENV['PUSHER_APP_CLUSTER'] ?? 'mt1',
                    'useTLS' => true
                ]
            );

            $pusher->trigger('ticket-' . $ticketId, 'message-sent', [
                'id' => $id,
                'ticket_id' => $ticketId,
                'user_id' => $user['id'],
                'user_name' => $user['full_name'] ?? 'Usuario',
                'message' => $message,
                'created_at' => date('Y-m-d H:i:s')
            ]);
        } catch (\Throwable $e) {
            error_log('Pusher Error: ' . $e->getMessage());
        }

        Response::json(['message' => 'Mensaje enviado', 'id' => $id], 201);
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
