<?php

namespace App\Support;

class Str
{
    public static function uuid(): string
    {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }

    public static function randomDigits(int $length): string
    {
        if ($length < 1) $length = 1;
        $max = (10 ** $length) - 1;
        $num = random_int(0, $max);
        return str_pad((string)$num, $length, '0', STR_PAD_LEFT);
    }
}
