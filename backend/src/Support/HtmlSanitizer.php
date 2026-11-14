<?php

namespace App\Support;

class HtmlSanitizer
{
    public static function stripCss(string $body): string
    {
        if ($body === '' || (strpos($body, '{') === false && stripos($body, '<style') === false && stripos($body, '<script') === false)) {
            return $body;
        }

        $body = preg_replace('#<(style|script)\b[^>]*>.*?</\1>#is', '', $body) ?? $body;
        $body = preg_replace('#/\*.*?\*/#s', '', $body) ?? $body;
        $body = preg_replace('#@[a-zA-Z-]+[^{;]*\{[^{}]*\}#s', '', $body) ?? $body;
        $body = preg_replace('#[^{}\r\n]*\{[^{}]*\}#', '', $body) ?? $body;

        $properties = 'color|background(?:-color)?|font(?:-family|-size|-weight|-style)?|line-height|text-align|text-transform|text-decoration|letter-spacing|word-spacing|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|border(?:-(?:top|right|bottom|left))?(?:-radius)?|width|min-width|max-width|height|min-height|max-height|display|float|clear|position|top|right|bottom|left|page-break-(?:inside|before|after)|vertical-align|white-space|overflow|box-shadow|opacity';

        $body = preg_replace('/^[ \t]*(?:' . $properties . ')[ \t]*:[^{}\r\n;]*;[ \t]*$/im', '', $body) ?? $body;

        $lines = preg_split('/\r\n|\r|\n/', $body) ?: [];
        $clean = [];
        foreach ($lines as $line) {
            if (trim($line) === '') {
                $clean[] = '';
                continue;
            }
            $clean[] = ltrim($line);
        }

        $body = implode("\n", $clean);
        $body = preg_replace('/[ \t]+$/m', '', $body) ?? $body;
        $body = preg_replace("/\n{3,}/", "\n\n", $body) ?? $body;

        return trim($body);
    }
}
