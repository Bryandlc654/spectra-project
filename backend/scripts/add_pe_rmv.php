<?php
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../src/Database.php';

$config = require __DIR__ . '/../config/config.php';
$db = new \App\Database($config['db']);
$pdo = $db->pdo();

try {
    $target = 1130.00;

    $stmt = $pdo->prepare("SELECT id, iso2, name FROM countries WHERE iso2 = 'PE'");
    $stmt->execute();
    $countries = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
    if (count($countries) === 0) {
        throw new \RuntimeException('País PE no encontrado en tabla countries');
    }

    $totalUpdated = 0;
    $totalInserted = 0;

    foreach ($countries as $c) {
        $countryId = (int)($c['id'] ?? 0);
        if ($countryId <= 0) {
            continue;
        }

        $check = $pdo->prepare("SELECT id, code, percentage FROM fiscal_parameters WHERE country_id = :cid AND UPPER(code) = 'PE_RMV'");
        $check->execute([':cid' => $countryId]);
        $existingRows = $check->fetchAll(\PDO::FETCH_ASSOC) ?: [];

        if (count($existingRows) > 0) {
            foreach ($existingRows as $row) {
                $id = (int)($row['id'] ?? 0);
                if ($id <= 0) continue;
                $current = (float)($row['percentage'] ?? 0);
                if (abs($current - $target) < 0.00001) {
                    continue;
                }
                $upd = $pdo->prepare("UPDATE fiscal_parameters SET percentage = :perc WHERE id = :id");
                $upd->execute([':perc' => $target, ':id' => $id]);
                $totalUpdated += (int)$upd->rowCount();
            }
            continue;
        }

        $insert = $pdo->prepare("
            INSERT INTO fiscal_parameters (country_id, name, code, percentage, description, type, calculation_base, payslip_trigger, applies_to, is_active)
            VALUES (:cid, :name, :code, :perc, :desc, :type, :base, :trigger, :applies, 1)
        ");
        $insert->execute([
            ':cid' => $countryId,
            ':name' => 'RMV Perú',
            ':code' => 'PE_RMV',
            ':perc' => $target,
            ':desc' => 'Remuneración Mínima Vital vigente',
            ':type' => 'other',
            ':base' => 'other',
            ':trigger' => 'monthly',
            ':applies' => 'any'
        ]);
        $totalInserted += 1;
    }

    echo "PE_RMV objetivo: {$target}\n";
    echo "Actualizados: {$totalUpdated}\n";
    echo "Insertados: {$totalInserted}\n";
} catch (\Throwable $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
