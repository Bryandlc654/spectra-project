<?php
require 'vendor/autoload.php';
require 'src/Database.php';
$config = require 'config/config.php';

use App\Database;

try {
    $db = new Database($config['db']);
    $pdo = $db->pdo();
    
    // Check system_api_url
    $stmt = $pdo->query("SELECT setting_value FROM system_settings WHERE setting_key = 'system_api_url'");
    $apiUrl = $stmt->fetchColumn();
    
    // Check system_frontend_url
    $stmt = $pdo->query("SELECT setting_value FROM system_settings WHERE setting_key = 'system_frontend_url'");
    $frontendUrl = $stmt->fetchColumn();
    echo "System Frontend URL: " . ($frontendUrl ?: 'NOT SET (Defaults to http://localhost:5173)') . "\n";
    
    // Check google config
    $stmt = $pdo->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('google_client_id', 'google_client_secret')");
    $googleConfig = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
    
    echo "=== Google Auth Debug Info ===\n";
    echo "System API URL (DB): " . ($apiUrl ?: "NOT SET") . "\n";
    echo "Google Client ID: " . (isset($googleConfig['google_client_id']) ? substr($googleConfig['google_client_id'], 0, 10) . "..." : "NOT SET") . "\n";
    echo "Google Client Secret: " . (isset($googleConfig['google_client_secret']) ? "SET (Hidden)" : "NOT SET") . "\n";
    
    $baseUrl = rtrim($apiUrl, '/');
    $redirectUri = $baseUrl . '/api/auth/google/callback';
    
    echo "\nGenerated Redirect URI: " . $redirectUri . "\n";
    echo "\nIMPORTANT: Please verify that this EXACT URL is added to 'Authorized redirect URIs' in your Google Cloud Console.\n";
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
