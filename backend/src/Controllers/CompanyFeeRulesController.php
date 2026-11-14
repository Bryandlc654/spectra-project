<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use App\Support\AuditLogger;
use PDO;
use Exception;

class CompanyFeeRulesController
{
    private PDO $pdo;
    private AuditLogger $audit;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->audit = new AuditLogger($this->pdo);
        $this->ensureExtensions();
    }

    private function ensureExtensions(): void
    {
        if (\App\Support\Cache::get('company_fee_rules_extensions_v1') !== null) return;

        try {
            $this->pdo->exec("
                CREATE TABLE IF NOT EXISTS company_fee_rules (
                    id CHAR(36) PRIMARY KEY,
                    company_id CHAR(36) NOT NULL,
                    type VARCHAR(32) NOT NULL,
                    value DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                    currency_id INT UNSIGNED NULL,
                    active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    deleted_at DATETIME NULL,
                    INDEX idx_cfr_company (company_id),
                    INDEX idx_cfr_active (active),
                    INDEX idx_cfr_type (type)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");

            $columns = [
                'position' => "ALTER TABLE company_fee_rules ADD COLUMN position VARCHAR(150) NULL AFTER type",
                'min_collaborators' => "ALTER TABLE company_fee_rules ADD COLUMN min_collaborators INT NOT NULL DEFAULT 0 AFTER position",
                'max_collaborators' => "ALTER TABLE company_fee_rules ADD COLUMN max_collaborators INT NULL AFTER min_collaborators",
                'priority' => "ALTER TABLE company_fee_rules ADD COLUMN priority INT NOT NULL DEFAULT 0 AFTER max_collaborators",
            ];

            foreach ($columns as $column => $sql) {
                if (!$this->columnExists('company_fee_rules', $column)) {
                    try {
                        $this->pdo->exec($sql);
                    } catch (Exception $e) { }
                }
            }

            \App\Support\Cache::set('company_fee_rules_extensions_v1', time(), 86400 * 365);
        } catch (\Throwable $e) {
            error_log('[CompanyFeeRules] Extension migration failed: ' . $e->getMessage());
        }
    }

    private function columnExists(string $table, string $column): bool
    {
        $stmt = $this->pdo->query("SHOW COLUMNS FROM `{$table}` LIKE " . $this->pdo->quote($column));
        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function handle(array $segments, string $method): void
    {
        $id = $segments[2] ?? null;

        try {
            switch ($method) {
                case 'GET':
                    $id ? $this->show($id) : $this->index();
                    break;
                case 'POST':
                    $this->store();
                    break;
                case 'PUT':
                case 'PATCH':
                    if (!$id) {
                        Response::error('Se requiere ID para actualizar', 400);
                        return;
                    }
                    $this->update($id);
                    break;
                case 'DELETE':
                    if (!$id) {
                        Response::error('Se requiere ID para eliminar', 400);
                        return;
                    }
                    $this->destroy($id);
                    break;
                default:
                    Response::error('Método no permitido', 405);
            }
        } catch (Exception $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    private function index(): void
    {
        $limit = (int)($_GET['limit'] ?? 25);
        if ($limit < 1) $limit = 25;
        if ($limit > 100) $limit = 100;
        
        $offset = (int)($_GET['offset'] ?? 0);
        $companyId = $_GET['company_id'] ?? null;

        $sql = "SELECT * FROM company_fee_rules";
        $params = [];

        if ($companyId) {
            $sql .= " WHERE company_id = :company_id";
            $params[':company_id'] = $companyId;
        }

        $sql .= " ORDER BY created_at DESC LIMIT :limit OFFSET :offset";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $key => $val) {
            $stmt->bindValue($key, $val);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        
        $stmt->execute();
        $data = $stmt->fetchAll();

        Response::json(['data' => $data]);
    }

    private function show(string $id): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM company_fee_rules WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $record = $stmt->fetch();

        if (!$record) {
            Response::error('Regla no encontrada', 404);
            return;
        }

        Response::json(['data' => $record]);
    }

    private function store(): void
    {
        $rawInput = file_get_contents('php://input');
        $data = json_decode($rawInput, true);

        // Si no es JSON válido o está vacío, intentar usar $_POST
        if (empty($data)) {
            $data = $_POST;
        }

        error_log("CompanyFeeRulesController::store RawInput: " . substr($rawInput, 0, 1000));
        error_log("CompanyFeeRulesController::store FinalData: " . json_encode($data));

        if (empty($data)) {
            Response::error('No se recibieron datos (JSON body o POST fields)', 400);
            return;
        }

        $this->validate($data);

        $id = $this->generateUuid();
        $now = date('Y-m-d H:i:s');

        $sql = "INSERT INTO company_fee_rules 
                (id, company_id, type, position, min_collaborators, max_collaborators, priority, value, currency_id, active, created_at, updated_at)
                VALUES 
                (:id, :company_id, :type, :position, :min_collaborators, :max_collaborators, :priority, :value, :currency_id, :active, :created_at, :updated_at)";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':id' => $id,
            ':company_id' => $data['company_id'],
            ':type' => $data['type'],
            ':position' => !empty($data['position']) ? trim((string)$data['position']) : null,
            ':min_collaborators' => (int)($data['min_collaborators'] ?? 0),
            ':max_collaborators' => (isset($data['max_collaborators']) && $data['max_collaborators'] !== '') ? (int)$data['max_collaborators'] : null,
            ':priority' => (int)($data['priority'] ?? 0),
            ':value' => $data['value'],
            ':currency_id' => $data['currency_id'] ?? null,
            ':active' => isset($data['active']) ? (int)(bool)$data['active'] : 1,
            ':created_at' => $now,
            ':updated_at' => $now
        ]);

        $this->audit->log('fee_rule.created', 'company_fee_rule', $id, [
            'company_id' => $data['company_id'],
            'type' => $data['type'],
            'position' => $data['position'] ?? null,
            'min_collaborators' => $data['min_collaborators'] ?? 0,
            'max_collaborators' => $data['max_collaborators'] ?? null,
            'value' => $data['value'],
            'currency_id' => $data['currency_id'] ?? null
        ]);

        Response::json(['message' => 'Regla creada', 'id' => $id], 201);
    }

    private function update(string $id): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data) {
            Response::error('JSON inválido', 400);
            return;
        }

        // Verificar existencia
        $stmt = $this->pdo->prepare("SELECT id FROM company_fee_rules WHERE id = :id");
        $stmt->execute([':id' => $id]);
        if (!$stmt->fetch()) {
            Response::error('Regla no encontrada', 404);
            return;
        }

        $fields = [];
        $params = [':id' => $id];

        if (isset($data['company_id'])) {
            $fields[] = "company_id = :company_id";
            $params[':company_id'] = $data['company_id'];
        }
        if (isset($data['type'])) {
            $fields[] = "type = :type";
            $params[':type'] = $data['type'];
        }
        if (array_key_exists('position', $data)) {
            $fields[] = "position = :position";
            $params[':position'] = !empty($data['position']) ? trim((string)$data['position']) : null;
        }
        if (array_key_exists('min_collaborators', $data)) {
            $fields[] = "min_collaborators = :min_collaborators";
            $params[':min_collaborators'] = (int)($data['min_collaborators'] ?? 0);
        }
        if (array_key_exists('max_collaborators', $data)) {
            $fields[] = "max_collaborators = :max_collaborators";
            $params[':max_collaborators'] = ($data['max_collaborators'] === '' || $data['max_collaborators'] === null) ? null : (int)$data['max_collaborators'];
        }
        if (array_key_exists('priority', $data)) {
            $fields[] = "priority = :priority";
            $params[':priority'] = (int)($data['priority'] ?? 0);
        }
        if (isset($data['value'])) {
            $fields[] = "value = :value";
            $params[':value'] = $data['value'];
        }
        if (array_key_exists('currency_id', $data)) {
            $fields[] = "currency_id = :currency_id";
            $params[':currency_id'] = $data['currency_id'];
        }
        if (isset($data['active'])) {
            $fields[] = "active = :active";
            $params[':active'] = $data['active'];
        }

        if (empty($fields)) {
            Response::error('Nada que actualizar', 400);
            return;
        }

        $fields[] = "updated_at = :updated_at";
        $params[':updated_at'] = date('Y-m-d H:i:s');

        $sql = "UPDATE company_fee_rules SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        $this->audit->log('fee_rule.updated', 'company_fee_rule', $id, [
            'changes' => $data,
            'reason' => $data['reason'] ?? null
        ]);

        Response::json(['message' => 'Regla actualizada']);
    }

    private function destroy(string $id): void
    {
        $stmt = $this->pdo->prepare("DELETE FROM company_fee_rules WHERE id = :id");
        $stmt->execute([':id' => $id]);
        
        if ($stmt->rowCount() === 0) {
            Response::error('Regla no encontrada', 404);
            return;
        }

        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $reason = $input['reason'] ?? null;

        $this->audit->log('fee_rule.deleted', 'company_fee_rule', $id, ['reason' => $reason]);

        Response::json(['message' => 'Regla eliminada']);
    }

    private function validate(array $data): void
    {
        // Validar company_id
        if (!isset($data['company_id']) || $data['company_id'] === '' || $data['company_id'] === null) {
            error_log("Validación falló: company_id faltante o vacío");
            Response::error('company_id es requerido (Validación Controlador Específico)', 422);
            exit;
        }

        if (empty($data['type'])) {
            Response::error('type es requerido', 422);
            exit;
        }
        if (!isset($data['value']) || !is_numeric($data['value'])) {
            Response::error('value debe ser numérico', 422);
            exit;
        }

        $validTypes = ['platform_fee', 'per_freelancer_fee', 'payroll_fee', 'invoice_fee', 'contract_fee'];
        if (!in_array((string)$data['type'], $validTypes, true)) {
            Response::error('type inválido', 422);
            exit;
        }

        $min = (int)($data['min_collaborators'] ?? 0);
        $maxRaw = $data['max_collaborators'] ?? null;
        $max = ($maxRaw === '' || $maxRaw === null) ? null : (int)$maxRaw;

        if ($min < 0) {
            Response::error('min_collaborators no puede ser negativo', 422);
            exit;
        }
        if ($max !== null && $max < $min) {
            Response::error('max_collaborators no puede ser menor que min_collaborators', 422);
            exit;
        }
    }

    private function generateUuid(): string
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
