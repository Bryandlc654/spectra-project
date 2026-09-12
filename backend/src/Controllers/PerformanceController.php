<?php
namespace App\Controllers;

use App\Database;
use PDO;

class PerformanceController {
    private $pdo;

    public function __construct(Database $database) {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
        $this->ensureIndexes();
    }

    private function ensureIndexes() {
        try {
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_perf_reviews_status ON performance_reviews(status)");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_perf_reviews_cycle ON performance_reviews(cycle_id)");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_perf_goals_status ON performance_goals(status)");
        } catch (\Exception $e) {
            // Ignore
        }
    }

    private function ensureTables() {
        // performance_reviews
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS performance_reviews (
                id CHAR(36) PRIMARY KEY,
                reviewer_id VARCHAR(36) NOT NULL,
                reviewee_id VARCHAR(36) NOT NULL,
                cycle_id VARCHAR(50) NOT NULL,
                status ENUM('pending', 'in_progress', 'completed') DEFAULT 'pending',
                score DECIMAL(3, 1) DEFAULT 0.0,
                feedback TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // performance_goals
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS performance_goals (
                id CHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NULL,
                status ENUM('not_started', 'in_progress', 'completed', 'cancelled') DEFAULT 'not_started',
                progress INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // performance_feedback
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS performance_feedback (
                id CHAR(36) PRIMARY KEY,
                from_user VARCHAR(36) NOT NULL,
                to_user VARCHAR(36) NOT NULL,
                message TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (from_user) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (to_user) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle($segments, $method) {
        // /api/performance/reviews
        // /api/performance/goals
        // /api/performance/feedback
        
        $resource = $segments[0] ?? null;
        $id = $segments[1] ?? null;

        if ($resource === 'reviews') {
            return $this->handleReviews($method, $id);
        } elseif ($resource === 'goals') {
            return $this->handleGoals($method, $id);
        } elseif ($resource === 'feedback') {
            return $this->handleFeedback($method, $id);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Resource not found']);
        }
    }

    private function handleReviews($method, $id) {
        if ($method === 'GET') {
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
            $offset = ($page - 1) * $limit;

            $total = (int)$this->pdo->query("SELECT COUNT(*) FROM performance_reviews")->fetchColumn();

            $stmt = $this->pdo->prepare("SELECT * FROM performance_reviews ORDER BY created_at DESC LIMIT :limit OFFSET :offset");
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            
            echo json_encode([
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
            $uuid = $this->generateUuid();
            $stmt = $this->pdo->prepare("INSERT INTO performance_reviews (id, reviewer_id, reviewee_id, cycle_id, status, score, feedback) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $uuid,
                $data['reviewer_id'],
                $data['reviewee_id'],
                $data['cycle_id'],
                $data['status'] ?? 'pending',
                $data['score'] ?? 0.0,
                $data['feedback'] ?? ''
            ]);
            echo json_encode(['message' => 'Review created', 'id' => $uuid]);
        }
    }

    private function handleGoals($method, $id) {
        if ($method === 'GET') {
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
            $offset = ($page - 1) * $limit;

            $total = (int)$this->pdo->query("SELECT COUNT(*) FROM performance_goals")->fetchColumn();

            $stmt = $this->pdo->prepare("SELECT * FROM performance_goals ORDER BY created_at DESC LIMIT :limit OFFSET :offset");
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            
            echo json_encode([
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
            $uuid = $this->generateUuid();
            $stmt = $this->pdo->prepare("INSERT INTO performance_goals (id, user_id, title, description, status, progress) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $uuid,
                $data['user_id'],
                $data['title'],
                $data['description'] ?? '',
                $data['status'] ?? 'not_started',
                $data['progress'] ?? 0
            ]);
            echo json_encode(['message' => 'Goal created', 'id' => $uuid]);
        }
    }

    private function handleFeedback($method, $id) {
        if ($method === 'GET') {
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            $limit = max(1, min(100, $limit));
            $offset = ($page - 1) * $limit;

            // Count total
            $countStmt = $this->pdo->query("SELECT COUNT(*) FROM performance_feedback");
            $total = $countStmt->fetchColumn();

            // Fetch paged
            $stmt = $this->pdo->prepare("SELECT * FROM performance_feedback ORDER BY created_at DESC LIMIT :limit OFFSET :offset");
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            
            echo json_encode([
                'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
                'meta' => [
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                    'pages' => ceil($total / $limit)
                ]
            ]);
        } elseif ($method === 'POST') {
            $data = json_decode(file_get_contents('php://input'), true);
            $uuid = $this->generateUuid();
            $stmt = $this->pdo->prepare("INSERT INTO performance_feedback (id, from_user, to_user, message) VALUES (?, ?, ?, ?)");
            $stmt->execute([
                $uuid,
                $data['from_user'],
                $data['to_user'],
                $data['message']
            ]);
            echo json_encode(['message' => 'Feedback sent', 'id' => $uuid]);
        }
    }

    private function generateUuid() {
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
