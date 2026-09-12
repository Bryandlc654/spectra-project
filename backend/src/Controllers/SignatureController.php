<?php

namespace App\Controllers;

use App\Database;
use App\Support\Response;
use Dompdf\Dompdf;
use PDO;

/**
 * Portal público de firma digital (Spectra Sign).
 * Reemplaza a DocuSign: el firmante dibuja su firma y queda guardada
 * (imagen PNG + metadatos IP/UA/fecha) y se genera un PDF firmado.
 */
class SignatureController
{
    private PDO $pdo;
    private Database $database;

    public function __construct(Database $database)
    {
        $this->database = $database;
        $this->pdo = $database->pdo();
    }

    private function envelopes(): EnvelopeController
    {
        return new EnvelopeController($this->database);
    }

    public function handle(array $segments, string $method): void
    {
        $token = $segments[2] ?? null;
        $sub = $segments[3] ?? '';

        if (!$token) {
            Response::error('Token de firma no proporcionado', 400);
            return;
        }

        if ($method === 'GET' && $sub === 'pdf') {
            $this->streamPdf($token);
            return;
        }

        if ($method === 'GET') {
            $this->status($token);
            return;
        }

        if ($method === 'POST') {
            $this->sign($token);
            return;
        }

        Response::error('Method not allowed', 405);
    }

    private function findEnvelope(string $token): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT e.*, COALESCE(c.title, ct.title) as contract_title, ct.title as template_title, comp.legal_name as company_name
            FROM docusign_envelopes e
            LEFT JOIN contracts c ON e.contract_id = c.id
            LEFT JOIN contract_templates ct ON c.template_id = ct.id
            LEFT JOIN companies comp ON c.company_id = comp.id
            WHERE e.sign_token = :token
            LIMIT 1
        ");
        $stmt->execute([':token' => $token]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    private function status(string $token): void
    {
        $envelope = $this->findEnvelope($token);
        if (!$envelope) {
            Response::error('Enlace de firma inválido o expirado', 404);
            return;
        }

        if (in_array($envelope['status'], ['voided', 'declined'], true)) {
            Response::json([
                'token' => $token,
                'envelope_id' => $envelope['id'],
                'status' => $envelope['status'],
                'message' => 'Este documento fue anulado y ya no puede firmarse.'
            ]);
            return;
        }

        $alreadySigned = !empty($envelope['signed_at']);

        $payload = [
            'token' => $token,
            'envelope_id' => $envelope['id'],
            'status' => $envelope['status'],
            'signed_at' => $envelope['signed_at'] ?? null,
            'signed' => $alreadySigned,
            'contract_id' => $envelope['contract_id'],
            'amendment_id' => $envelope['amendment_id'] ?? null,
            'contract_title' => $envelope['contract_title'] ?? 'Contrato',
            'company_name' => $envelope['company_name'] ?? 'Spectra',
            'signer_name' => $envelope['signer_name'] ?? $this->fallbackSignerName($envelope),
            'signer_email' => $envelope['signer_email'] ?? $this->fallbackSignerEmail($envelope),
            'content_html' => $this->renderDocumentHtml($envelope)
        ];

        if ($alreadySigned) {
            $payload['pdf_url'] = $this->apiBaseUrl() . '/api/sign/' . $token . '/pdf';
        }

        Response::json($payload);
    }

    private function sign(string $token): void
    {
        $envelope = $this->findEnvelope($token);
        if (!$envelope) {
            Response::error('Enlace de firma inválido o expirado', 404);
            return;
        }

        if (in_array($envelope['status'], ['voided', 'declined'], true)) {
            Response::error('Este documento fue anulado y no puede firmarse', 409);
            return;
        }

        if (!empty($envelope['signed_at'])) {
            Response::error('Este documento ya fue firmado', 409);
            return;
        }

        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        $signatureData = trim((string)($body['signature'] ?? ''));
        $svgPath = trim((string)($body['signature_svg'] ?? ''));
        $svgW = (int)($body['signature_width'] ?? 0);
        $svgH = (int)($body['signature_height'] ?? 0);
        $name = trim((string)($body['name'] ?? ''));
        $email = trim((string)($body['email'] ?? ''));

        $hasPng = $signatureData !== '';
        $hasSvg = $svgPath !== '';

        if (!$hasPng && !$hasSvg) {
            Response::error('Debes dibujar tu firma antes de continuar', 422);
            return;
        }

        $pngBin = null;
        if ($hasPng) {
            // Validar que sea un PNG en base64 (data URL)
            if (!preg_match('#^data:image/png;base64,#i', $signatureData)) {
                Response::error('Formato de firma inválido (se espera una imagen PNG)', 422);
                return;
            }
            $pngBin = base64_decode(substr($signatureData, strpos($signatureData, ',') + 1), true);
            if ($pngBin === false || strlen($pngBin) < 8) {
                Response::error('La firma dibujada está vacía o corrupta', 422);
                return;
            }
            // Magic bytes PNG: 89 50 4E 47 0D 0A 1A 0A
            $pngMagic = "\x89\x50\x4E\x47\x0D\x0A\x1A\x0A";
            if (strncmp($pngBin, $pngMagic, 8) !== 0) {
                Response::error('La firma no es un archivo PNG válido', 422);
                return;
            }
        }

        if ($hasSvg) {
            // Solo comandos de trazo SVG (evita inyección de markup)
            if (strlen($svgPath) < 10 || strlen($svgPath) > 200000
                || !preg_match('/^[MmLlHhVvCcSsQqTtAaZz0-9eE,.\-\s]+$/', $svgPath)) {
                Response::error('Trazo de firma inválido', 422);
                return;
            }
            $svgW = ($svgW > 0 && $svgW <= 4000) ? $svgW : 900;
            $svgH = ($svgH > 0 && $svgH <= 4000) ? $svgH : 300;
        }

        if ($name === '') {
            $name = $this->fallbackSignerName($envelope);
        }
        if ($email === '') {
            $email = $this->fallbackSignerEmail($envelope);
        }

        $contract = $this->fetchContractDetail($envelope['contract_id'] ?? '');
        $ip = $this->clientIp();
        $ua = mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);

        // Generar PDF firmado con la firma embebida (SVG vectorial; PNG si hay GD)
        try {
            $pdfBase64 = $this->buildSignedPdf($envelope, $contract, $pngBin, $svgPath, $svgW, $svgH, $name, $email, $ip, $ua);
        } catch (\Throwable $e) {
            Response::error('No se pudo generar el PDF firmado: ' . $e->getMessage(), 500);
            return;
        }

        $signatureSvg = $hasSvg ? json_encode(['path' => $svgPath, 'width' => $svgW, 'height' => $svgH]) : null;

        try {
            $stmt = $this->pdo->prepare("
                UPDATE docusign_envelopes
                SET status = 'completed',
                    signed_at = NOW(),
                    last_event_at = NOW(),
                    signer_name = :name,
                    signer_email = :email,
                    signer_id = :signer_id,
                    signature_data = :signature_data,
                    signature_svg = :signature_svg,
                    signed_pdf = :signed_pdf,
                    signature_ip = :signature_ip,
                    signature_ua = :signature_ua
                WHERE id = :id
            ");
            $stmt->execute([
                ':name' => mb_substr($name, 0, 200),
                ':email' => mb_substr($email, 0, 200),
                ':signer_id' => $contract['freelancer_id'] ?? ($contract['user_id'] ?? null),
                ':signature_data' => $hasPng ? $signatureData : null,
                ':signature_svg' => $signatureSvg,
                ':signed_pdf' => $pdfBase64,
                ':signature_ip' => mb_substr($ip, 0, 64),
                ':signature_ua' => $ua,
                ':id' => $envelope['id']
            ]);
        } catch (\Throwable $e) {
            Response::error('No se pudo guardar la firma: ' . $e->getMessage(), 500);
            return;
        }

        // Automatizaciones: contrato activo / enmienda aplicada / tarea de onboarding completada
        try {
            $this->envelopes()->handleSignedEnvelope($envelope['id']);
        } catch (\Throwable $e) {
            error_log('[Signature] hooks: ' . $e->getMessage());
        }

        Response::json([
            'message' => 'Documento firmado correctamente',
            'status' => 'completed',
            'signed_at' => date('Y-m-d H:i:s'),
            'pdf_url' => $this->apiBaseUrl() . '/api/sign/' . $token . '/pdf'
        ], 201);
    }

    private function streamPdf(string $token): void
    {
        $envelope = $this->findEnvelope($token);
        if (!$envelope || empty($envelope['signed_pdf'])) {
            Response::error('PDF no disponible', 404);
            return;
        }

        $pdfBin = base64_decode($envelope['signed_pdf'], true);
        if ($pdfBin === false) {
            Response::error('PDF corrupto', 500);
            return;
        }

        header('Content-Type: application/pdf');
        header('Content-Disposition: inline; filename="contrato-firmado.pdf"');
        header('Cache-Control: no-store');
        echo $pdfBin;
        exit;
    }

    private function buildSignedPdf(array $envelope, ?array $contract, ?string $pngBin, string $svgPath, int $svgW, int $svgH, string $name, string $email, string $ip, string $ua): string
    {
        $bodyHtml = $this->renderDocumentHtml($envelope);

        $now = date('Y-m-d H:i:s');

        // Firma vectorial (SVG): no requiere GD. Si no hay SVG, se usa el PNG (requiere GD).
        if ($svgPath !== '') {
            $signatureMarkup = '<svg width="340" height="' . (int)round(340 * $svgH / max(1, $svgW)) . '" viewBox="0 0 '
                . (int)$svgW . ' ' . (int)$svgH . '" xmlns="http://www.w3.org/2000/svg">'
                . '<path d="' . htmlspecialchars($svgPath, ENT_QUOTES, 'UTF-8') . '" fill="none" stroke="#1e3a8a" stroke-width="3"/>'
                . '</svg>';
        } elseif ($pngBin !== null) {
            $signatureMarkup = '<img src="data:image/png;base64,' . base64_encode($pngBin) . '" style="max-height:90px; max-width:320px;"/>';
        } else {
            $signatureMarkup = '<span style="color:#94a3b8;">Firma registrada</span>';
        }

        $signedBlock = "
            <div style=\"margin-top:28px; border:1px solid #e2e8f0; border-radius:8px; padding:16px;\">
                <h3 style=\"margin:0 0 10px; font-size:12px; color:#334155; text-transform:uppercase;\">Firma del Contratista (dibujada)</h3>
                <div style=\"border-bottom:1px dashed #cbd5e1; text-align:center; padding:6px 0;\">
                    {$signatureMarkup}
                </div>
                <table style=\"margin-top:12px; font-size:10px; color:#475569; line-height:1.6;\">
                    <tr><td style=\"padding-right:8px;\"><b>Firmado por:</b></td><td>" . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . "</td></tr>
                    <tr><td style=\"padding-right:8px;\"><b>Email:</b></td><td>" . htmlspecialchars($email, ENT_QUOTES, 'UTF-8') . "</td></tr>
                    <tr><td style=\"padding-right:8px;\"><b>Fecha y hora:</b></td><td>{$now}</td></tr>
                    <tr><td style=\"padding-right:8px;\"><b>IP del firmante:</b></td><td>" . htmlspecialchars($ip, ENT_QUOTES, 'UTF-8') . "</td></tr>
                    <tr><td style=\"padding-right:8px;\"><b>Dispositivo:</b></td><td>" . htmlspecialchars($ua, ENT_QUOTES, 'UTF-8') . "</td></tr>
                </table>
            </div>";

        $html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>
            body { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #111; line-height: 1.5; }
            p { margin: 0 0 8px; }
            ul, ol { margin: 0 0 8px 18px; padding: 0; }
            li { margin-bottom: 3px; }
            h1, h2, h3, h4 { font-weight: bold; margin: 12px 0 6px; }
            h1 { font-size: 18px; } h2 { font-size: 16px; } h3 { font-size: 14px; } h4 { font-size: 12px; }
            blockquote { margin: 8px 20px; font-style: italic; color: #333; }
            hr { border: none; border-top: 1px solid #999; margin: 10px 0; }
            .doc-header { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
            .doc-title { font-size: 16px; font-weight: bold; }
        </style></head><body>
            <div class=\"doc-header\">
                <div class=\"doc-title\">" . htmlspecialchars((string)($envelope['contract_title'] ?? 'Contrato'), ENT_QUOTES, 'UTF-8') . "</div>
                <div>" . htmlspecialchars((string)($envelope['company_name'] ?? 'Spectra'), ENT_QUOTES, 'UTF-8') . "</div>
            </div>
            {$bodyHtml}
            {$signedBlock}
        </body></html>";

        $dompdf = new Dompdf();
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();
        return base64_encode($dompdf->output());
    }

    /**
     * HTML del documento (sanitizado) listo para mostrar en el portal o incrustar en el PDF.
     */
    private function renderDocumentHtml(array $envelope): string
    {
        if (!empty($envelope['amendment_id'])) {
            return $this->renderAmendmentHtml($envelope['amendment_id']);
        }

        $contract = $this->fetchContractDetail($envelope['contract_id'] ?? '');
        if (!$contract) {
            return '<p>No se encontró el documento.</p>';
        }

        if (!empty($contract['template_body'])) {
            $html = $this->renderBodyPdf($contract['template_body']);

            $replacements = [
                '{{company_name}}' => $contract['company_name'] ?? 'Company',
                '{{company_tax_id}}' => $contract['company_tax_id'] ?? 'N/A',
                '{{company_address}}' => $contract['company_address'] ?? 'Remote',
                '{{representative_name}}' => $contract['representative_name'] ?? 'Company Representative',
                '{{employee_name}}' => $contract['user_name'] ?? 'Contractor',
                '{{employee_id_number}}' => $contract['user_national_id'] ?? 'N/A',
                '{{employee_address}}' => $contract['user_address'] ?? 'Remote',
                '{{employee_nationality}}' => $contract['user_nationality'] ?? 'N/A',
                '{{job_title}}' => $contract['title'] ?? 'Contractor',
                '{{start_date}}' => $contract['start_date'] ?? date('Y-m-d'),
                '{{salary}}' => $contract['rate'] ?? '0',
                '{{currency}}' => $contract['currency_code'] ?? 'USD',
                '{{position}}' => $contract['title'] ?? 'Contractor',
                '{{functions}}' => $contract['scope_of_work'] ?? 'To be defined',
                '{{work_modality}}' => $contract['special_clause'] ?? 'Remoto',
                '{{notice_period}}' => $contract['notice_period'] ?? '15',
                '{{payment_frequency}}' => $contract['payment_frequency'] ?? 'monthly',
                '{{work_schedule}}' => 'According to project needs',
                '{{city_signing}}' => 'Remote',
                '{{day}}' => date('d'),
                '{{month}}' => date('m'),
                '{{year}}' => date('Y'),
                '{{notice_days}}' => $contract['notice_period'] ?? '30',
                '{{contractor_name}}' => $contract['user_name'] ?? 'Contractor',
                '{{services_description}}' => $contract['scope_of_work'] ?? 'Services as agreed.',
                '{{rate_unit}}' => 'month',
                '{{state_law}}' => 'Delaware',
            ];

            foreach ($replacements as $key => $value) {
                $html = str_replace($key, htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'), $html);
            }

            return $html;
        }

        // Fallback manual
        $lines = [];
        $lines[] = '<p><b>CONTRACT AGREEMENT</b></p>';
        $lines[] = '<p>Between: <b>' . ($contract['company_name'] ?? 'Company') . '</b></p>';
        $lines[] = '<p>And: <b>' . ($contract['user_name'] ?? 'Contractor') . '</b></p>';
        $lines[] = '<p>Job Title: ' . ($contract['title'] ?? 'N/A') . '</p>';
        $lines[] = '<p>Start Date: ' . ($contract['start_date'] ?? 'N/A') . '</p>';
        $lines[] = '<p>Rate: ' . ($contract['rate'] ?? '0') . ' ' . ($contract['currency_code'] ?? 'USD') . '</p>';
        $lines[] = '<p>Scope of Work:</p>';
        $lines[] = '<p>' . nl2br(htmlspecialchars((string)($contract['scope_of_work'] ?? 'See attached details.'), ENT_QUOTES, 'UTF-8')) . '</p>';
        return implode("\n", $lines);
    }

    private function renderAmendmentHtml(string $amendmentId): string
    {
        $stmt = $this->pdo->prepare("
            SELECT ca.*, c.title, u.full_name as user_name, comp.legal_name as company_name
            FROM contract_amendments ca
            JOIN contracts c ON ca.contract_id = c.id
            LEFT JOIN users u ON c.freelancer_id = u.id
            LEFT JOIN companies comp ON c.company_id = comp.id
            WHERE ca.id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $amendmentId]);
        $amendment = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$amendment) {
            return '<p>No se encontró la enmienda.</p>';
        }

        $changes = json_decode($amendment['changes_json'] ?? '[]', true);
        $items = '';
        if (is_array($changes)) {
            foreach ($changes as $field => $vals) {
                $items .= '<li>' . htmlspecialchars(ucfirst(str_replace('_', ' ', $field)), ENT_QUOTES, 'UTF-8')
                    . ': de \'' . htmlspecialchars((string)($vals['old'] ?? 'N/A'), ENT_QUOTES, 'UTF-8')
                    . '\' a \'' . htmlspecialchars((string)($vals['new'] ?? 'N/A'), ENT_QUOTES, 'UTF-8') . '\'</li>';
            }
        }

        $html = '<h3>ENMIENDA AL CONTRATO</h3>';
        $html .= '<p>Esta enmienda modifica el contrato titulado: <b>' . htmlspecialchars((string)($amendment['title'] ?? 'N/A'), ENT_QUOTES, 'UTF-8') . '</b></p>';
        $html .= '<p>Fecha de vigencia: ' . date('Y-m-d') . '</p>';
        $html .= '<p>Se acuerdan los siguientes cambios:</p>';
        $html .= '<ul>' . $items . '</ul>';
        $html .= '<p>Todos los demás términos permanecen sin cambios.</p>';
        return $html;
    }

    private function fetchContractDetail(string $contractId): ?array
    {
        if ($contractId === '') {
            return null;
        }
        $sql = "
            SELECT c.*,
                   u.email as user_email, u.full_name as user_name,
                   u.national_id as user_national_id, u.address as user_address, u.nationality as user_nationality,
                   comp.legal_name as company_name, comp.tax_id as company_tax_id, comp.address as company_address, comp.representative_name,
                   ct.body as template_body,
                   curr.code as currency_code
            FROM contracts c
            LEFT JOIN users u ON c.freelancer_id = u.id
            LEFT JOIN companies comp ON c.company_id = comp.id
            LEFT JOIN contract_templates ct ON c.template_id = ct.id
            LEFT JOIN currencies curr ON c.currency_id = curr.id
            WHERE c.id = :id
            LIMIT 1
        ";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([':id' => $contractId]);
        $contract = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$contract) {
            $stmt = $this->pdo->prepare(str_replace('c.freelancer_id = u.id', 'c.user_id = u.id', $sql));
            $stmt->execute([':id' => $contractId]);
            $contract = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        return $contract ?: null;
    }

    private function fallbackSignerName(array $envelope): string
    {
        $contract = $this->fetchContractDetail($envelope['contract_id'] ?? '');
        return $contract['user_name'] ?? 'Firmante';
    }

    private function fallbackSignerEmail(array $envelope): string
    {
        $contract = $this->fetchContractDetail($envelope['contract_id'] ?? '');
        return $contract['user_email'] ?? '';
    }

    private function clientIp(): string
    {
        $forwarded = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if ($forwarded !== '') {
            $parts = explode(',', $forwarded);
            return trim($parts[0]);
        }
        return $_SERVER['REMOTE_ADDR'] ?? '';
    }

    private function apiBaseUrl(): string
    {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $base = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
        $script = $_SERVER['SCRIPT_NAME'] ?? '';
        if (strpos($script, '/public/') !== false) {
            return $base . str_replace('/index.php', '', $script);
        }
        return $base;
    }

    private function sanitizeBody(string $body): string
    {
        $body = str_ireplace(['<div>', '</div>'], ['<p>', '</p>'], $body);
        $allowed = '<p><br><b><strong><i><em><u><s><strike><ul><ol><li><h1><h2><h3><h4><blockquote><hr>';
        $body = strip_tags($body, $allowed);
        return trim($body);
    }

    private function renderBodyPdf(string $body): string
    {
        $html = $this->sanitizeBody($body);
        if (stripos($html, '<p') === false
            && stripos($html, '<br') === false
            && stripos($html, '<h') === false
            && stripos($html, '<li') === false) {
            $html = preg_replace("/\r\n?/", "\n", $html);
            $html = trim($html);
            $html = '<p>' . str_replace(["\n\n", "\n"], ["</p><p>", '<br>'], $html) . '</p>';
        }
        return $html;
    }
}