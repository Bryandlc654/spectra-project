<?php

namespace App\Controllers;

use App\Database;
use App\Support\Cache;
use App\Support\Response;
use PDO;
use Throwable;

final class CountryController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function ensureTables(): void
    {
        // Try to add missing columns if they don't exist
        try {
            $this->pdo->exec("ALTER TABLE countries ADD COLUMN iso2 CHAR(2) NOT NULL UNIQUE AFTER id");
        } catch (Throwable $e) {}

        // Rename code to iso2 if it exists (for migration)
        try {
            $this->pdo->exec("ALTER TABLE countries CHANGE COLUMN code iso2 CHAR(2) NOT NULL UNIQUE");
        } catch (Throwable $e) {}

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS countries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                iso2 CHAR(2) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                currency_code CHAR(3) NULL,
                region VARCHAR(50) NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
        
        // Add currency_code and region if missing
        try {
            $this->pdo->exec("ALTER TABLE countries ADD COLUMN currency_code CHAR(3) NULL AFTER name");
        } catch (Throwable $e) {}
        try {
            $this->pdo->exec("ALTER TABLE countries ADD COLUMN region VARCHAR(50) NULL AFTER currency_code");
        } catch (Throwable $e) {}

        // Seed default countries if empty
        $stmt = $this->pdo->query("SELECT COUNT(*) FROM countries");
        if ($stmt->fetchColumn() == 0) {
            $this->pdo->exec("
                INSERT INTO countries (iso2, name, currency_code, region) VALUES
                ('PE', 'Perú', 'PEN', 'LATAM'),
                ('MX', 'México', 'MXN', 'LATAM'),
                ('US', 'Estados Unidos', 'USD', 'NA'),
                ('CO', 'Colombia', 'COP', 'LATAM'),
                ('CL', 'Chile', 'CLP', 'LATAM'),
                ('AR', 'Argentina', 'ARS', 'LATAM'),
                ('BR', 'Brasil', 'BRL', 'LATAM'),
                ('ES', 'España', 'EUR', 'EU')
            ");
        }
    }

    public function handle(array $segments, string $method): void
    {
        try {
            // /api/countries/{id}
            $id = $segments[2] ?? null;

            if ($id === null || $id === '') {
                if ($method === 'GET') { $this->index(); return; }
                if ($method === 'POST') { $this->store(); return; }
                Response::error('Método no permitido', 405);
                return;
            }

            if ($method === 'GET') { $this->show((int)$id); return; }
            if ($method === 'PUT' || $method === 'PATCH') { $this->update((int)$id); return; }
            if ($method === 'DELETE') { $this->destroy((int)$id); return; }

            Response::error('Método no permitido', 405);
        } catch (Throwable $e) {
            Response::error('Error interno', 500, ['message' => $e->getMessage()]);
        }
    }

    private function index(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 10)));
        $q = trim((string)($_GET['q'] ?? ''));

        $where = [];
        $params = [];

        if ($q === '') {
            $records = Cache::remember('ref:countries', 3600, function (): array {
                $stmt = $this->pdo->query("SELECT id, iso2, name FROM countries ORDER BY name ASC");
                return $stmt->fetchAll() ?: [];
            });

            $total = count($records);
            $offset = ($page - 1) * $perPage;
            $items = array_values(array_slice($records, $offset, $perPage));

            Response::json([
                'data' => $items,
                'meta' => [
                    'page' => $page,
                    'per_page' => $perPage,
                    'total' => $total,
                    'total_pages' => max(1, (int)ceil($total / max(1, $perPage))),
                ],
            ]);
            return;
        }

        $where[] = '(name LIKE :q OR iso2 LIKE :q)';
        $params[':q'] = "%$q%";

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM countries {$whereSql}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;

        $stmt = $this->pdo->prepare("SELECT id, iso2, name FROM countries {$whereSql} ORDER BY name ASC LIMIT :l OFFSET :o");
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':l', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':o', $offset, PDO::PARAM_INT);
        $stmt->execute();

        Response::json([
            'data' => $stmt->fetchAll() ?: [],
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int)ceil($total / max(1, $perPage))),
            ],
        ]);
    }

    private function show(int $id): void
    {
        $stmt = $this->pdo->prepare("SELECT id, iso2, name FROM countries WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            Response::error('País no encontrado', 404);
            return;
        }

        Response::json(['data' => $row]);
    }

    private function store(): void
    {
        $payload = $this->readPayload();

        $iso2 = strtoupper(trim((string)($payload['iso2'] ?? '')));
        $name = trim((string)($payload['name'] ?? ''));

        if ($iso2 === '' || $name === '') {
            Response::error('iso2 y name son requeridos', 422);
            return;
        }
        if (!preg_match('/^[A-Z]{2}$/', $iso2)) {
            Response::error('iso2 debe tener 2 letras (ej: PE)', 422);
            return;
        }

        if ($this->existsByIso2($iso2)) {
            Response::error('Ya existe un país con ese iso2', 409);
            return;
        }

        $stmt = $this->pdo->prepare("INSERT INTO countries (iso2, name) VALUES (:iso2, :name)");
        $stmt->execute([':iso2' => $iso2, ':name' => $name]);

        Cache::delete('ref:countries');

        Response::json(['message' => 'País creado', 'data' => ['id' => (int)$this->pdo->lastInsertId()]], 201);
    }

    private function update(int $id): void
    {
        $exists = $this->pdo->prepare("SELECT id FROM countries WHERE id = :id LIMIT 1");
        $exists->execute([':id' => $id]);
        if (!$exists->fetchColumn()) {
            Response::error('País no encontrado', 404);
            return;
        }

        $payload = $this->readPayload();

        $iso2 = array_key_exists('iso2', $payload) ? strtoupper(trim((string)$payload['iso2'])) : null;
        $name = array_key_exists('name', $payload) ? trim((string)$payload['name']) : null;

        $sets = [];
        $params = [':id' => $id];

        if ($iso2 !== null) {
            if (!preg_match('/^[A-Z]{2}$/', $iso2)) {
                Response::error('iso2 debe tener 2 letras (ej: PE)', 422);
                return;
            }
            if ($this->existsByIso2($iso2, $id)) {
                Response::error('Ya existe un país con ese iso2', 409);
                return;
            }
            $sets[] = "iso2 = :iso2";
            $params[':iso2'] = $iso2;
        }

        if ($name !== null) {
            if ($name === '') {
                Response::error('name no puede estar vacío', 422);
                return;
            }
            $sets[] = "name = :name";
            $params[':name'] = $name;
        }

        if (!$sets) {
            Response::error('Nada para actualizar', 422);
            return;
        }

        $stmt = $this->pdo->prepare("UPDATE countries SET " . implode(', ', $sets) . " WHERE id = :id");
        $stmt->execute($params);

        Cache::delete('ref:countries');

        Response::json(['message' => 'País actualizado']);
    }

    private function destroy(int $id): void
    {
        $exists = $this->pdo->prepare("SELECT id FROM countries WHERE id = :id LIMIT 1");
        $exists->execute([':id' => $id]);
        if (!$exists->fetchColumn()) {
            Response::error('País no encontrado', 404);
            return;
        }

        // Evitar eliminar países en uso por empresas
        try {
            $ref = $this->pdo->prepare("SELECT COUNT(*) FROM companies WHERE country_id = :id");
            $ref->execute([':id' => $id]);
            if ((int)$ref->fetchColumn() > 0) {
                Response::error('No se puede eliminar el país: está en uso por empresas', 409);
                return;
            }
        } catch (Throwable $e) {
            // La tabla companies podría no tener country_id; continuar
        }

        try {
            $stmt = $this->pdo->prepare("DELETE FROM countries WHERE id = :id");
            $stmt->execute([':id' => $id]);
        } catch (Throwable $e) {
            Response::error('No se puede eliminar el país: está en uso', 409);
            return;
        }
        Cache::delete('ref:countries');

        Response::json(['message' => 'País eliminado']);
    }

    private function existsByIso2(string $iso2, ?int $ignoreId = null): bool
    {
        if ($ignoreId) {
            $stmt = $this->pdo->prepare("SELECT id FROM countries WHERE iso2 = :iso2 AND id <> :id LIMIT 1");
            $stmt->execute([':iso2' => $iso2, ':id' => $ignoreId]);
            return (bool)$stmt->fetchColumn();
        }

        $stmt = $this->pdo->prepare("SELECT id FROM countries WHERE iso2 = :iso2 LIMIT 1");
        $stmt->execute([':iso2' => $iso2]);
        return (bool)$stmt->fetchColumn();
    }

    private function readPayload(): array
    {
        $raw = file_get_contents('php://input') ?: '';

        if ($raw !== '') {
            $json = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($json)) return $json;
        }

        if (!empty($_POST)) return $_POST;

        $ct = $_SERVER['CONTENT_TYPE'] ?? '';
        if ($raw !== '' && stripos($ct, 'application/x-www-form-urlencoded') !== false) {
            parse_str($raw, $parsed);
            if (is_array($parsed)) return $parsed;
        }

        return [];
    }
}
