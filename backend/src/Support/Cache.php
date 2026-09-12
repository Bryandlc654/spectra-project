<?php

namespace App\Support;

class Cache
{
    private const DEFAULT_DIR = __DIR__ . '/../../storage/cache';

    private static array $memory = [];
    private static ?string $dir = null;

    private static function dir(): string
    {
        if (self::$dir === null) {
            $envDir = getenv('CACHE_DIR');
            self::$dir = $envDir ?: self::DEFAULT_DIR;
        }

        return rtrim(self::$dir, '/\\');
    }

    public static function get(string $key, $default = null)
    {
        $mKey = self::key($key);

        if (array_key_exists($mKey, self::$memory)) {
            return self::$memory[$mKey];
        }

        $file = self::dir() . '/' . $mKey . '.cache';
        if (!is_file($file)) {
            return $default;
        }

        $raw = @file_get_contents($file);
        if ($raw === false) {
            return $default;
        }

        $payload = @json_decode($raw, true);
        if (!is_array($payload) || !isset($payload['expires_at'], $payload['value'])) {
            return $default;
        }

        if (time() >= (int)$payload['expires_at']) {
            @unlink($file);
            return $default;
        }

        return self::$memory[$mKey] = $payload['value'];
    }

    public static function set(string $key, $value, int $ttl = 300): void
    {
        $mKey = self::key($key);
        self::$memory[$mKey] = $value;

        $dir = self::dir();
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            return;
        }

        $file = $dir . '/' . $mKey . '.cache';
        $payload = json_encode([
            'expires_at' => time() + max(1, $ttl),
            'value' => $value,
        ], JSON_UNESCAPED_UNICODE);

        $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($tmp, $payload, LOCK_EX) === false) {
            return;
        }

        @rename($tmp, $file);
    }

    public static function delete(string $key): void
    {
        $mKey = self::key($key);
        unset(self::$memory[$mKey]);

        $file = self::dir() . '/' . $mKey . '.cache';
        if (is_file($file)) {
            @unlink($file);
        }
    }

    public static function flush(): void
    {
        self::$memory = [];

        foreach (glob(self::dir() . '/*.cache') ?: [] as $file) {
            @unlink($file);
        }
    }

    public static function remember(string $key, int $ttl, callable $fn)
    {
        $cached = self::get($key, null);

        if ($cached !== null) {
            return $cached;
        }

        $value = $fn();
        self::set($key, $value, $ttl);

        return $value;
    }

    private static function key(string $key): string
    {
        return preg_replace('/[^a-zA-Z0-9_.-]/', '_', $key);
    }
}