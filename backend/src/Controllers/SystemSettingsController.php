<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use PDO;

class SystemSettingsController
{
    private PDO $pdo;

    public function __construct(Database $database)
    {
        $this->pdo = $database->pdo();
        if (\App\Support\Cache::get('system_settings_schema_v1') === null) {
            $this->ensureTable();
            \App\Support\Cache::set('system_settings_schema_v1', time(), 86400 * 365);
        }
    }

    private function ensureTable(): void
    {
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS system_settings (
                setting_key VARCHAR(100) PRIMARY KEY,
                setting_value TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }

    public function handle(string $method): void
    {
        switch ($method) {
            case 'GET':
                $this->index();
                break;
            case 'PUT':
            case 'POST':
                $this->update();
                break;
            default:
                Response::error('Method not allowed', 405);
        }
    }

    // Public to be called directly from router for /api/system-settings/test-smtp
    public function testSmtp(): void
    {
        $payload = json_decode(file_get_contents('php://input'), true) ?: [];
        $to = trim((string)($payload['to'] ?? ''));
        if ($to === '') {
            Response::error('Campo "to" es requerido', 422);
            return;
        }

        // Optional overrides for test only (do not persist)
        $overrides = [];
        $keys = ['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_encryption','smtp_from_email','smtp_from_name'];
        foreach ($keys as $k) {
            if (array_key_exists($k, $payload) && $payload[$k] !== '' && $payload[$k] !== null) {
                $overrides[$k] = $payload[$k];
            }
        }

        // If UI sends masked password "********", ignore it so we use stored real password
        if (isset($overrides['smtp_pass']) && $overrides['smtp_pass'] === '********') {
            unset($overrides['smtp_pass']);
        }

        // Sensible defaults when overriding partially
        if (!isset($overrides['smtp_encryption']) && isset($overrides['smtp_port'])) {
            $overrides['smtp_encryption'] = ((int)$overrides['smtp_port'] === 465) ? 'ssl' : 'tls';
        }
        if (!isset($overrides['smtp_from_email']) && isset($overrides['smtp_user'])) {
            $overrides['smtp_from_email'] = $overrides['smtp_user'];
        }
        if (!isset($overrides['smtp_from_name'])) {
            $overrides['smtp_from_name'] = 'Spectra ERP';
        }

        $subject = $payload['subject'] ?? 'Prueba SMTP - Spectra ERP';
        $body = $payload['body'] ?? ('Este es un correo de prueba enviado el ' . date('Y-m-d H:i:s'));

        try {
            \App\Support\SMTP::send($to, $subject, $body, true, !empty($overrides) ? $overrides : null);
            Response::json(['message' => 'Correo de prueba enviado (aceptado por el servidor SMTP)']);
        } catch (\Throwable $e) {
            Response::error('Error al enviar el correo de prueba: ' . $e->getMessage(), 500);
        }
    }

    private function index(): void
    {
        $stmt = $this->pdo->query("SELECT setting_key, setting_value FROM system_settings");
        $all = $stmt->fetchAll(PDO::FETCH_KEY_PAIR); // [key => value]

        // Mask secrets
        if (isset($all['google_client_secret'])) $all['google_client_secret'] = '********';
        if (isset($all['microsoft_client_secret'])) $all['microsoft_client_secret'] = '********';
        if (isset($all['smtp_pass'])) $all['smtp_pass'] = '********';

        Response::json(['data' => $all]);
    }

    private function update(): void
    {
        $payload = json_decode(file_get_contents('php://input'), true);
        if (!is_array($payload)) {
            Response::error('Invalid payload', 400);
            return;
        }

        $allowedKeys = [
            'google_client_id', 
            'google_client_secret', 
            'microsoft_client_id', 
            'microsoft_client_secret',
            'smtp_host',
            'smtp_port',
            'smtp_user',
            'smtp_pass',
            'smtp_encryption', // tls, ssl, none
            'smtp_from_email',
            'smtp_from_name',
            'system_api_url'
        ];

        $upd = $this->pdo->prepare("UPDATE system_settings SET setting_value = :val, updated_at = NOW() WHERE setting_key = :key");
        $ins = $this->pdo->prepare("INSERT INTO system_settings (setting_key, setting_value, created_at, updated_at) VALUES (:key, :val, NOW(), NOW())");

        foreach ($payload as $key => $val) {
            if (!in_array($key, $allowedKeys)) continue;
            
            // If value is masked, skip update
            if ($val === '********') continue;

            $upd->execute([':val' => $val, ':key' => $key]);
            if ($upd->rowCount() === 0) {
                try {
                    $ins->execute([':key' => $key, ':val' => $val]);
                } catch (\Throwable $e) {
                    // Carrera con otra escritura: reintentar update
                    $upd->execute([':val' => $val, ':key' => $key]);
                }
            }
        }

        Response::json(['message' => 'Settings updated']);
    }
}
