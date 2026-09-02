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

        $logs = [];
        $count = 0;
        $skipped = 0;
        
        // This is a simplified reader. For production with huge logs, 
        // we might need a more robust solution (like keeping a separate index).
        // For now, we iterate files.
        
        foreach ($files as $file) {
            // Read file into array (careful with memory for huge files)
            // Ideally read line by line backwards. 
            // For MVP, file() is okay if daily logs aren't massive.
            $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if (!$lines) continue;
            
            $lines = array_reverse($lines); // Newest lines first

            foreach ($lines as $line) {
                $data = json_decode($line, true);
                if (!$data) continue;

                // Apply filters
                if (!empty($filters['actor_user_id']) && ($data['actor_user_id'] ?? '') !== $filters['actor_user_id']) continue;
                if (!empty($filters['company_id']) && ($data['company_id'] ?? '') !== $filters['company_id']) continue;
                if (!empty($filters['action']) && ($data['action'] ?? '') !== $filters['action']) continue;

                if ($skipped < $offset) {
                    $skipped++;
                    continue;
                }

                $logs[] = $data;
                $count++;

                if ($count >= $limit) break 2;
            }
        }
        
        return [
            'data' => $logs,
            'total' => $count + $skipped + 100 // Approximation since we don't scan all files for total count
        ];
    }

    private function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
