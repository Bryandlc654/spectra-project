<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require __DIR__ . '/../vendor/autoload.php';

// Load config to get DB credentials
$config = require __DIR__ . '/../config/config.php';
$db = new \App\Database($config['db']);
$pdo = $db->pdo();

// New settings to apply (Matched with .env)
$newSettings = [
    'smtp_host' => 'mail.spectralatam.com',
    'smtp_port' => '465',
    'smtp_user' => 'info@spectralatam.com',
    'smtp_pass' => 'tdm8sn8HwWnV',
    'smtp_encryption' => 'ssl',
    'smtp_from_email' => 'info@spectralatam.com',
    'smtp_from_name' => 'Spectra ERP'
];

echo "<h1>Actualización de Configuración SMTP en Base de Datos</h1>";

try {
    $pdo->beginTransaction();

    foreach ($newSettings as $key => $value) {
        // Check if exists
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM system_settings WHERE setting_key = :key");
        $stmt->execute([':key' => $key]);
        $exists = $stmt->fetchColumn();

        if ($exists) {
            $stmt = $pdo->prepare("UPDATE system_settings SET setting_value = :value, updated_at = NOW() WHERE setting_key = :key");
            $stmt->execute([':value' => $value, ':key' => $key]);
            echo "<p>Actualizado: <strong>$key</strong></p>";
        } else {
            $stmt = $pdo->prepare("INSERT INTO system_settings (setting_key, setting_value, created_at, updated_at) VALUES (:key, :value, NOW(), NOW())");
            $stmt->execute([':key' => $key, ':value' => $value]);
            echo "<p>Insertado: <strong>$key</strong></p>";
        }
    }

    $pdo->commit();
    echo "<h2 style='color: green;'>Configuración actualizada correctamente.</h2>";
    echo "<p>Ahora la base de datos tiene las credenciales correctas.</p>";
    echo "<p>Puede borrar este archivo ahora.</p>";

} catch (\Throwable $e) {
    $pdo->rollBack();
    echo "<h2 style='color: red;'>Error al actualizar</h2>";
    echo "<pre>" . htmlspecialchars($e->getMessage()) . "</pre>";
}
