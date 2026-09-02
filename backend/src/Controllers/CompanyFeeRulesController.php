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
                (id, company_id, type, value, currency_id, active, created_at, updated_at)
                VALUES 
                (:id, :company_id, :type, :value, :currency_id, :active, :created_at, :updated_at)";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            ':id' => $id,
            ':company_id' => $data['company_id'],
            ':type' => $data['type'],
            ':value' => $data['value'],
            ':currency_id' => $data['currency_id'] ?? null,
            ':active' => $data['active'] ?? 1,
            ':created_at' => $now,
            ':updated_at' => $now
        ]);

        $this->audit->log('fee_rule.created', 'company_fee_rule', $id, [
            'company_id' => $data['company_id'],
            'type' => $data['type'],
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
