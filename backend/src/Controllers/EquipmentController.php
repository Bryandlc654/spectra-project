<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use PDO;

class EquipmentController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function ensureTables(): void
    {
        // Equipment Inventory
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS equipment (
                id CHAR(36) PRIMARY KEY,
                type VARCHAR(50) NOT NULL, -- laptop, monitor, headset
                model VARCHAR(100) NOT NULL,
                serial_number VARCHAR(100) NOT NULL UNIQUE,
                condition_status VARCHAR(50) DEFAULT 'new', -- new, good, fair, poor
                status ENUM('available', 'assigned', 'maintenance', 'retired') DEFAULT 'available',
                purchase_date DATE NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Assignments
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS equipment_assignments (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                equipment_id CHAR(36) NOT NULL,
                assigned_date DATE DEFAULT (CURRENT_DATE),
                returned_date DATE NULL,
                status ENUM('active', 'returned') DEFAULT 'active',
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Shipping Requests
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS shipping_requests (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                equipment_id CHAR(36) NULL, -- Optional if requesting new equipment
                address TEXT NOT NULL,
                status ENUM('pending', 'approved', 'shipped', 'delivered', 'returned') DEFAULT 'pending',
                tracking_number VARCHAR(100) NULL,
                carrier VARCHAR(100) NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Indexes for performance
        try {
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_equip_assign_user ON equipment_assignments(user_id)");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_equip_assign_equip ON equipment_assignments(equipment_id)");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_shipping_req_user ON shipping_requests(user_id)");
        } catch (\Exception $e) { /* Ignore */ }
    }

    public function handle(array $segments, string $method): void
    {
        // /api/equipment
        // /api/equipment/assignments
        // /api/equipment/shipping

        $resource = $segments[2] ?? null;
        $id = $segments[3] ?? null;

        if (!$resource) {
            // Default to inventory if no sub-resource
            $this->handleInventory($method, $id);
            return;
        }

        switch ($resource) {
            case 'assignments':
                $this->handleAssignments($method, $id);
                break;
            case 'shipping':
                $this->handleShipping($method, $id);
                break;
            default:
                // Treat as inventory ID if it looks like a UUID or just default to inventory logic
                // But better to be explicit. If segments[2] is 'inventory' or just ID?
                // For simplicity: /api/equipment -> list inventory
                // /api/equipment/{id} -> show item
                // /api/equipment/assignments -> list assignments
                if ($this->isUuid($resource)) {
                    $this->handleInventory($method, $resource);
                } else {
                    $this->handleInventory($method, null); // Fallback
                }
        }
    }

    private function isUuid($str) {
        return preg_match('/^[0-9a-fA-F-]{36}$/', $str);
    }

    private function handleInventory(string $method, ?string $id): void
    {
        if ($method === 'GET') {
            if ($id) {
                $stmt = $this->pdo->prepare("SELECT * FROM equipment WHERE id = :id");
                $stmt->execute([':id' => $id]);
                $item = $stmt->fetch(PDO::FETCH_ASSOC);
                $item ? Response::json($item) : Response::error('Equipo no encontrado', 404);
            } else {
                $page = max(1, (int)($_GET['page'] ?? 1));
                $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
                $offset = ($page - 1) * $limit;

                $total = (int)$this->pdo->query("SELECT COUNT(*) FROM equipment")->fetchColumn();

                $stmt = $this->pdo->prepare("SELECT * FROM equipment ORDER BY created_at DESC LIMIT :limit OFFSET :offset");
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
        } elseif ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            $this->pdo->prepare("
                INSERT INTO equipment (id, type, model, serial_number, condition_status, status, purchase_date)
                VALUES (UUID(), :type, :model, :serial, :cond, :status, :pdate)
            ")->execute([
                ':type' => $data['type'],
                ':model' => $data['model'],
                ':serial' => $data['serial_number'],
                ':cond' => $data['condition_status'] ?? 'new',
                ':status' => $data['status'] ?? 'available',
                ':pdate' => $data['purchase_date'] ?? null
            ]);
            Response::json(['message' => 'Equipo registrado'], 201);
        }
    }

    private function handleAssignments(string $method, ?string $id): void
    {
        if ($method === 'GET') {
            $userId = $_GET['user_id'] ?? null;
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
            $offset = ($page - 1) * $limit;

            if ($userId) {
                // Count
                $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM equipment_assignments WHERE user_id = :uid");
                $countStmt->execute([':uid' => $userId]);
                $total = (int)$countStmt->fetchColumn();

                $stmt = $this->pdo->prepare("
                    SELECT a.*, e.type, e.model, e.serial_number 
                    FROM equipment_assignments a
                    JOIN equipment e ON a.equipment_id = e.id
                    WHERE a.user_id = :uid
                    LIMIT :limit OFFSET :offset
                ");
                $stmt->bindValue(':uid', $userId);
                $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                $stmt->execute();
            } else {
                // List all assignments (admin view)
                $total = (int)$this->pdo->query("SELECT COUNT(*) FROM equipment_assignments")->fetchColumn();

                $stmt = $this->pdo->prepare("
                    SELECT a.*, e.type, e.model, u.email as user_email
                    FROM equipment_assignments a
                    JOIN equipment e ON a.equipment_id = e.id
                    JOIN users u ON a.user_id = u.id
                    ORDER BY a.created_at DESC
                    LIMIT :limit OFFSET :offset
                ");
                $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
                $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                $stmt->execute();
            }
            
            Response::json([
                'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
                'pagination' => [
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                    'total_pages' => ceil($total / $limit)
                ]
            ]);

        } elseif ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            
            // Start transaction
            $this->pdo->beginTransaction();
            try {
                // Create assignment
                $this->pdo->prepare("
                    INSERT INTO equipment_assignments (id, user_id, equipment_id, assigned_date, status)
                    VALUES (UUID(), :uid, :eid, CURRENT_DATE, 'active')
                ")->execute([
                    ':uid' => $data['user_id'],
                    ':eid' => $data['equipment_id']
                ]);

                // Update equipment status
                $this->pdo->prepare("UPDATE equipment SET status = 'assigned' WHERE id LIKE :id")
                    ->execute([':id' => $data['equipment_id']]);

                $this->pdo->commit();
                Response::json(['message' => 'Equipo asignado'], 201);
            } catch (\Exception $e) {
                $this->pdo->rollBack();
                Response::error('Error al asignar equipo: ' . $e->getMessage(), 500);
            }
        }
    }

    private function handleShipping(string $method, ?string $id): void
    {
        if ($method === 'GET') {
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
            $offset = ($page - 1) * $limit;

            $total = (int)$this->pdo->query("SELECT COUNT(*) FROM shipping_requests")->fetchColumn();

            $stmt = $this->pdo->prepare("SELECT * FROM shipping_requests ORDER BY created_at DESC LIMIT :limit OFFSET :offset");
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
        } elseif ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            $this->pdo->prepare("
                INSERT INTO shipping_requests (id, user_id, equipment_id, address, status)
                VALUES (UUID(), :uid, :eid, :addr, 'pending')
            ")->execute([
                ':uid' => $data['user_id'],
                ':eid' => $data['equipment_id'] ?? null,
                ':addr' => $data['address']
            ]);
            Response::json(['message' => 'Solicitud de envío creada'], 201);
        }
    }
}
