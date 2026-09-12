<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\Auth;
use PDO;

class KnowledgeBaseController
{
    private PDO $pdo;
    private array $jwtConfig;

    public function __construct(Database $database, array $jwtConfig = [])
    {
        $this->pdo = $database->pdo();
        $this->jwtConfig = $jwtConfig;
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS kb_categories (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                slug VARCHAR(100) NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS kb_articles (
                id VARCHAR(36) PRIMARY KEY,
                category_id VARCHAR(36) NOT NULL,
                title VARCHAR(255) NOT NULL,
                slug VARCHAR(255) NOT NULL,
                content LONGTEXT,
                is_published TINYINT(1) DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (category_id),
                FOREIGN KEY (category_id) REFERENCES kb_categories(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        // Ensure category_id exists if table was created previously without it
        try {
            $this->pdo->query("SELECT category_id FROM kb_articles LIMIT 1");
        } catch (\PDOException $e) {
            $this->pdo->exec("ALTER TABLE kb_articles ADD COLUMN category_id VARCHAR(36) NOT NULL AFTER id");
            $this->pdo->exec("CREATE INDEX idx_kb_articles_category ON kb_articles(category_id)");
            // Note: Adding FK might fail if there's existing data without valid categories, so we skip FK here for safety or handle it carefully.
            // But for now, just adding the column is enough to fix the SELECT error.
        }
    }

    public function handle(array $segments, string $method): void
    {
        // /api/kb/categories
        // /api/kb/articles
        // /api/kb/articles/{id}

        $resource = $segments[2] ?? null;
        $id = $segments[3] ?? null;

        if ($resource === 'categories') {
            if ($method === 'GET') {
                $this->listCategories();
                return;
            }
            if ($method === 'POST') {
                $this->createCategory();
                return;
            }
        }

        if ($resource === 'articles') {
            if ($id) {
                if ($method === 'GET') {
                    $this->showArticle($id);
                    return;
                }
                if ($method === 'PUT' || $method === 'PATCH') {
                    $this->updateArticle($id);
                    return;
                }
                if ($method === 'DELETE') {
                    $this->deleteArticle($id);
                    return;
                }
            } else {
                if ($method === 'GET') {
                    $this->listArticles();
                    return;
                }
                if ($method === 'POST') {
                    $this->createArticle();
                    return;
                }
            }
        }

        Response::error('Ruta no encontrada', 404);
    }

    private function listCategories(): void
    {
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        // Count
        $countStmt = $this->pdo->query("SELECT COUNT(*) FROM kb_categories");
        $total = $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("SELECT * FROM kb_categories ORDER BY name ASC LIMIT :limit OFFSET :offset");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        Response::json([
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'meta' => [
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit)
            ]
        ]);
    }

    private function createCategory(): void
    {
        $this->checkAdmin();
        $input = json_decode(file_get_contents('php://input'), true);
        
        $name = trim($input['name'] ?? '');
        if (!$name) {
            Response::error('Nombre requerido', 422);
            return;
        }

        $id = $this->uuid();
        $slug = strtolower(trim(preg_replace('/[^A-Za-z0-9-]+/', '-', $name)));

        $stmt = $this->pdo->prepare("INSERT INTO kb_categories (id, name, slug, description) VALUES (:id, :n, :s, :d)");
        $stmt->execute([
            ':id' => $id,
            ':n' => $name,
            ':s' => $slug,
            ':d' => $input['description'] ?? null
        ]);

        Response::json(['message' => 'Categoría creada', 'id' => $id], 201);
    }

    private function listArticles(): void
    {
        $catId = $_GET['category_id'] ?? null;
        $q = $_GET['q'] ?? null;
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(5, min(100, (int)($_GET['per_page'] ?? 20)));
        $offset = ($page - 1) * $perPage;

        $where = ["1=1"];
        $params = [];

        if ($catId) {
            $where[] = "category_id = :cid";
            $params[':cid'] = $catId;
        }

        if ($q) {
            $where[] = "(title LIKE :q OR content LIKE :q)";
            $params[':q'] = "%$q%";
        }

        // Only published unless admin
        if (!empty($this->jwtConfig)) {
            Auth::attempt($this->pdo, $this->jwtConfig);
        }
        $user = Auth::user(); 
        $isAdmin = $user && in_array($user['platform_role'] ?? '', ['super_admin', 'support']);
        
        if (!$isAdmin) {
            $where[] = "is_published = 1";
        }

        $whereSql = implode(' AND ', $where);

        // Count
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM kb_articles WHERE $whereSql");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $sql = "SELECT id, category_id, title, slug, is_published, created_at FROM kb_articles WHERE $whereSql ORDER BY created_at DESC LIMIT :limit OFFSET :offset";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        Response::json([
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int)ceil($total / $perPage)),
            ]
        ]);
    }

    private function showArticle(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM kb_articles WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $article = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$article) {
            Response::error('Artículo no encontrado', 404);
            return;
        }

        Response::json(['data' => $article]);
    }

    private function createArticle(): void
    {
        $this->checkAdmin();
        $input = json_decode(file_get_contents('php://input'), true);
        
        $title = trim($input['title'] ?? '');
        $catId = $input['category_id'] ?? null;

        if (!$title || !$catId) {
            Response::error('Título y categoría son requeridos', 422);
            return;
        }

        $id = $this->uuid();
        $slug = strtolower(trim(preg_replace('/[^A-Za-z0-9-]+/', '-', $title)));

        $stmt = $this->pdo->prepare("
            INSERT INTO kb_articles (id, category_id, title, slug, content, is_published, created_at)
            VALUES (:id, :cid, :t, :s, :c, :pub, NOW())
        ");
        $stmt->execute([
            ':id' => $id,
            ':cid' => $catId,
            ':t' => $title,
            ':s' => $slug,
            ':c' => $input['content'] ?? '',
            ':pub' => !empty($input['is_published']) ? 1 : 0
        ]);

        Response::json(['message' => 'Artículo creado', 'id' => $id], 201);
    }

    private function updateArticle(string $id): void
    {
        $this->checkAdmin();
        $input = json_decode(file_get_contents('php://input'), true);
        
        $fields = [];
        $params = [':id' => $id];

        if (isset($input['title'])) {
            $fields[] = "title = :title";
            $params[':title'] = $input['title'];
            // Also update slug? Maybe.
        }
        if (isset($input['content'])) {
            $fields[] = "content = :content";
            $params[':content'] = $input['content'];
        }
        if (isset($input['is_published'])) {
            $fields[] = "is_published = :pub";
            $params[':pub'] = $input['is_published'] ? 1 : 0;
        }

        if (empty($fields)) {
            Response::json(['message' => 'Nada que actualizar']);
            return;
        }

        $sql = "UPDATE kb_articles SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        Response::json(['message' => 'Artículo actualizado']);
    }

    private function deleteArticle(string $id): void
    {
        $this->checkAdmin();
        $stmt = $this->pdo->prepare("DELETE FROM kb_articles WHERE id = :id");
        $stmt->execute([':id' => $id]);
        Response::json(['message' => 'Artículo eliminado']);
    }

    private function checkAdmin(): void
    {
        $user = Auth::user();
        if (!in_array($user['platform_role'] ?? '', ['super_admin', 'support'])) {
            Response::error('No autorizado', 403);
            exit;
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
