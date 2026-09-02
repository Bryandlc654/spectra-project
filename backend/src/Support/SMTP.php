<?php

namespace App\Support;

use App\Database;
use Exception;
use PDO;
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP as PHPMailerSMTP;

class SMTP
{
    private static ?array $config = null;
    private static ?string $debugFile = null;

    /**
     * Send an email via SMTP using PHPMailer
     * 
     * @param string $to Recipient email
     * @param string $subject Email subject
     * @param string $body Email body (HTML or text)
     * @param bool $isHtml Whether body is HTML
     * @param array|null $overrideConfig Optional config override
     * @return bool True on success
     * @throws Exception On failure
     */
    public static function send(string $to, string $subject, string $body, bool $isHtml = true, ?array $overrideConfig = null): bool
    {
        $baseConfig = self::getConfig();
        // Merge base config with override, prioritizing override
        $config = $overrideConfig ? array_merge($baseConfig ?? [], $overrideConfig) : $baseConfig;

        if (empty($config)) {
            // Fallback to defaults if no config found anywhere
            $config = [
                'smtp_host' => trim($_ENV['SMTP_HOST'] ?? 'mail.spectralatam.com'),
                'smtp_port' => trim($_ENV['SMTP_PORT'] ?? '465'),
                'smtp_user' => trim($_ENV['SMTP_USER'] ?? ''),
                'smtp_pass' => trim($_ENV['SMTP_PASS'] ?? ''),
                'smtp_encryption' => trim($_ENV['SMTP_ENCRYPTION'] ?? 'ssl'),
                'smtp_from_email' => trim($_ENV['SMTP_FROM_EMAIL'] ?? $_ENV['SMTP_USER'] ?? ''),
                'smtp_from_name' => trim($_ENV['SMTP_FROM_NAME'] ?? 'Spectra ERP')
            ];
        }

        $mail = new PHPMailer(true);

        try {
            // Server settings
            $mail->SMTPDebug = 0; // Disable verbose debug output for production
            $mail->isSMTP();
            
            $mail->Host       = $config['smtp_host'];
            $mail->SMTPAuth   = true;
            $mail->Username   = $config['smtp_user'];
            $mail->Password   = $config['smtp_smtp_pass'] ?? $config['smtp_pass'];
            
            // Match logic from test_phpmailer.php
            $enc = strtolower($config['smtp_encryption'] ?? 'ssl');
            $port = (int)($config['smtp_port'] ?? 465);

            if ($enc === 'ssl') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
            } else {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            }
            
            $mail->Port = $port;
            
            // Debug log just in case
            // self::debugLog('SMTP Config Used', ['host' => $mail->Host, 'port' => $mail->Port, 'secure' => $mail->SMTPSecure]);

            // Recipients
            $fromEmail = $config['smtp_from_email'] ?? $config['smtp_user'];
            $fromName = $config['smtp_from_name'] ?? 'Spectra ERP';
            
            $mail->setFrom($fromEmail, $fromName);
            $mail->addAddress($to);

            // Content
            $mail->isHTML($isHtml);
            $mail->Subject = $subject;
            $mail->Body    = $body;
            $mail->CharSet = 'UTF-8';

            $mail->send();
            return true;
        } catch (Exception $e) {
            self::debugLog('PHPMailer Error: ' . $mail->ErrorInfo);
            throw new Exception("Email could not be sent. Mailer Error: {$mail->ErrorInfo}");
        }
    }

    private static function getConfig(): ?array
    {
        if (self::$config) return self::$config;

        // 1. Try ENV first (Strict Priority)
        $envHost = trim($_ENV['SMTP_HOST'] ?? $_SERVER['SMTP_HOST'] ?? getenv('SMTP_HOST') ?: '');
        
        if ($envHost !== '') {
            $envUser = trim($_ENV['SMTP_USER'] ?? $_SERVER['SMTP_USER'] ?? getenv('SMTP_USER') ?: '');
            $envPort = trim($_ENV['SMTP_PORT'] ?? $_SERVER['SMTP_PORT'] ?? getenv('SMTP_PORT') ?: '587');
            $envPass = trim($_ENV['SMTP_PASS'] ?? $_SERVER['SMTP_PASS'] ?? getenv('SMTP_PASS') ?: '');
            $envEnc = trim($_ENV['SMTP_ENCRYPTION'] ?? $_SERVER['SMTP_ENCRYPTION'] ?? getenv('SMTP_ENCRYPTION') ?: 'tls');
            $envFromEmail = trim($_ENV['SMTP_FROM_EMAIL'] ?? $_SERVER['SMTP_FROM_EMAIL'] ?? getenv('SMTP_FROM_EMAIL') ?: ($envUser ?: ''));
            $envFromName = trim($_ENV['SMTP_FROM_NAME'] ?? $_SERVER['SMTP_FROM_NAME'] ?? getenv('SMTP_FROM_NAME') ?: 'Spectra ERP');

            self::$config = [
                'smtp_host' => $envHost,
                'smtp_port' => (int)$envPort,
                'smtp_user' => $envUser,
                'smtp_pass' => $envPass,
                'smtp_encryption' => $envEnc,
                'smtp_from_email' => $envFromEmail,
                'smtp_from_name' => $envFromName,
            ];
            
            return self::$config;
        }

        // 2. Fallback to DB
        try {
            $config = require __DIR__ . '/../../config/config.php';
            $db = new Database($config['db']);
            $pdo = $db->pdo();

            $stmt = $pdo->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'smtp_%'");
            $settings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

            if (empty($settings['smtp_host'])) return null;

            if (empty($settings['smtp_encryption'])) {
                $settings['smtp_encryption'] = 'tls';
            }
            if (empty($settings['smtp_from_email']) && !empty($settings['smtp_user'])) {
                $settings['smtp_from_email'] = $settings['smtp_user'];
            }
            if (empty($settings['smtp_from_name'])) {
                $settings['smtp_from_name'] = 'Spectra ERP';
            }
            if (!empty($settings['smtp_port'])) {
                $settings['smtp_port'] = (int)$settings['smtp_port'];
            }

            self::$config = $settings;
            return self::$config;
        } catch (\Throwable $e) {
            return null;
        }
    }

    private static function debugLog(string $message, array $context = []): void
    {
        if (!self::$debugFile) {
            self::$debugFile = __DIR__ . '/../../storage/logs/smtp_debug.log';
        }
        
        $timestamp = date('Y-m-d H:i:s');
        $logEntry = "[$timestamp] $message " . json_encode($context) . PHP_EOL;
        
        // Ensure directory exists
        $dir = dirname(self::$debugFile);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        
        file_put_contents(self::$debugFile, $logEntry, FILE_APPEND);
    }
}
