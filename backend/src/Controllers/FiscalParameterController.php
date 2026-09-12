<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use PDO;
use Throwable;

class FiscalParameterController
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
        if (\App\Support\Cache::get('fiscal_params_schema_v1') === null) {
            $this->ensureTable();
            $this->ensureColumns();
            \App\Support\Cache::set('fiscal_params_schema_v1', time(), 86400 * 365);
        }
    }

    private function ensureTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS fiscal_parameters (
                id INT AUTO_INCREMENT PRIMARY KEY,
                country_id INT NOT NULL,
                name VARCHAR(100) NOT NULL,
                code VARCHAR(50) NOT NULL,
                percentage DECIMAL(10, 4) DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                description TEXT NULL,
                valid_from DATE NULL,
                valid_to DATE NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    private function ensureColumns(): void
    {
        $columns = [
            "ADD COLUMN type VARCHAR(50) NOT NULL DEFAULT 'tax' AFTER code",
            "ADD COLUMN calculation_base VARCHAR(50) NOT NULL DEFAULT 'gross_fees' AFTER percentage",
            "ADD COLUMN payslip_trigger VARCHAR(50) DEFAULT 'on_payment' AFTER calculation_base",
            "ADD COLUMN applies_to VARCHAR(20) NOT NULL DEFAULT 'any' AFTER payslip_trigger",
            "ADD COLUMN valid_from DATE NULL",
            "ADD COLUMN valid_to DATE NULL"
        ];

        foreach ($columns as $sql) {
            try {
                $this->pdo->exec("ALTER TABLE fiscal_parameters $sql");
            } catch (Throwable $e) {
                // Ignore if column exists
            }
        }
        try {
            $this->pdo->exec("ALTER TABLE fiscal_parameters ADD UNIQUE INDEX uniq_country_code (country_id, code)");
        } catch (Throwable $e) {
            // Ignore if index exists
        }
        
        $this->ensureDefaults();
    }

    private function ensureDefaults(): void
    {
        try {
            $seed = getenv('FISCAL_SEED_DEFAULTS');
            $seedEnabled = is_string($seed) && in_array(strtolower($seed), ['1', 'true', 'yes'], true);
            if (!$seedEnabled) {
                return;
            }
            // Find countries
            $stmt = $this->pdo->prepare("SELECT id, iso2 FROM countries WHERE iso2 IN ('PE', 'CO')");
            $stmt->execute();
            $countries = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $byIso = [];
            foreach ($countries as $c) $byIso[$c['iso2']] = $c['id'];
            
            // Peru defaults (empleado y contratista)
            if (!empty($byIso['PE'])) {
                $pe = (int)$byIso['PE'];
                // Only seed if country has no parameters yet
                $cnt = (int)$this->pdo->prepare("SELECT COUNT(*) FROM fiscal_parameters WHERE country_id = $pe")->execute() || 0;
                try {
                    $stmtCnt = $this->pdo->prepare("SELECT COUNT(*) FROM fiscal_parameters WHERE country_id = :cid");
                    $stmtCnt->execute([':cid' => $pe]);
                    $cnt = (int)$stmtCnt->fetchColumn();
                } catch (Throwable $e) {}
                if ($cnt > 0) {
                    // Skip seeding if already has parameters
                } else {
                // Dependiente (5ta categoría): aporte a pensiones del trabajador (~13%)
                $this->upsertParam($pe, 'PE_PENSION_EMP', 'Aporte a Pensiones (Empleado) 13%', 'contribution', 13.0, 'payroll_gross', 'monthly', 'employee');
                // Dependiente: Impuesto a la Renta 5ta (estimación mensual simple sobre bruto)
                $this->upsertParam($pe, 'PE_IR5TA_EST', 'Impuesto a la Renta 5ta (estimado)', 'tax', 8.0, 'payroll_gross', 'monthly', 'employee');
                // Independiente (4ta categoría): retención 8% sobre honorarios
                $this->upsertParam($pe, 'PE_IR4TA', 'Impuesto a la Renta 4ta 8%', 'withholding', 8.0, 'gross_fees', 'monthly', 'contractor');
                }
            }
            // Colombia defaults (empleado lado trabajador)
            if (!empty($byIso['CO'])) {
                $co = (int)$byIso['CO'];
                // Only seed if country has no parameters yet
                $cntCo = 0;
                try {
                    $stmtCnt = $this->pdo->prepare("SELECT COUNT(*) FROM fiscal_parameters WHERE country_id = :cid");
                    $stmtCnt->execute([':cid' => $co]);
                    $cntCo = (int)$stmtCnt->fetchColumn();
                } catch (Throwable $e) {}
                if ($cntCo === 0) {
                    $this->upsertParam($co, 'CO_SALUD_EMP', 'Salud (Empleado) 4%', 'contribution', 4.0, 'payroll_gross', 'monthly', 'employee');
                    $this->upsertParam($co, 'CO_PENSION_EMP', 'Pensión (Empleado) 4%', 'contribution', 4.0, 'payroll_gross', 'monthly', 'employee');
                    // Impuesto de renta laboral estimado (tasa promedio simplificada)
                    $this->upsertParam($co, 'CO_RTEFUENTE_EST', 'Renta laboral estimada', 'tax', 10.0, 'payroll_gross', 'monthly', 'employee');
                }
            }
        } catch (Throwable $e) {
            // Silent fail to avoid blocking boot
        }
    }

    private function upsertParam(int $countryId, string $code, string $name, string $type, float $percentage, string $base, string $trigger, string $appliesTo): void
    {
        // Check existence by code+country
        $stmt = $this->pdo->prepare("SELECT id FROM fiscal_parameters WHERE country_id = :cid AND code = :code LIMIT 1");
        $stmt->execute([':cid' => $countryId, ':code' => $code]);
        if ($stmt->fetch()) return;
        
        $stmtIns = $this->pdo->prepare("
            INSERT INTO fiscal_parameters (country_id, name, code, percentage, description, type, calculation_base, payslip_trigger, applies_to)
            VALUES (:cid, :name, :code, :perc, :desc, :type, :base, :trigger, :applies)
        ");
        $stmtIns->execute([
            ':cid' => $countryId,
            ':name' => $name,
            ':code' => $code,
            ':perc' => $percentage,
            ':desc' => null,
            ':type' => $type,
            ':base' => $base,
            ':trigger' => $trigger,
            ':applies' => $appliesTo
        ]);
    }

    public function handleNested(array $segments, string $method): void
    {
        // /api/countries/{id}/fiscal-parameters
        $countryId = (int)($segments[2] ?? 0);
        if (!$countryId) {
            Response::error('ID de país inválido', 400);
            return;
        }

        if ($method === 'GET') {
            $this->index($countryId);
            return;
        }
        if ($method === 'POST') {
            $this->store($countryId);
            return;
        }

        Response::error('Método no permitido', 405);
    }

    public function handleDirect(array $segments, string $method): void
    {
        // /api/fiscal-parameters/{id}
        $id = (int)($segments[2] ?? 0);
        
        if (!$id && $method === 'POST') {
            Response::error('Use /api/countries/{id}/fiscal-parameters para crear', 400);
            return;
        }

        if (!$id) {
             Response::error('ID requerido', 400);
             return;
        }

        if ($method === 'PUT' || $method === 'PATCH') {
            $this->update($id);
            return;
        }
        if ($method === 'DELETE') {
            $this->destroy($id);
            return;
        }

        Response::error('Método no permitido', 405);
    }

    private function index(int $countryId): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM fiscal_parameters WHERE country_id = :country_id ORDER BY name ASC");
        $stmt->execute([':country_id' => $countryId]);
        Response::json($stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    private function store(int $countryId): void
    {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        
        $name = trim((string)($data['name'] ?? ''));
        $code = strtoupper(trim((string)($data['code'] ?? '')));
        $percentage = (float)($data['percentage'] ?? 0);
        $description = trim((string)($data['description'] ?? ''));
        
        // New fields
        $type = trim((string)($data['type'] ?? 'tax'));
        $calculationBase = trim((string)($data['calculation_base'] ?? 'gross_fees'));
        $payslipTrigger = trim((string)($data['payslip_trigger'] ?? 'on_payment'));
        $appliesTo = trim((string)($data['applies_to'] ?? 'any'));
        $validFrom = !empty($data['valid_from']) ? $data['valid_from'] : null;
        $validTo = !empty($data['valid_to']) ? $data['valid_to'] : null;

        if (!$name || !$code) {
            Response::error('Nombre y Código son requeridos', 422);
            return;
        }
        try {
            $stmtDup = $this->pdo->prepare("SELECT id FROM fiscal_parameters WHERE country_id = :cid AND code = :code LIMIT 1");
            $stmtDup->execute([':cid' => $countryId, ':code' => $code]);
            if ($stmtDup->fetch()) {
                Response::error('Código duplicado para el país', 409);
                return;
            }
        } catch (Throwable $e) {
            // Continue with insert if check fails
        }

        $stmt = $this->pdo->prepare("
            INSERT INTO fiscal_parameters (country_id, name, code, percentage, description, type, calculation_base, payslip_trigger, applies_to, valid_from, valid_to)
            VALUES (:country_id, :name, :code, :percentage, :description, :type, :calculation_base, :payslip_trigger, :applies_to, :valid_from, :valid_to)
        ");
        
        try {
            $stmt->execute([
                ':country_id' => $countryId,
                ':name' => $name,
                ':code' => $code,
                ':percentage' => $percentage,
                ':description' => $description,
                ':type' => $type,
                ':calculation_base' => $calculationBase,
                ':payslip_trigger' => $payslipTrigger,
                ':applies_to' => $appliesTo,
                ':valid_from' => $validFrom,
                ':valid_to' => $validTo
            ]);
            Response::json(['message' => 'Parámetro creado', 'id' => $this->pdo->lastInsertId()], 201);
        } catch (Throwable $e) {
            Response::error('Error al crear parámetro: ' . $e->getMessage(), 500);
        }
    }

    private function update(int $id): void
    {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        
        $sets = [];
        $params = [':id' => $id];

        if (array_key_exists('name', $data)) { $sets[] = "name = :name"; $params[':name'] = trim((string)$data['name']); }
        if (array_key_exists('code', $data)) { $sets[] = "code = :code"; $params[':code'] = strtoupper(trim((string)$data['code'])); }
        if (array_key_exists('percentage', $data)) { $sets[] = "percentage = :percentage"; $params[':percentage'] = (float)$data['percentage']; }
        if (array_key_exists('description', $data)) { $sets[] = "description = :description"; $params[':description'] = trim((string)$data['description']); }
        if (array_key_exists('is_active', $data)) { $sets[] = "is_active = :is_active"; $params[':is_active'] = (int)$data['is_active']; }
        
        // New fields
        if (array_key_exists('type', $data)) { $sets[] = "type = :type"; $params[':type'] = trim((string)$data['type']); }
        if (array_key_exists('calculation_base', $data)) { $sets[] = "calculation_base = :calculation_base"; $params[':calculation_base'] = trim((string)$data['calculation_base']); }
        if (array_key_exists('payslip_trigger', $data)) { $sets[] = "payslip_trigger = :payslip_trigger"; $params[':payslip_trigger'] = trim((string)$data['payslip_trigger']); }
        if (array_key_exists('applies_to', $data)) { $sets[] = "applies_to = :applies_to"; $params[':applies_to'] = trim((string)$data['applies_to']); }
        if (array_key_exists('valid_from', $data)) { $sets[] = "valid_from = :valid_from"; $params[':valid_from'] = !empty($data['valid_from']) ? $data['valid_from'] : null; }
        if (array_key_exists('valid_to', $data)) { $sets[] = "valid_to = :valid_to"; $params[':valid_to'] = !empty($data['valid_to']) ? $data['valid_to'] : null; }

        if (empty($sets)) {
            Response::json(['message' => 'Nada que actualizar']);
            return;
        }

        $sql = "UPDATE fiscal_parameters SET " . implode(', ', $sets) . " WHERE id = :id";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        Response::json(['message' => 'Actualizado correctamente']);
    }

    private function destroy(int $id): void
    {
        $stmt = $this->pdo->prepare("DELETE FROM fiscal_parameters WHERE id = :id");
        $stmt->execute([':id' => $id]);
        Response::json(['message' => 'Eliminado correctamente']);
    }
}
