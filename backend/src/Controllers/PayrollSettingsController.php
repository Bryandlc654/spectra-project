<?php

namespace App\Controllers;

use App\Support\Response;
use PDO;

class PayrollSettingsController
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
        $this->ensureTable();
    }

    private function readPayload(): array
    {
        $input = file_get_contents('php://input');
        $data = json_decode($input, true);
        return is_array($data) ? $data : [];
    }

    private function ensureTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS payroll_settings (
                company_id CHAR(36) PRIMARY KEY,
                cycle_type ENUM('monthly', 'biweekly') NOT NULL DEFAULT 'monthly',
                cutoff_day_1 INT NOT NULL DEFAULT 30, -- Para mensual o 2da quincena
                cutoff_day_2 INT NULL,                -- Para 1ra quincena (si biweekly)
                payment_day_1 INT NOT NULL DEFAULT 5, -- Día de pago (mensual o 2da quincena)
                payment_day_2 INT NULL,               -- Día de pago (1ra quincena)
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function show(string $companyId): void
    {
        if (!$this->verifyAccess($companyId)) return;

        $stmt = $this->pdo->prepare("SELECT * FROM payroll_settings WHERE company_id = ?");
        $stmt->execute([$companyId]);
        $settings = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$settings) {
            // Default settings
            $settings = [
                'company_id' => $companyId,
                'cycle_type' => 'monthly',
                'cutoff_day_1' => 30,
                'cutoff_day_2' => null,
                'payment_day_1' => 5,
                'payment_day_2' => null
            ];
        }

        Response::json($settings);
    }

    public function update(string $companyId): void
    {
        if (!$this->verifyAccess($companyId)) return;

        $data = $this->readPayload();
        
        $cycleType = $data['cycle_type'] ?? 'monthly';
        if (!in_array($cycleType, ['monthly', 'biweekly'])) {
            Response::error('Ciclo de pago inválido', 400);
            return;
        }

        $cutoff1 = (int)($data['cutoff_day_1'] ?? 30);
        $payment1 = (int)($data['payment_day_1'] ?? 5);
        
        $cutoff2 = null;
        $payment2 = null;

        if ($cycleType === 'biweekly') {
            $cutoff2 = (int)($data['cutoff_day_2'] ?? 15);
            $payment2 = (int)($data['payment_day_2'] ?? 20);
        }

        $stmt = $this->pdo->prepare("
            INSERT INTO payroll_settings (
                company_id, cycle_type, cutoff_day_1, cutoff_day_2, payment_day_1, payment_day_2
            ) VALUES (
                :id, :cycle, :c1, :c2, :p1, :p2
            ) ON DUPLICATE KEY UPDATE
                cycle_type = VALUES(cycle_type),
                cutoff_day_1 = VALUES(cutoff_day_1),
                cutoff_day_2 = VALUES(cutoff_day_2),
                payment_day_1 = VALUES(payment_day_1),
                payment_day_2 = VALUES(payment_day_2)
        ");

        try {
            $stmt->execute([
                ':id' => $companyId,
                ':cycle' => $cycleType,
                ':c1' => $cutoff1,
                ':c2' => $cutoff2,
                ':p1' => $payment1,
                ':p2' => $payment2
            ]);
            Response::json(['message' => 'Configuración de nómina actualizada', 'settings' => $data]);
        } catch (\Exception $e) {
            Response::error('Error al guardar configuración: ' . $e->getMessage(), 500);
        }
    }

    private function verifyAccess(string $companyId): bool
    {
        // TODO: Validar que el usuario tenga permiso para editar esta compañía
        // Por ahora asumimos que el middleware de auth ya validó el token
        return true; 
    }
}
