<?php

namespace App\Support;

class AuditLogger
{
    private string $logPath;

    public function __construct()
    {
        $this->logPath = __DIR__ . '/../../storage/logs';
        if (!is_dir($this->logPath)) {
            if (!mkdir($this->logPath, 0777, true) && !is_dir($this->logPath)) {
                error_log("Failed to create audit log directory: " . $this->logPath);
            }
        }
    }

    public function log(string $action, ?string $targetType = null, ?string $targetId = null, array $details = [], ?string $companyId = null, ?string $description = null): void
    {
        try {
            $userId = Auth::userId();
            $ip = $_SERVER['REMOTE_ADDR'] ?? null;
            $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;
            
            $entry = [
                'id' => $this->uuid(),
                'company_id' => $companyId,
                'actor_user_id' => $userId,
                'action' => $action,
                'object_type' => $targetType,
                'object_id' => $targetId,
                'description' => $description,
                'metadata' => $details,
                'ip' => $ip,
                'user_agent' => $userAgent,
                'created_at' => date('Y-m-d H:i:s')
            ];

            $file = $this->logPath . '/audit-' . date('Y-m-d') . '.jsonl';
            file_put_contents($file, json_encode($entry, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);
        } catch (\Throwable $e) {
            // Fail silently or log to system error log
            error_log("Audit Log Error: " . $e->getMessage());
        }
    }

    public function getLogs(array $filters = [], int $limit = 50, int $offset = 0): array
    {
        $files = glob($this->logPath . '/audit-*.jsonl');
        if (!$files) return ['data' => [], 'total' => 0];

        rsort($files); // Newest files first

        $matched = [];
        foreach ($files as $file) {
            $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if (!$lines) continue;

            $lines = array_reverse($lines); // Newest lines first

            foreach ($lines as $line) {
                $data = json_decode($line, true);
                if (!$data) continue;

                if (!empty($filters['actor_user_id']) && ($data['actor_user_id'] ?? '') !== $filters['actor_user_id']) continue;
                if (!empty($filters['company_id']) && ($data['company_id'] ?? '') !== $filters['company_id']) continue;
                if (!empty($filters['action']) && ($data['action'] ?? '') !== $filters['action']) continue;

                $matched[] = $data;
            }
        }

        $total = count($matched);
        $data = $limit > 0 ? array_slice($matched, max(0, $offset), $limit) : [];

        return ['data' => $data, 'total' => $total];
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
