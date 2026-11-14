<?php

namespace App\Controllers;

use App\Database;
use App\Support\Auth;
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

    /**
     * Tablas que NUNCA se exponen por el CRUD genérico (credenciales, sesiones,
     * permisos, dinero e infraestructura). Tienen controladores dedicados o no
     * deben ser accesibles por API.
     */
    private const BLOCKED_TABLES = [
        'users', 'user_sessions', 'user_identities', 'user_roles', 'password_resets',
        'login_attempts', 'role_permissions', 'system_role_permissions', 'company_users',
        'wallets', 'wallet_transactions', 'payouts', 'bank_accounts', 'card_transactions',
        'salary_advances', 'advance_repayments', 'system_settings', 'tenant_integrations',
        'kyb_requests', 'kyc_requests', 'cache', 'cache_locks', 'jobs', 'job_batches',
        'failed_jobs', 'migrations',
    ];

    /** Columnas sensibles: se ocultan en lecturas y no se pueden escribir. */
    private const SENSITIVE_COLUMN_PATTERN = '/(password|passwd|token|secret|api_key|apikey|private_key|otp|two_factor|2fa)/i';

    /** Solo el staff interno de la plataforma puede usar el CRUD genérico. */
    private const ALLOWED_ROLES = ['super_admin', 'admin'];

    public function handle(string $table, ?string $id, string $method): void
    {
        $role = (string)(Auth::user()['platform_role'] ?? '');
        if (!in_array($role, self::ALLOWED_ROLES, true)) {
            Response::error('Acceso denegado', 403);
            return;
        }

        if (!$this->isSafeIdentifier($table)) {
            Response::error('Nombre de tabla inválido', 400);
            return;
        }

        if (in_array(strtolower($table), self::BLOCKED_TABLES, true)) {
            Response::error('Recurso no disponible', 404);
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
            'data' => array_map([$this, 'redact'], $stmt->fetchAll()),
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

        $sql = sprintf('SELECT * FROM `%s` WHERE `%s` = :id LIMIT 1', $table, $primaryKey);
        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue(':id', $id);
        $stmt->execute();

        $record = $stmt->fetch();
        if (!$record) {
            Response::error('Registro no encontrado', 404);
            return;
        }

        Response::json(['data' => $this->redact($record)]);
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

        $sql = sprintf('DELETE FROM `%s` WHERE `%s` = :id', $table, $primaryKey);
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
            if (!in_array($field, $columns, true) || preg_match(self::SENSITIVE_COLUMN_PATTERN, (string)$field)) {
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
            if (!in_array($field, $columns, true) || preg_match(self::SENSITIVE_COLUMN_PATTERN, (string)$field)) {
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

    private function redact(array $row): array
    {
        foreach (array_keys($row) as $col) {
            if (preg_match(self::SENSITIVE_COLUMN_PATTERN, (string)$col)) unset($row[$col]);
        }
        return $row;
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
