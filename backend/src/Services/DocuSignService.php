<?php

namespace App\Services;

class DocuSignService
{
    private string $accountId;
    private string $baseUrl;
    private string $accessToken;

    public function __construct()
    {
        // In a real implementation, these would come from env vars or database config
        // For now, we allow simulation if not configured
        $this->accountId = getenv('DOCUSIGN_ACCOUNT_ID') ?: 'demo_account';
        $this->baseUrl = getenv('DOCUSIGN_BASE_URL') ?: 'https://demo.docusign.net/restapi';
        $this->accessToken = getenv('DOCUSIGN_ACCESS_TOKEN') ?: '';
    }

    public function isConfigured(): bool
    {
        return !empty($this->accessToken) && $this->accountId !== 'demo_account';
    }

    /**
     * Creates an envelope in DocuSign
     * @param array $documents Array of ['name' => '...', 'file_base64' => '...', 'file_extension' => '...']
     * @param array $recipients Array of ['email' => '...', 'name' => '...', 'recipientId' => '1']
     * @param string $emailSubject
     * @return string Envelope ID
     * @throws \Exception
     */
    public function createEnvelope(array $documents, array $recipients, string $emailSubject): string
    {
        if (!$this->isConfigured()) {
            // Simulation Mode
            return 'DS-SIM-' . strtoupper(uniqid());
        }

        $url = "{$this->baseUrl}/v2.1/accounts/{$this->accountId}/envelopes";
        
        $body = [
            'emailSubject' => $emailSubject,
            'documents' => array_map(function($doc, $index) {
                return [
                    'documentBase64' => $doc['file_base64'],
                    'name' => $doc['name'],
                    'fileExtension' => $doc['file_extension'],
                    'documentId' => (string)($index + 1)
                ];
            }, $documents, array_keys($documents)),
            'recipients' => [
                'signers' => $recipients
            ],
            'status' => 'sent'
        ];

        $response = $this->call('POST', $url, $body);
        
        if (!isset($response['envelopeId'])) {
            throw new \Exception('DocuSign API Error: ' . json_encode($response));
        }

        return $response['envelopeId'];
    }

    /**
     * Creates an envelope from a template
     * @param string $templateId DocuSign Template ID
     * @param array $recipients Array of ['email' => '...', 'name' => '...', 'roleName' => '...']
     * @param string $emailSubject
     * @return string Envelope ID
     * @throws \Exception
     */
    public function createEnvelopeFromTemplate(string $templateId, array $recipients, string $emailSubject): string
    {
        if (!$this->isConfigured()) {
            return 'DS-SIM-TMP-' . strtoupper(uniqid());
        }

        $url = "{$this->baseUrl}/v2.1/accounts/{$this->accountId}/envelopes";
        
        $body = [
            'emailSubject' => $emailSubject,
            'templateId' => $templateId,
            'templateRoles' => array_map(function($recipient) {
                return [
                    'email' => $recipient['email'],
                    'name' => $recipient['name'],
                    'roleName' => $recipient['roleName'] ?? 'Signer',
                    'clientUserId' => $recipient['clientUserId'] ?? null // For embedded signing if needed
                ];
            }, $recipients),
            'status' => 'sent'
        ];

        $response = $this->call('POST', $url, $body);
        
        if (!isset($response['envelopeId'])) {
            throw new \Exception('DocuSign API Error: ' . json_encode($response));
        }

        return $response['envelopeId'];
    }

    public function getEnvelopeStatus(string $envelopeId): string
    {
        if (!$this->isConfigured()) {
            return 'sent'; // Simulation
        }

        $url = "{$this->baseUrl}/v2.1/accounts/{$this->accountId}/envelopes/{$envelopeId}";
        $response = $this->call('GET', $url);
        
        return $response['status'] ?? 'unknown';
    }

    public function createRecipientView(string $envelopeId, string $userName, string $userEmail, string $clientUserId, string $returnUrl): string
    {
        if (!$this->isConfigured()) {
            return $returnUrl . '?event=signing_complete'; // Simulation
        }

        $url = "{$this->baseUrl}/v2.1/accounts/{$this->accountId}/envelopes/{$envelopeId}/views/recipient";
        
        $body = [
            'authenticationMethod' => 'email',
            'clientUserId' => $clientUserId,
            'email' => $userEmail,
            'userName' => $userName,
            'returnUrl' => $returnUrl
        ];

        $response = $this->call('POST', $url, $body);
        
        if (!isset($response['url'])) {
            throw new \Exception('DocuSign API Error: ' . json_encode($response));
        }

        return $response['url'];
    }

    private function call(string $method, string $url, array $data = [])
    {
        $ch = curl_init($url);
        
        $headers = [
            'Authorization: Bearer ' . $this->accessToken,
            'Content-Type: application/json'
        ];

        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }

        $result = curl_exec($ch);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            throw new \Exception("Curl Error: $error");
        }

        return json_decode($result, true);
    }
}
