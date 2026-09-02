<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use PDO;

class GenericController
{
    private PDO $pdo;
    private array $pagination;

    public function __construct(Database $database, array $pagination)
    {
        $this->pdo = $database->pdo();
        $this->pagination = $pagination;
    }

    public function handle(string $table, ?string $id, string $method): void
    {
        if (!$this->isSafeIdentifier($table)) {
            Response::error('Nombre de tabla inválido', 400);
            return;
        }

        if (!$this->tableExists($table)) {
            Response::error('La tabla no existe en la base de datos', 404);
            return;
        }

        switch ($method) {
            case 'GET':
                $id ? $this->show($table, $id) : $this->index($table);
                break;
            case 'POST':
                $this->store($table);
                break;
            case 'PUT':
            case 'PATCH':
                if (!$id) {
                    Response::error('Se requiere un identificador para actualizar', 400);
                    return;
                }
                $this->update($table, $id);
                break;
            case 'DELETE':
                if (!$id) {
                    Response::error('Se requiere un identificador para eliminar', 400);
                    return;
                }
                $this->destroy($table, $id);
                break;
            default:
                Response::error('Método no soportado', 405);
        }
    }

    private function index(string $table): void
    {
        $limit = (int)($_GET['limit'] ?? $this->pagination['per_page']);
        if ($limit < 1) $limit = $this->pagination['per_page'];
        if ($limit > 100) $limit = 100;

        $offset = (int)($_GET['offset'] ?? 0);

        // Count total
        $countSql = sprintf('SELECT COUNT(*) FROM `%s`', $table);
        $total = (int)$this->pdo->query($countSql)->fetchColumn();

        $sql = sprintf('SELECT * FROM `%s` LIMIT :limit OFFSET :offset', $table);
        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        Response::json([
            'data' => $stmt->fetchAll(),
            'pagination' => [
                'limit' => $limit,
                'offset' => $offset,
                'total' => $total,
            ],
        ]);
    }

    private function show(string $table, string $id): void
    {
        $primaryKey = $this->detectPrimaryKey($table);
        if (!$primaryKey) {
            Response::error('No se pudo determinar la llave primaria de la tabla', 422);
            return;
        }

        $sql = sprintf('SELECT * FROM `%s` WHERE `%s` LIKE :id LIMIT 1', $table, $primaryKey);
        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':id', $id);
        $stmt->execute();

        $record = $stmt->fetch();
        if (!$record) {
            Response::error("Registro no encontrado en tabla: $table", 404);
            return;
        }

        Response::json(['data' => $record]);
    }

    private function store(string $table): void
    {
        $payload = $this->readJson();
        if ($payload === null) {
            Response::error('JSON inválido o ausente', 400);
            return;
        }

        [$columns, $placeholders, $values] = $this->buildInsertParts($table, $payload);
        if (empty($columns)) {
            Response::error('No hay columnas válidas para insertar', 422);
            return;
        }

        $sql = sprintf('INSERT INTO `%s` (%s) VALUES (%s)', $table, implode(',', $columns), implode(',', $placeholders));
        $stmt = $this->pdo->prepare($sql);
        foreach ($values as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->execute();

        Response::json(['data' => ['id' => $this->pdo->lastInsertId()]], 201);
    }

    private function update(string $table, string $id): void
    {
        $payload = $this->readJson();
        if ($payload === null) {
            Response::error('JSON inválido o ausente', 400);
            return;
        }

        $primaryKey = $this->detectPrimaryKey($table);
        if (!$primaryKey) {
            Response::error('No se pudo determinar la llave primaria de la tabla', 422);
            return;
        }

        [$assignments, $values] = $this->buildUpdateParts($table, $payload);
        if (empty($assignments)) {
            Response::error('No hay campos válidos para actualizar', 422);
            return;
        }

        $sql = sprintf('UPDATE `%s` SET %s WHERE `%s` = :id', $table, implode(',', $assignments), $primaryKey);
        $stmt = $this->pdo->prepare($sql);
        foreach ($values as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':id', $id);
        $stmt->execute();

        Response::json(['message' => 'Registro actualizado']);
    }

    private function destroy(string $table, string $id): void
    {
        $primaryKey = $this->detectPrimaryKey($table);
        if (!$primaryKey) {
            Response::error('No se pudo determinar la llave primaria de la tabla', 422);
            return;
        }

        $sql = sprintf('DELETE FROM `%s` WHERE `%s` LIKE :id', $table, $primaryKey);
        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':id', $id);
        $stmt->execute();

        Response::json(['message' => 'Registro eliminado']);
    }

    private function buildInsertParts(string $table, array $payload): array
    {
        $columns = $this->tableColumns($table);
        $insertColumns = [];
        $placeholders = [];
        $values = [];

        foreach ($payload as $field => $value) {
            if (!in_array($field, $columns, true)) {
                continue;
            }
            $placeholder = ':' . $field;
            $insertColumns[] = sprintf('`%s`', $field);
            $placeholders[] = $placeholder;
            $values[$placeholder] = $value;
        }

        return [$insertColumns, $placeholders, $values];
    }

    private function buildUpdateParts(string $table, array $payload): array
    {
        $columns = $this->tableColumns($table);
        $assignments = [];
        $values = [];

        foreach ($payload as $field => $value) {
            if (!in_array($field, $columns, true)) {
                continue;
            }
            $placeholder = ':' . $field;
            $assignments[] = sprintf('`%s` = %s', $field, $placeholder);
            $values[$placeholder] = $value;
        }

        return [$assignments, $values];
    }

    private function detectPrimaryKey(string $table): ?string
    {
        $sql = 'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_KEY = "PRI" LIMIT 1';
        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':table', $table);
        $stmt->execute();

        $column = $stmt->fetchColumn();
        return $column ?: null;
    }

    private function tableExists(string $table): bool
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table');
        $stmt->bindValue(':table', $table);
        $stmt->execute();
        return (bool)$stmt->fetchColumn();
    }

    private function tableColumns(string $table): array
    {
        $stmt = $this->pdo->prepare('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table');
        $stmt->bindValue(':table', $table);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    private function readJson(): ?array
    {
        $input = file_get_contents('php://input');
        $decoded = json_decode($input, true);
        return is_array($decoded) ? $decoded : null;
    }

    private function isSafeIdentifier(string $name): bool
    {
        return (bool)preg_match('/^[a-zA-Z0-9_]+$/', $name);
    }
}
