<?php

namespace App\Support;

final class Response
{
    public static function json(array $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        if (!defined('TEST_MODE')) exit;
    }

    /**
     * Devuelve un error JSON consistente y corta ejecución.
     * $extra se envía como "details" (útil para depuración).
     */
    public static function error(string $message, int $status = 400, array $extra = []): void
    {
        $payload = ['message' => $message];

        if (!empty($extra)) {
            $payload['details'] = $extra;
        }

        self::json($payload, $status);
    }

    public static function noContent(): void
    {
        http_response_code(204);
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        if (!defined('TEST_MODE')) exit;
    }
}
