<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require __DIR__ . '/../vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

// Load .env
try {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
    $dotenv->load();
} catch (\Throwable $e) {
    echo "Could not load .env: " . $e->getMessage();
}

// Get credentials from ENV
$host = trim($_ENV['SMTP_HOST'] ?? '');
$user = trim($_ENV['SMTP_USER'] ?? '');
$pass = trim($_ENV['SMTP_PASS'] ?? '');
$port = trim($_ENV['SMTP_PORT'] ?? '465');
$enc = trim($_ENV['SMTP_ENCRYPTION'] ?? 'ssl');

echo "<h1>Prueba con PHPMailer (Biblioteca Estándar)</h1>";
echo "<ul>";
echo "<li>Host: $host</li>";
echo "<li>User: $user</li>";
echo "<li>Pass: " . substr($pass, 0, 3) . "***" . substr($pass, -3) . "</li>";
echo "<li>Port: $port</li>";
echo "<li>Enc: $enc</li>";
echo "</ul>";

$mail = new PHPMailer(true);

try {
    // Server settings
    $mail->SMTPDebug = SMTP::DEBUG_SERVER;  // Enable verbose debug output
    $mail->isSMTP();                        // Send using SMTP
    $mail->Host       = $host;              // Set the SMTP server to send through
    $mail->SMTPAuth   = true;               // Enable SMTP authentication
    $mail->Username   = $user;              // SMTP username
    $mail->Password   = $pass;              // SMTP password
    
    if ($enc === 'ssl') {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    } else {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    }
    
    $mail->Port       = (int)$port;

    // Recipients
    $mail->setFrom($user, 'Spectra ERP Test');
    $mail->addAddress('bdelacruzsoto99@gmail.com'); 

    // Content
    $mail->isHTML(true);                                  
    $mail->Subject = 'Prueba PHPMailer - ' . date('H:i:s');
    $mail->Body    = 'Esta es una prueba usando la biblioteca <b>PHPMailer</b> directamente. Si recibes esto, las credenciales son correctas y el problema está en la clase personalizada App\Support\SMTP.';
    $mail->AltBody = 'Esta es una prueba usando la biblioteca PHPMailer directamente.';

    $mail->send();
    echo '<h2 style="color: green">¡Mensaje enviado correctamente!</h2>';
    echo '<p>Esto confirma que las credenciales funcionan con una biblioteca estándar.</p>';
} catch (Exception $e) {
    echo "<h2 style='color: red'>Error al enviar: {$mail->ErrorInfo}</h2>";
    echo "<pre>Detalles de depuración arriba.</pre>";
}
