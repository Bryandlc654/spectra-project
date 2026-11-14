<?php

namespace App\Support;

/**
 * Lectura y escritura mínima de hojas de cálculo .xlsx (Office Open XML)
 * usando solo ZipArchive y SimpleXML (sin dependencias externas).
 *
 * - build(): genera un .xlsx con una o varias hojas (texto, cabecera en negrita,
 *   anchos de columna y primera fila inmovilizada).
 * - readRows(): devuelve las filas de la primera hoja como arrays de strings.
 * - readCsvRows(): alternativa CSV (separador , o ; autodetectado).
 */
class Xlsx
{
    /**
     * @param array<int, array{name: string, rows: array<int, array<int, string|int|float|null>>, widths?: array<int, int>, header?: bool}> $sheets
     */
    public static function build(array $sheets): string
    {
        $tmp = tempnam(sys_get_temp_dir(), 'xlsx');
        $zip = new \ZipArchive();
        if ($zip->open($tmp, \ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('No se pudo crear el archivo Excel');
        }

        $sheetEntries = '';
        $relEntries = '';
        $contentSheets = '';
        foreach (array_values($sheets) as $i => $sheet) {
            $n = $i + 1;
            $sheetEntries .= '<sheet name="' . self::esc(mb_substr($sheet['name'], 0, 31)) . '" sheetId="' . $n . '" r:id="rId' . $n . '"/>';
            $relEntries .= '<Relationship Id="rId' . $n . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $n . '.xml"/>';
            $contentSheets .= '<Override PartName="/xl/worksheets/sheet' . $n . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
            $zip->addFromString('xl/worksheets/sheet' . $n . '.xml', self::sheetXml($sheet));
        }
        $stylesRel = '<Relationship Id="rId' . (count($sheets) + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';

        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . $contentSheets . '</Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>');
        $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets>' . $sheetEntries . '</sheets></workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' . $relEntries . $stylesRel . '</Relationships>');
        // Estilo 0: normal; estilo 1: negrita con fondo gris claro (cabecera)
        $zip->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
            . '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill></fills>'
            . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            . '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
            . '</styleSheet>');
        $zip->close();

        $bin = (string)file_get_contents($tmp);
        @unlink($tmp);
        return $bin;
    }

    private static function sheetXml(array $sheet): string
    {
        $rows = $sheet['rows'] ?? [];
        $header = $sheet['header'] ?? true;
        $cols = '';
        foreach (($sheet['widths'] ?? []) as $i => $w) {
            $c = $i + 1;
            $cols .= '<col min="' . $c . '" max="' . $c . '" width="' . (int)$w . '" customWidth="1"/>';
        }
        $data = '';
        foreach ($rows as $r => $row) {
            $rowNum = $r + 1;
            $cells = '';
            foreach (array_values($row) as $c => $val) {
                if ($val === null || $val === '') continue;
                $ref = self::colLetter($c) . $rowNum;
                $style = ($header && $r === 0) ? ' s="1"' : '';
                $cells .= '<c r="' . $ref . '" t="inlineStr"' . $style . '><is><t xml:space="preserve">' . self::esc((string)$val) . '</t></is></c>';
            }
            $data .= '<row r="' . $rowNum . '">' . $cells . '</row>';
        }
        $pane = $header ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . $pane . ($cols ? '<cols>' . $cols . '</cols>' : '') . '<sheetData>' . $data . '</sheetData></worksheet>';
    }

    /**
     * Filas de la primera hoja (máx. $maxRows). Celdas vacías => ''.
     * @return array<int, array<int, string>>
     */
    public static function readRows(string $path, int $maxRows = 1000): array
    {
        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) {
            throw new \RuntimeException('El archivo no es un Excel (.xlsx) válido');
        }
        try {
            $shared = [];
            $ss = $zip->getFromName('xl/sharedStrings.xml');
            if ($ss !== false) {
                $x = self::xml($ss);
                foreach ($x->si as $si) {
                    if (isset($si->t)) {
                        $shared[] = (string)$si->t;
                    } else {
                        $txt = '';
                        foreach ($si->r as $run) $txt .= (string)$run->t;
                        $shared[] = $txt;
                    }
                }
            }

            // Primera hoja según workbook + relaciones
            $sheetPath = 'xl/worksheets/sheet1.xml';
            $wb = $zip->getFromName('xl/workbook.xml');
            $rels = $zip->getFromName('xl/_rels/workbook.xml.rels');
            if ($wb !== false && $rels !== false) {
                $w = self::xml($wb);
                $first = $w->sheets->sheet[0] ?? null;
                if ($first) {
                    $rid = (string)$first->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];
                    foreach (self::xml($rels)->Relationship as $rel) {
                        if ((string)$rel['Id'] === $rid) {
                            $target = ltrim((string)$rel['Target'], '/');
                            $sheetPath = str_starts_with($target, 'xl/') ? $target : 'xl/' . $target;
                        }
                    }
                }
            }
            $sheet = $zip->getFromName($sheetPath);
            if ($sheet === false) {
                throw new \RuntimeException('El Excel no contiene hojas');
            }
            $s = self::xml($sheet);
            $out = [];
            foreach ($s->sheetData->row as $row) {
                if (count($out) >= $maxRows) break;
                $vals = [];
                foreach ($row->c as $c) {
                    $idx = self::colIndex(preg_replace('/\d+/', '', (string)$c['r']));
                    $t = (string)$c['t'];
                    if ($t === 's') {
                        $v = $shared[(int)$c->v] ?? '';
                    } elseif ($t === 'inlineStr') {
                        $v = (string)($c->is->t ?? '');
                        if ($v === '' && isset($c->is->r)) foreach ($c->is->r as $run) $v .= (string)$run->t;
                    } elseif ($t === 'b') {
                        $v = ((string)$c->v) === '1' ? 'TRUE' : 'FALSE';
                    } else {
                        $v = (string)($c->v ?? '');
                        // Números enteros grandes (RUC) pueden venir como 2.0123456789E10
                        if ($v !== '' && is_numeric($v) && stripos($v, 'e') !== false) {
                            $v = number_format((float)$v, 0, '', '');
                        }
                    }
                    $vals[$idx] = trim($v);
                }
                if (!$vals) { $out[] = []; continue; }
                $line = [];
                for ($i = 0, $max = max(array_keys($vals)); $i <= $max; $i++) $line[] = $vals[$i] ?? '';
                $out[] = $line;
            }
            return $out;
        } finally {
            $zip->close();
        }
    }

    /** @return array<int, array<int, string>> */
    public static function readCsvRows(string $path, int $maxRows = 1000): array
    {
        $raw = (string)file_get_contents($path);
        $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw); // BOM
        if (!mb_check_encoding($raw, 'UTF-8')) $raw = mb_convert_encoding($raw, 'UTF-8', 'Windows-1252');
        $firstLine = strtok($raw, "\n") ?: '';
        $sep = substr_count($firstLine, ';') > substr_count($firstLine, ',') ? ';' : ',';
        $out = [];
        $fh = fopen('php://memory', 'r+');
        fwrite($fh, $raw);
        rewind($fh);
        while (($row = fgetcsv($fh, 0, $sep, '"', '\\')) !== false && count($out) < $maxRows) {
            $out[] = array_map(fn($v) => trim((string)$v), $row);
        }
        fclose($fh);
        return $out;
    }

    private static function xml(string $s): \SimpleXMLElement
    {
        // LIBXML_NONET: nunca resolver entidades externas
        $x = simplexml_load_string($s, \SimpleXMLElement::class, LIBXML_NONET);
        if ($x === false) throw new \RuntimeException('El Excel está dañado');
        return $x;
    }

    private static function esc(string $s): string
    {
        // Eliminar caracteres de control no válidos en XML
        $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $s) ?? '';
        return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    private static function colLetter(int $i): string
    {
        $s = '';
        $i++;
        while ($i > 0) {
            $m = ($i - 1) % 26;
            $s = chr(65 + $m) . $s;
            $i = intdiv($i - 1, 26);
        }
        return $s;
    }

    private static function colIndex(string $letters): int
    {
        $n = 0;
        foreach (str_split(strtoupper($letters)) as $ch) $n = $n * 26 + (ord($ch) - 64);
        return max(0, $n - 1);
    }
}
