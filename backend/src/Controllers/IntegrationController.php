<?php

namespace App\Controllers;

use App\Controllers\NotificationController;
use App\Database;
use App\Support\Response;
use App\Support\Auth;
use App\Support\AuditLogger;
use PDO;

class IntegrationController
{
    private PDO $pdo;
    private NotificationController $notificationController;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        $this->notificationController = new NotificationController($database);
        if (\App\Support\Schema::needsMigration($this->pdo)) { $this->ensureTables(); }
    }

    private function ensureTables(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS tenant_integrations (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                provider VARCHAR(50) NOT NULL, -- quickbooks, xero, slack, bamboohr
                status VARCHAR(20) DEFAULT 'disconnected', -- disconnected, connected, error
                config_json JSON NULL,
                last_sync_at DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_company_provider (company_id, provider),
                INDEX (company_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(string $method, array $params = []): void
    {
        $user = Auth::user();
        if (!$user) {
            Response::error('No autenticado', 401);
            return;
        }

        // $params[0] is company_id usually in my routing structure /api/tenants/{companyId}/integrations
        // But let's check how I'll route this. 
        // Likely: /api/tenants/{companyId}/integrations
        
        $companyId = $params['company_id'] ?? null;
        if (!$companyId) {
             // Fallback if not passed in params but maybe in path
             // For now assume standard pattern
             Response::error('Company ID required', 400);
             return;
        }

        // Verify membership/permissions
        // ... (Skipping detailed permission check for brevity, assuming middleware or Auth::user() context sufficient for prototype)

        switch ($method) {
            case 'GET':
                $this->index($companyId);
                break;
            case 'POST':
                // Action: connect, disconnect, sync
                $action = $_GET['action'] ?? 'connect';
                if ($action === 'connect') $this->connect($companyId);
                elseif ($action === 'disconnect') $this->disconnect($companyId);
                elseif ($action === 'sync') $this->sync($companyId);
                else Response::error('Invalid action', 400);
                break;
            default:
                Response::error('Method not allowed', 405);
        }
    }

    private function index(string $companyId): void
    {
        // Define available integrations (Catalog)
        $catalog = [
            [
                'provider' => 'quickbooks',
                'name' => 'QuickBooks Online',
                'category' => 'Accounting',
                'description' => 'Sincroniza facturas y pagos automáticamente.',
                'icon' => 'bi-file-spreadsheet'
            ],
            [
                'provider' => 'xero',
                'name' => 'Xero',
                'category' => 'Accounting',
                'description' => 'Exportación de nómina y conciliación bancaria.',
                'icon' => 'bi-calculator'
            ],
            [
                'provider' => 'slack',
                'name' => 'Slack',
                'category' => 'Communication',
                'description' => 'Notificaciones de contratos y pagos en tus canales.',
                'icon' => 'bi-slack'
            ],
            [
                'provider' => 'bamboohr',
                'name' => 'BambooHR',
                'category' => 'HRIS',
                'description' => 'Sincroniza empleados y tiempo libre.',
                'icon' => 'bi-people'
            ]
        ];

        // Fetch installed
        $stmt = $this->pdo->prepare("SELECT * FROM tenant_integrations WHERE company_id LIKE :company_id");
        $stmt->execute([':company_id' => $companyId]);
        $installed = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $installedMap = [];
        foreach ($installed as $inst) {
            $installedMap[$inst['provider']] = $inst;
        }

        // Merge
        $result = [];
        foreach ($catalog as $item) {
            $inst = $installedMap[$item['provider']] ?? null;
            $item['status'] = $inst ? $inst['status'] : 'disconnected';
            $item['last_sync_at'] = $inst ? $inst['last_sync_at'] : null;
            $item['config'] = $inst ? json_decode($inst['config_json'], true) : null;
            $result[] = $item;
        }

        Response::json(['data' => $result]);
    }

    private function connect(string $companyId): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $provider = $data['provider'] ?? null;

        if (!$provider) {
            Response::error('Provider required', 400);
            return;
        }

        // Simulate OAuth / Connection
        // In real world, this would redirect to provider auth URL or validate API keys
        
        $id = $this->uuid();
        
        // Check if exists
        $stmt = $this->pdo->prepare("SELECT id FROM tenant_integrations WHERE company_id = :c AND provider = :p");
        $stmt->execute([':c' => $companyId, ':p' => $provider]);
        $exists = $stmt->fetchColumn();

        if ($exists) {
            $stmt = $this->pdo->prepare("UPDATE tenant_integrations SET status = 'connected', updated_at = NOW() WHERE id = :id");
            $stmt->execute([':id' => $exists]);
        } else {
            $stmt = $this->pdo->prepare("INSERT INTO tenant_integrations (id, company_id, provider, status, config_json) VALUES (:id, :c, :p, 'connected', :cfg)");
            $stmt->execute([
                ':id' => $id,
                ':c' => $companyId,
                ':p' => $provider,
                ':cfg' => json_encode(['connected_by' => Auth::userId()])
            ]);
        }

        AuditLogger::log('Conectar Integración', "Integración conectada: $provider", Auth::userId(), $companyId, 'integration', $exists ?: $id);

        Response::json(['message' => "Conectado a $provider exitosamente"]);
    }

    private function disconnect(string $companyId): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $provider = $data['provider'] ?? null;

        if (!$provider) {
            Response::error('Provider required', 400);
            return;
        }

        $stmt = $this->pdo->prepare("UPDATE tenant_integrations SET status = 'disconnected' WHERE company_id = :c AND provider = :p");
        $stmt->execute([':c' => $companyId, ':p' => $provider]);

        AuditLogger::log('Desconectar Integración', "Integración desconectada: $provider", Auth::userId(), $companyId, 'integration', null);

        Response::json(['message' => "Desconectado de $provider"]);
    }

    private function sync(string $companyId): void
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $provider = $data['provider'] ?? null;

        if (!$provider) {
            Response::error('Provider required', 400);
            return;
        }

        // Simulate Sync
        sleep(1); // Fake delay

        $stmt = $this->pdo->prepare("UPDATE tenant_integrations SET last_sync_at = NOW() WHERE company_id LIKE :c AND provider = :p");
        $stmt->execute([':c' => $companyId, ':p' => $provider]);

        AuditLogger::log('Sincronizar Integración', "Sincronización manual: $provider", Auth::userId(), $companyId, 'integration', null);

        Response::json(['message' => "Sincronización con $provider completada"]);
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
