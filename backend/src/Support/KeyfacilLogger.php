<?php

namespace App\Support;

class KeyfacilLogger
{
    private const MAX_BYTES = 2097152; // 2 MB
    private const KEEP_LINES = 500;

    public static function log(array $entry): void
    {
        try {
            $dir = dirname(__DIR__, 2) . '/storage/logs';
            if (!is_dir($dir)) {
                @mkdir($dir, 0775, true);
            }
            $file = $dir . '/keyfacil-api.log';

            $payload = [
                'timestamp' => date('c'),
                'request_id' => $entry['request_id'] ?? bin2hex(random_bytes(8)),
                'method' => $entry['method'] ?? null,
                'path' => $entry['path'] ?? null,
                'http_status' => $entry['http_status'] ?? 0,
                'ok' => (bool)($entry['ok'] ?? false),
                'error' => $entry['error'] ?? null,
                'duration_ms' => $entry['duration_ms'] ?? null,
                'context' => self::sanitize($entry['context'] ?? []),
                'request' => self::sanitize($entry['request'] ?? []),
                'response' => self::sanitize($entry['response'] ?? null),
            ];

            $line = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($line === false) {
                $line = json_encode(['timestamp' => date('c'), 'error' => 'log_encode_failed']);
            }

            if (is_file($file) && filesize($file) > self::MAX_BYTES) {
                self::rotate($file);
            }

            file_put_contents($file, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
        } catch (\Throwable $e) {
            // Logging must never break the request.
        }
    }

    public static function tail(int $limit = 100): array
    {
        $file = dirname(__DIR__, 2) . '/storage/logs/keyfacil-api.log';
        if (!is_file($file)) return [];

        $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!$lines) return [];

        $slice = array_slice($lines, -max(1, $limit));
        $out = [];
        foreach ($slice as $line) {
            $decoded = json_decode($line, true);
            if (is_array($decoded)) $out[] = $decoded;
        }

        return array_reverse($out);
    }

    private static function rotate(string $file): void
    {
        $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!$lines) return;

        $keep = array_slice($lines, -self::KEEP_LINES);
        @file_put_contents($file, implode(PHP_EOL, $keep) . PHP_EOL, LOCK_EX);
    }

    private static function sanitize($value, int $depth = 0)
    {
        if ($depth > 10) return '[max-depth]';

        if (is_array($value)) {
            $out = [];
            foreach ($value as $key => $item) {
                $out[$key] = self::sanitize($item, $depth + 1);
            }
            return $out;
        }

        if (is_string($value)) {
            $length = strlen($value);
            if ($length > 600) {
                return substr($value, 0, 600) . '...[truncated length=' . $length . ']';
            }
            return $value;
        }

        if (is_object($value)) {
            return self::sanitize((array)$value, $depth + 1);
        }

        return $value;
    }
}
