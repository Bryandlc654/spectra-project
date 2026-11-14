<?php

namespace App\Support;

class KeyfacilService
{
    public const IGV_RATE = 0.18;

    private string $token;
    private string $baseUrl;

    /**
     * Keyfacil/Nubefact interpreta "precio_unitario" con IGV incluido.
     * En Spectra los precios se manejan sin IGV, por lo que hay que
     * convertir el precio antes de enviarlo al API.
     */
    public static function priceWithIgv(float $netPrice, string $igvType = '10'): float
    {
        $price = $igvType === '10' ? $netPrice * (1 + self::IGV_RATE) : $netPrice;
        return round($price, 10);
    }

    public function __construct(?string $token = null, ?string $baseUrl = null)
    {
        $envToken = $_ENV['token-keyfacil'] ?? $_SERVER['token-keyfacil'] ?? (getenv('token-keyfacil') ?: '');
        if ($envToken === '') {
            $envToken = $_ENV['KEYFACIL_TOKEN'] ?? $_SERVER['KEYFACIL_TOKEN'] ?? (getenv('KEYFACIL_TOKEN') ?: '');
        }
        if ($envToken === '') {
            $envToken = $this->readTokenFromEnvFile();
        }

        $this->token = trim((string)($token ?? $envToken));
        $this->baseUrl = rtrim((string)($baseUrl ?? (getenv('KEYFACIL_API_URL') ?: 'https://api.vitekey.com/keyfact/integra/v1')), '/');
    }

    private function readTokenFromEnvFile(): string
    {
        $envPath = dirname(__DIR__, 2) . '/.env';
        if (!is_file($envPath)) return '';

        $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!$lines) return '';

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) continue;
            if (str_starts_with($line, 'export ')) $line = trim(substr($line, 7));

            if (preg_match('/^(token-keyfacil|KEYFACIL_TOKEN)\s*=\s*(.*)$/', $line, $matches)) {
                $value = trim($matches[2]);
                if (
                    (str_starts_with($value, '"') && str_ends_with($value, '"'))
                    || (str_starts_with($value, "'") && str_ends_with($value, "'"))
                ) {
                    $value = substr($value, 1, -1);
                }
                return $value;
            }
        }

        return '';
    }

    public function isConfigured(): bool
    {
        return $this->token !== '';
    }

    public function issueInvoice(array $payload, array $context = []): array
    {
        return $this->request('POST', '/invoices', $payload, $context);
    }

    public function voidInvoice(string $invoiceId, string $reason, array $context = []): array
    {
        return $this->request('POST', '/invoices/' . rawurlencode($invoiceId) . '/void', [
            'motivo' => $reason,
        ], $context);
    }

    public function getInvoice(string $invoiceId, bool $includePdf = true, bool $includeXml = true, array $context = []): array
    {
        return $this->request('POST', '/invoices/' . rawurlencode($invoiceId), [
            'incluir_pdf' => $includePdf,
            'incluir_xml' => $includeXml,
            'formato_pdf' => 'A4',
        ], $context);
    }

    public function searchInvoice(array $payload, array $context = []): array
    {
        return $this->request('POST', '/invoice-search', $payload, $context);
    }

    private function request(string $method, string $path, array $payload, array $context = []): array
    {
        $startedAt = microtime(true);
        $requestId = bin2hex(random_bytes(8));

        $finish = function (array $result) use ($startedAt, $requestId, $method, $path, $payload, $context): array {
            KeyfacilLogger::log([
                'request_id' => $requestId,
                'method' => $method,
                'path' => $path,
                'http_status' => $result['status'] ?? 0,
                'ok' => (bool)($result['ok'] ?? false),
                'error' => $result['error'] ?? null,
                'duration_ms' => (int)round((microtime(true) - $startedAt) * 1000),
                'context' => $context,
                'request' => $payload,
                'response' => $result['data'] ?? ($result['raw'] ?? null),
            ]);
            return $result;
        };

        if (!$this->isConfigured()) {
            return $finish([
                'ok' => false,
                'status' => 0,
                'data' => null,
                'raw' => '',
                'error' => 'token-keyfacil no está configurado en el .env',
            ]);
        }

        if (!function_exists('curl_init')) {
            return $finish([
                'ok' => false,
                'status' => 0,
                'data' => null,
                'raw' => '',
                'error' => 'La extensión cURL de PHP no está disponible',
            ]);
        }

        $url = $this->baseUrl . $path;
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $this->token,
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_FOLLOWLOCATION => false,
        ]);

        $raw = curl_exec($ch);
        $error = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($raw === false) {
            return $finish([
                'ok' => false,
                'status' => $status,
                'data' => null,
                'raw' => '',
                'error' => $error !== '' ? $error : 'No se pudo conectar con Keyfacil',
            ]);
        }

        $data = json_decode((string)$raw, true);
        if (!is_array($data)) $data = null;

        $apiMessage = null;
        if (is_array($data)) {
            $apiMessage = $data['message'] ?? $data['error'] ?? $data['mensaje'] ?? null;
        }

        return $finish([
            'ok' => $status >= 200 && $status < 300,
            'status' => $status,
            'data' => $data,
            'raw' => (string)$raw,
            'error' => ($status >= 200 && $status < 300) ? null : ($apiMessage ?: 'Keyfacil respondió con HTTP ' . $status),
        ]);
    }
}
