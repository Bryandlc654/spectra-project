<?php
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../src/Support/TaxEngine.php';
require_once __DIR__ . '/../src/Database.php';

$config = require __DIR__ . '/../config/config.php';
$db = new \App\Database($config['db']);
$pdo = $db->pdo();

$stmt = $pdo->prepare("
    SELECT fp.* 
    FROM fiscal_parameters fp
    JOIN countries c ON fp.country_id = c.id
    WHERE c.iso2 = 'PE' AND fp.is_active = 1
");
$stmt->execute();
$params = $stmt->fetchAll(PDO::FETCH_ASSOC);

$gross = 5000.0;

$onp = \App\Support\TaxEngine::calculate($gross, 'PE', 'fixed', [
    'pension_regime' => 'ONP',
    'pension_rate' => 0.13
], $params);

$afpFlow = \App\Support\TaxEngine::calculate($gross, 'PE', 'fixed', [
    'pension_regime' => 'AFP',
    'afp_commission' => 'flow'
], $params);

$afpMixed = \App\Support\TaxEngine::calculate($gross, 'PE', 'fixed', [
    'pension_regime' => 'AFP',
    'afp_commission' => 'mixed'
], $params);

$afpFlowFam = \App\Support\TaxEngine::calculate($gross, 'PE', 'fixed', [
    'pension_regime' => 'AFP',
    'afp_commission' => 'flow',
    'has_family_allowance' => true
], $params);

function computeNet($gross, $items) {
    $tax = 0; $ded = 0; $earn = 0;
    foreach ($items as $it) {
        $amt = (float)($it['amount'] ?? 0);
        if (($it['type'] ?? '') === 'tax') $tax += $amt;
        if (($it['type'] ?? '') === 'deduction') $ded += $amt;
        if (($it['type'] ?? '') === 'earning') $earn += $amt;
    }
    return [
        'taxes' => round($tax, 2),
        'deductions' => round($ded, 2),
        'earnings' => round($earn, 2),
        'net' => round($gross + $earn - $tax - $ded, 2)
    ];
}

header('Content-Type: application/json');
echo json_encode([
    'gross' => $gross,
    'onp' => $onp,
    'afp_flow' => $afpFlow,
    'afp_mixed' => $afpMixed,
    'afp_flow_with_family' => [
        'items' => $afpFlowFam,
        'calc' => computeNet($gross, $afpFlowFam)
    ]
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
