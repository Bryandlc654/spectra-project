<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require __DIR__ . '/../vendor/autoload.php';

// Load .env
try {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
    $dotenv->load();
} catch (\Throwable $e) {
    echo "Could not load .env: " . $e->getMessage();
}

// Mimic FreelancerController::sendPasswordResetInvite logic
try {
    $userId = "test-user-id";
    $email = "bdelacruzsoto99@gmail.com";
    $fullName = "Test User Freelancer";
    
    // Simulate token generation
    $token = bin2hex(random_bytes(32));
    
    // Mimic getFrontendUrl
    $frontendUrl = $_ENV['SYSTEM_FRONTEND_URL'] ?? 'https://app.spectralatam.com'; // Fallback if not set
    $resetLink = $frontendUrl . "/auth/reset-password?token=$token&email=" . urlencode($email);

    // Force UTF-8 for subject
    $subject = "Bienvenido a Spectra ERP - Configura tu contraseña (TEST)";

    $body = "Hola {$fullName},<br><br>";
    $body .= "Se ha creado una cuenta de freelancer para ti en Spectra ERP (SIMULACIÓN).<br>";
    $body .= "Para configurar tu contraseña y acceder a la plataforma, haz clic en el siguiente enlace:<br><br>";
    $body .= "<a href='$resetLink' style='padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px;'>Configurar contraseña</a><br><br>";
    $body .= "Si no reconoces este registro, puedes ignorar este correo.<br><br>";
    $body .= "El enlace expirará en 60 minutos.";

    echo "<h3>Simulando envío de invitación a Freelancer...</h3>";
    echo "<p><strong>Para:</strong> $email</p>";
    echo "<p><strong>Asunto:</strong> $subject</p>";
    echo "<p><strong>Cuerpo:</strong><br>$body</p>";

    $success = \App\Support\SMTP::send($email, $subject, $body);

    if ($success) {
        echo "<h2 style='color: green;'>¡Éxito! Correo de invitación enviado.</h2>";
    } else {
        echo "<h2 style='color: red;'>Fallo al enviar el correo.</h2>";
    }

} catch (\Throwable $e) {
    echo "<h2 style='color: red;'>Excepción capturada: " . htmlspecialchars($e->getMessage()) . "</h2>";
    echo "<pre>" . $e->getTraceAsString() . "</pre>";
}
