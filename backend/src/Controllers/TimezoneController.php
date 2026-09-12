<?php

namespace App\Controllers;

use App\Database;
use App\Support\Cache;
use App\Support\Response;
use PDO;
use Throwable;

final class TimezoneController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
    }

    public function handle(array $segments, string $method): void
    {
        // segments: ["api","timezones", {id?}]
        $id = $segments[2] ?? null;

        if ($id === null || $id === '') {
            if ($method === 'GET') { $this->index(); return; }
            if ($method === 'POST') { $this->store(); return; }
            Response::error('Método no permitido', 405);
            return;
        }

        if ($method === 'GET') { $this->show($id); return; }
        if ($method === 'PUT' || $method === 'PATCH') { $this->update($id); return; }
        if ($method === 'DELETE') { $this->destroy($id); return; }

        Response::error('Método no permitido', 405);
    }

    private function index(): void
    {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 10)));
        $q = trim((string)($_GET['q'] ?? ''));

        $where = [];
        $params = [];

        if ($q === '') {
            $records = Cache::remember('ref:timezones', 3600, function (): array {
                $stmt = $this->pdo->query("SELECT id, name, created_at, updated_at FROM timezones ORDER BY name ASC");
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

        $where[] = '(t.name LIKE :q OR CAST(t.id AS CHAR) LIKE :q)';

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM timezones t {$whereSql}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $offset = ($page - 1) * $perPage;

        $sql = "
            SELECT t.id, t.name, t.created_at, t.updated_at
            FROM timezones t
            {$whereSql}
            ORDER BY t.name ASC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) $stmt->bindValue($k, $v);
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $items = $stmt->fetchAll() ?: [];
        $totalPages = max(1, (int)ceil($total / max(1, $perPage)));

        Response::json([
            'data' => $items,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => $totalPages,
            ],
        ]);
    }

    private function store(): void
    {
        $payload = $this->readPayload();
        $name = trim((string)($payload['name'] ?? ''));

        if ($name === '') {
            Response::error('name es requerido', 422);
            return;
        }
        if (mb_strlen($name) > 64) {
            Response::error('name excede 64 caracteres', 422);
            return;
        }

        // Validación de unicidad (mensajes claros)
        $exists = $this->pdo->prepare("SELECT 1 FROM timezones WHERE name LIKE :n LIMIT 1");
        $exists->execute([':n' => $name]);
        if ($exists->fetchColumn()) {
            Response::error('Ya existe una zona horaria con ese nombre', 422);
            return;
        }

        $stmt = $this->pdo->prepare("
            INSERT INTO timezones (name, created_at, updated_at)
            VALUES (:name, NOW(), NOW())
        ");
        $stmt->execute([':name' => $name]);

        $id = (int)$this->pdo->lastInsertId();

        Cache::delete('ref:timezones');

        Response::json([
            'message' => 'Timezone creada',
            'data' => [
                'id' => $id,
                'name' => $name,
            ],
        ], 201);
    }

    private function show(string $id): void
    {
        $idInt = (int)$id;
        if ($idInt <= 0) {
            Response::error('ID inválido', 422);
            return;
        }

        $stmt = $this->pdo->prepare("SELECT id, name, created_at, updated_at FROM timezones WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $idInt]);
        $row = $stmt->fetch();

        if (!$row) {
            Response::error('Timezone no encontrada', 404);
            return;
        }

        Response::json(['data' => $row]);
    }

    private function update(string $id): void
    {
        $idInt = (int)$id;
        if ($idInt <= 0) {
            Response::error('ID inválido', 422);
            return;
        }

        $payload = $this->readPayload();
        $name = array_key_exists('name', $payload) ? trim((string)$payload['name']) : '';

        if ($name === '') {
            Response::error('name es requerido', 422);
            return;
        }
        if (mb_strlen($name) > 64) {
            Response::error('name excede 64 caracteres', 422);
            return;
        }

        // Verificar existencia
        $chk = $this->pdo->prepare("SELECT id FROM timezones WHERE id = :id LIMIT 1");
        $chk->execute([':id' => $idInt]);
        if (!$chk->fetchColumn()) {
            Response::error('Timezone no encontrada', 404);
            return;
        }

        // Unicidad excluyendo el mismo ID
        $exists = $this->pdo->prepare("SELECT 1 FROM timezones WHERE name LIKE :n AND id <> :id LIMIT 1");
        $exists->execute([':n' => $name, ':id' => $idInt]);
        if ($exists->fetchColumn()) {
            Response::error('Ya existe una zona horaria con ese nombre', 422);
            return;
        }

        $stmt = $this->pdo->prepare("UPDATE timezones SET name = :name, updated_at = NOW() WHERE id = :id");
        $stmt->execute([':name' => $name, ':id' => $idInt]);

        Cache::delete('ref:timezones');

        Response::json(['message' => 'Timezone actualizada']);
    }

    private function destroy(string $id): void
    {
        $idInt = (int)$id;
        if ($idInt <= 0) {
            Response::error('ID inválido', 422);
            return;
        }

        // Si companies.timezone_id existe, bloquear si está en uso
        if ($this->tableExists('companies') && $this->columnExists('companies', 'timezone_id')) {
            $inUse = $this->pdo->prepare("SELECT COUNT(*) FROM companies WHERE timezone_id = :id AND deleted_at IS NULL");
            $inUse->execute([':id' => $idInt]);
            $count = (int)$inUse->fetchColumn();
            if ($count > 0) {
                Response::error('No se puede eliminar: está asignada a una o más empresas', 409, ['in_use' => $count]);
                return;
            }
        }

        $stmt = $this->pdo->prepare("DELETE FROM timezones WHERE id = :id");
        $stmt->execute([':id' => $idInt]);

        if ($stmt->rowCount() === 0) {
            Response::error('Timezone no encontrada', 404);
            return;
        }

        Cache::delete('ref:timezones');

        Response::json(['message' => 'Timezone eliminada']);
    }

    private function readPayload(): array
    {
        $raw = file_get_contents('php://input');

        if ($raw) {
            $json = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($json)) {
                return $json;
            }
        }

        if (!empty($_POST)) return $_POST;

        if ($raw && strpos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/x-www-form-urlencoded') !== false) {
            parse_str($raw, $parsed);
            if (is_array($parsed)) return $parsed;
        }

        return [];
    }

    private function tableExists(string $table): bool
    {
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $table)) return false;
        $stmt = $this->pdo->prepare("
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = :t
            LIMIT 1
        ");
        $stmt->execute([':t' => $table]);
        return (bool)$stmt->fetchColumn();
    }

    private function columnExists(string $table, string $column): bool
    {
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $table)) return false;
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $column)) return false;

        $stmt = $this->pdo->prepare("
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = :t
              AND column_name = :c
            LIMIT 1
        ");
        $stmt->execute([':t' => $table, ':c' => $column]);
        return (bool)$stmt->fetchColumn();
    }
}
