<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class CardController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function ensureTables(): void
    {
        // Deel Cards
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS cards (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                holder_name VARCHAR(150) NOT NULL,
                card_number_masked VARCHAR(20) NOT NULL, -- e.g. ************1234
                type ENUM('virtual', 'physical') DEFAULT 'virtual',
                currency_code VARCHAR(10) DEFAULT 'USD',
                spending_limit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
                status ENUM('active', 'frozen', 'cancelled', 'pending') DEFAULT 'pending',
                expiry_date VARCHAR(7) NULL, -- MM/YY
                cvv_hash VARCHAR(255) NULL, -- Encrypted or mocked
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Card Transactions
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS card_transactions (
                id CHAR(36) PRIMARY KEY,
                card_id CHAR(36) NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                merchant VARCHAR(150) NOT NULL,
                category VARCHAR(50) NULL, -- food, travel, software
                status ENUM('pending', 'completed', 'declined', 'refunded') DEFAULT 'pending',
                transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                description VARCHAR(255) NULL,
                FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(array $segments, string $method): void
    {
        // /api/cards
        // /api/cards/{id}/transactions

        $resourceId = $segments[2] ?? null;
        $subResource = $segments[3] ?? null;

        if ($resourceId) {
            if ($subResource === 'transactions') {
                $this->listTransactions($resourceId);
            } elseif ($method === 'GET') {
                $this->show($resourceId);
            } elseif ($method === 'PUT' || $method === 'PATCH') {
                $this->update($resourceId); // freeze/unfreeze
            } else {
                Response::error('Method not allowed', 405);
            }
            return;
        }

        if ($method === 'GET') {
            $this->index();
        } elseif ($method === 'POST') {
            $this->store();
        } else {
            Response::error('Method not allowed', 405);
        }
    }

    private function index(): void
    {
        $user = Auth::user();
        $userId = $_GET['user_id'] ?? $user['id'];

        if ($userId !== $user['id'] && !in_array($user['platform_role'], ['admin', 'finance'])) {
            Response::error('Unauthorized', 403);
            return;
        }

        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;

        $stmt = $this->pdo->prepare("SELECT * FROM cards WHERE user_id LIKE :uid ORDER BY created_at DESC LIMIT :limit OFFSET :offset");
        $stmt->bindValue(':uid', $userId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Count
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM cards WHERE user_id = :uid");
        $countStmt->execute([':uid' => $userId]);
        $total = (int)$countStmt->fetchColumn();

        Response::json([
            'data' => $items,
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
        $stmt = $this->pdo->prepare("SELECT * FROM cards WHERE id LIKE :id");
        $stmt->execute([':id' => $id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$item) {
            Response::error('Card not found', 404);
            return;
        }
        
        if ($item['user_id'] !== $user['id'] && !in_array($user['platform_role'], ['admin', 'finance'])) {
            Response::error('Unauthorized', 403);
            return;
        }

        Response::json(['data' => $item]);
    }

    private function listTransactions(string $cardId): void
    {
        // Validate access first
        $user = Auth::user();
        $cardStmt = $this->pdo->prepare("SELECT user_id FROM cards WHERE id = :id");
        $cardStmt->execute([':id' => $cardId]);
        $card = $cardStmt->fetch(PDO::FETCH_ASSOC);

        if (!$card) {
            Response::error('Card not found', 404);
            return;
        }

        if ($card['user_id'] !== $user['id'] && !in_array($user['platform_role'], ['admin', 'finance'])) {
            Response::error('Unauthorized', 403);
            return;
        }

        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;

        $stmt = $this->pdo->prepare("
            SELECT * FROM card_transactions 
            WHERE card_id LIKE :cid 
            ORDER BY transaction_date DESC 
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':cid', $cardId);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM card_transactions WHERE card_id = :cid");
        $countStmt->execute([':cid' => $cardId]);
        $total = (int)$countStmt->fetchColumn();

        Response::json([
            'data' => $items,
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
        $user = Auth::user();
        $data = json_decode(file_get_contents('php://input'), true);

        // Issue new card
        $id = $this->uuid();
        $type = $data['type'] ?? 'virtual';
        
        // Mock card generation
        $last4 = (string)rand(1000, 9999);
        $masked = '************' . $last4;
        
        $stmt = $this->pdo->prepare("
            INSERT INTO cards (id, user_id, holder_name, card_number_masked, type, spending_limit, status, expiry_date)
            VALUES (:id, :uid, :holder, :masked, :type, :limit, 'active', :expiry)
        ");

        $stmt->execute([
            ':id' => $id,
            ':uid' => $user['id'],
            ':holder' => $data['holder_name'] ?? $user['first_name'] . ' ' . $user['last_name'],
            ':masked' => $masked,
            ':type' => $type,
            ':limit' => $data['limit'] ?? 1000.00,
            ':expiry' => date('m/y', strtotime('+3 years'))
        ]);

        Response::json(['message' => 'Card issued successfully', 'id' => $id], 201);
    }

    private function update(string $id): void
    {
        $user = Auth::user();
        // Check ownership
        $check = $this->pdo->prepare("SELECT user_id FROM cards WHERE id LIKE :id");
        $check->execute([':id' => $id]);
        $card = $check->fetch(PDO::FETCH_ASSOC);

        if (!$card) {
            Response::error('Card not found', 404);
            return;
        }

        if ($card['user_id'] !== $user['id'] && !in_array($user['platform_role'], ['admin', 'finance'])) {
            Response::error('Unauthorized', 403);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $status = $data['status'] ?? null;

        if ($status && in_array($status, ['active', 'frozen', 'cancelled'])) {
            $stmt = $this->pdo->prepare("UPDATE cards SET status = :status WHERE id LIKE :id");
            $stmt->execute([':status' => $status, ':id' => $id]);
            Response::json(['message' => 'Card status updated']);
        } else {
            Response::error('Invalid status', 422);
        }
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
