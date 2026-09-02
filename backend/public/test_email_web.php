<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require __DIR__ . '/../vendor/autoload.php';

// Manually load .env for testing
try {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
    $dotenv->load();
} catch (\Throwable $e) {
    echo "<p style='color:orange'>Advertencia: No se pudo cargar .env automáticamente: " . $e->getMessage() . "</p>";
}

// Manually include classes if autoloader fails
if (!class_exists('App\Database')) {
    if (file_exists(__DIR__ . '/../src/Database.php')) {
        require_once __DIR__ . '/../src/Database.php';
    }
}
if (!class_exists('App\Support\SMTP')) {
    if (file_exists(__DIR__ . '/../src/Support/SMTP.php')) {
        require_once __DIR__ . '/../src/Support/SMTP.php';
    }
}

$email = 'bdelacruzsoto99@gmail.com';
$subject = 'Prueba de Correo desde Web Server - ' . date('Y-m-d H:i:s');
$body = '<h1>Prueba de Correo</h1><p>Este correo confirma que el servidor web puede enviar correos correctamente.</p>';

echo "<h1>Prueba de Envío de Correo (Web Server)</h1>";
echo "<p>Intentando enviar correo a: <strong>$email</strong></p>";

// Debug Env Vars (Masked)
$envHost = $_ENV['SMTP_HOST'] ?? $_SERVER['SMTP_HOST'] ?? getenv('SMTP_HOST') ?: 'NOT SET';
$envUser = $_ENV['SMTP_USER'] ?? $_SERVER['SMTP_USER'] ?? getenv('SMTP_USER') ?: 'NOT SET';
$envPass = $_ENV['SMTP_PASS'] ?? $_SERVER['SMTP_PASS'] ?? getenv('SMTP_PASS') ?: 'NOT SET';

echo "<h3>Configuración Detectada (ENV):</h3>";
echo "<ul>";
echo "<li>SMTP_HOST: " . htmlspecialchars($envHost) . "</li>";
echo "<li>SMTP_USER: " . htmlspecialchars($envUser) . "</li>";
echo "<li>SMTP_PASS: " . ($envPass !== 'NOT SET' ? substr($envPass, 0, 3) . '***' . substr($envPass, -3) : 'NOT SET') . "</li>";
echo "</ul>";

try {
    // Attempt 1: Use ENV settings
    echo "<h3>Intento 1: Usando configuración actual (ENV)</h3>";
    $success = \App\Support\SMTP::send($email, $subject, $body);
    
    if ($success) {
        echo "<h2 style='color: green;'>¡ÉXITO!</h2>";
        echo "<p>El correo fue enviado exitosamente.</p>";
    }
} catch (\Throwable $e) {
    echo "<p style='color: red;'>Fallo Intento 1: " . htmlspecialchars($e->getMessage()) . "</p>";

    // Attempt 2: Try Hostinger SMTP server if 535 or connection failed
    if (strpos($e->getMessage(), '535') !== false || strpos($e->getMessage(), 'connect') !== false) {
        echo "<h3>Intento 2: Probando con smtp.hostinger.com...</h3>";
        
        $overrideConfig = [
            'smtp_host' => 'smtp.hostinger.com',
            'smtp_port' => 465,
            'smtp_encryption' => 'ssl'
        ];
        
        try {
            $success2 = \App\Support\SMTP::send($email, $subject . " (Hostinger SMTP)", $body, true, $overrideConfig);
            
            if ($success2) {
                echo "<h2 style='color: green;'>¡ÉXITO con smtp.hostinger.com!</h2>";
                echo "<p><strong>SOLUCIÓN:</strong> Su usuario y contraseña son correctos, pero el servidor SMTP debe ser <code>smtp.hostinger.com</code>.</p>";
                echo "<p>Por favor, edite su archivo <code>.env</code> y cambie <code>SMTP_HOST=mail.spectralatam.com</code> por <code>SMTP_HOST=smtp.hostinger.com</code>.</p>";
            }
        } catch (\Throwable $e2) {
            echo "<p style='color: red;'>Fallo Intento 2: " . htmlspecialchars($e2->getMessage()) . "</p>";
            echo "<p>Diagnóstico: Las credenciales (Usuario/Password) parecen incorrectas para ambos servidores.</p>";
        }
    } else {
        echo "<h3>Traza:</h3>";
        echo "<pre>" . htmlspecialchars($e->getTraceAsString()) . "</pre>";
    }
}

echo "<h3>Diagnóstico Adicional:</h3>";
echo "<ul>";
echo "<li>OpenSSL Loaded: " . (extension_loaded('openssl') ? 'Sí' : 'No') . "</li>";
echo "<li>Fsockopen Function: " . (function_exists('fsockopen') ? 'Disponible' : 'Deshabilitada') . "</li>";
echo "<li>Hostname: " . gethostname() . "</li>";
