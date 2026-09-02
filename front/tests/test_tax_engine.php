<?php

require_once __DIR__ . '/../Backend/src/Support/TaxEngine.php';

use App\Support\TaxEngine;

// Mock dependencies if needed (none for static class)

echo "Testing TaxEngine...\n\n";

// Scenario 1: Peru 4th Category < 1500
$res1 = TaxEngine::calculate(1000, 'PE', 'contractor');
echo "Scenario 1 (PE, Contractor, 1000): " . (empty($res1) ? "OK (No Tax)" : "FAIL " . json_encode($res1)) . "\n";

// Scenario 2: Peru 4th Category > 1500
$res2 = TaxEngine::calculate(2000, 'PE', 'contractor');
$tax2 = $res2[0]['amount'] ?? 0;
echo "Scenario 2 (PE, Contractor, 2000): " . ($tax2 == 160.00 ? "OK ($tax2)" : "FAIL ($tax2 expected 160)") . "\n";

// Scenario 3: Peru 5th Category 10,000
// UIT 2025 = 5350
// Annual = 140,000
// Deduction = 37,450
// Net = 102,550
// Tax = 2,140 (Bracket 1) + 10,612 (Bracket 2) = 12,752
// Monthly = 1062.67 (rounded)
$res3 = TaxEngine::calculate(10000, 'PE', 'full_time');
$tax3 = 0;
$pension3 = 0;
foreach ($res3 as $item) {
    if (strpos($item['name'], 'Renta') !== false) $tax3 = $item['amount'];
    if (strpos($item['name'], 'Pensiones') !== false) $pension3 = $item['amount'];
}
echo "Scenario 3 (PE, Employee, 10000):\n";
echo "  Tax: " . ($tax3 > 1060 && $tax3 < 1065 ? "OK ($tax3)" : "FAIL ($tax3 expected ~1062.67)") . "\n";
echo "  Pension: " . ($pension3 == 1300 ? "OK ($pension3)" : "FAIL ($pension3 expected 1300)") . "\n";

// Scenario 4: Mexico Placeholder
$res4 = TaxEngine::calculate(10000, 'MX', 'full_time');
$tax4 = $res4[0]['amount'] ?? 0;
echo "Scenario 4 (MX, Employee, 10000): " . ($tax4 == 1000 ? "OK ($tax4)" : "FAIL ($tax4 expected 1000)") . "\n";

