<?php

namespace App\Support;

class TaxEngine
{
    // Tax Units and Constants (2025 Estimates/Values)
    const UIT_PERU_2025 = 5350.00; // Unidad Impositiva Tributaria
    const UMA_MEXICO_2025 = 3300.53; // Unidad de Medida y Actualización (Monthly approx)
    const RMV_PERU_2025 = 1130.00;

    /**
     * Calculate taxes and retentions based on country and contract type.
     * 
     * @param float $grossAmount Monthly gross amount
     * @param string $countryCode ISO 2 code (PE, MX, etc.)
     * @param string $contractType (e.g., 'full_time', 'contractor', 'fixed', 'eor_employee')
     * @param array $options Additional options (e.g., 'has_suspension_letter')
     * @param array $fiscalParams Optional dynamic fiscal parameters from database
     * @return array breakdown of taxes
     */
    public static function calculate(float $grossAmount, string $countryCode, string $contractType, array $options = [], array $fiscalParams = []): array
    {
        $countryCode = strtoupper($countryCode);
        
        // Use dynamic parameters if provided
        if (!empty($fiscalParams)) {
            $items = [];
            // Determine audience from contract type
            $audience = strtolower($contractType) === 'contractor' ? 'contractor' : 'employee';
            $overridePension = ($countryCode === 'PE' && $audience === 'employee' && (!empty($options['pension_regime']) || isset($options['pension_rate'])));
            $rmvValue = (float)($options['rmv'] ?? self::RMV_PERU_2025);
            foreach ($fiscalParams as $p) {
                $codeP = strtoupper((string)($p['code'] ?? ''));
                if ($countryCode === 'PE' && $codeP === 'PE_RMV') {
                    $rmvValue = (float)($p['percentage'] ?? $rmvValue);
                    break;
                }
            }
            $familyAllowanceAmount = 0.0;
            if ($countryCode === 'PE' && $audience === 'employee' && !empty($options['has_family_allowance'])) {
                $familyAllowanceAmount = (float)($options['family_allowance_amount'] ?? ($rmvValue * 0.10));
            }
            foreach ($fiscalParams as $param) {
                $appliesTo = strtolower($param['applies_to'] ?? 'any');
                if ($appliesTo !== 'any' && $appliesTo !== $audience) {
                    continue;
                }
                // Regla especial Perú 4ta: si hay constancia de suspensión, no aplicar IR 4ta
                $code = strtoupper($param['code'] ?? '');
                if ($countryCode === 'PE' && $audience === 'contractor' && in_array($code, ['PE_IR4TA', 'RET_4TA_8'], true)) {
                    $hasSuspension = !empty($options['has_suspension_letter']);
                    if ($hasSuspension || $grossAmount <= 1500) {
                        continue;
                    }
                }
                // Si vamos a recalcular pensiones vía opciones, omitir parámetros de pensión del catálogo para evitar doble conteo
                if ($overridePension) {
                    $name = strtoupper((string)($param['name'] ?? ''));
                    $isPensionParam = str_contains($name, 'AFP') || str_contains($name, 'ONP')
                        || str_contains($name, 'PENS') || str_contains($code, 'AFP') || str_contains($code, 'ONP') || str_contains($code, 'PENSION');
                    if ($isPensionParam) {
                        continue;
                    }
                }
                $typeRaw = strtolower((string)($param['type'] ?? ''));
                if ($typeRaw === 'other' || $code === 'PE_RMV') {
                    continue;
                }
                // Determine calculation base
                $baseName = strtolower((string)($param['calculation_base'] ?? 'payroll_gross'));
                if ($baseName === 'rmv') {
                    $base = $rmvValue;
                } elseif ($typeRaw === 'contribution' && $countryCode === 'PE' && $audience === 'employee') {
                    $base = $grossAmount + $familyAllowanceAmount;
                } else {
                    $base = $grossAmount;
                }
                // Future: Handle 'net_fees' or other bases if needed
                
                $percentage = (float)($param['percentage'] ?? 0);
                $amount = $base * ($percentage / 100);
                
                // Map types
                $engineType = 'tax';
                if ($typeRaw === 'contribution') $engineType = 'employer_contribution';
                if ($typeRaw === 'withholding') $engineType = 'tax';
                if ($typeRaw === 'earning') $engineType = 'earning';
                
                $items[] = [
                    'name' => $param['name'],
                    'code' => $param['code'] ?? null,
                    'type' => $engineType,
                    'amount' => round($amount, 2),
                    'description' => $param['description'] ?? "{$param['name']} (" . number_format($percentage, 2) . "%)"
                ];
            }
            // Añadir pensiones específicas para Perú si corresponde
            if ($overridePension) {
                $pensionBase = $grossAmount + $familyAllowanceAmount;
                $regime = strtoupper((string)($options['pension_regime'] ?? ''));
                if ($regime === 'ONP') {
                    $rate = (float)($options['pension_rate'] ?? 0.13);
                    $items[] = [
                        'name' => 'ONP (Sistema Nacional de Pensiones)',
                        'type' => 'deduction',
                        'amount' => round($pensionBase * $rate, 2),
                        'description' => 'Aporte ONP (' . number_format($rate * 100, 2) . '%)'
                    ];
                } elseif ($regime === 'AFP') {
                    $fund = 0.10;       // Fondo de pensiones
                    $insurance = 0.0137; // Seguro de invalidez/cesantía (promedio)
                    $commission = (strtolower((string)($options['afp_commission'] ?? 'flow')) === 'mixed') ? 0.0018 : 0.0147; // Mixta ~0.18% vs Flujo ~1.47%
                    $items[] = [
                        'name' => 'AFP Fondo (10%)',
                        'type' => 'deduction',
                        'amount' => round($pensionBase * $fund, 2),
                        'description' => 'Aporte al Fondo de Pensiones (10%)'
                    ];
                    $items[] = [
                        'name' => 'AFP Seguro (1.37%)',
                        'type' => 'deduction',
                        'amount' => round($pensionBase * $insurance, 2),
                        'description' => 'Seguro SPP (1.37%)'
                    ];
                    $items[] = [
                        'name' => (strtolower((string)($options['afp_commission'] ?? 'flow')) === 'mixed') ? 'AFP Comisión Mixta (0.18%)' : 'AFP Comisión Flujo (1.47%)',
                        'type' => 'deduction',
                        'amount' => round($pensionBase * $commission, 2),
                        'description' => 'Comisión administrativa AFP'
                    ];
                } else {
                    // Default genérico si se proporcionó solo tasa sin régimen
                    $rate = (float)($options['pension_rate'] ?? 0.13);
                    $items[] = [
                        'name' => 'Fondo de Pensiones (AFP/ONP)',
                        'type' => 'deduction',
                        'amount' => round($pensionBase * $rate, 2),
                        'description' => 'Aporte obligatorio al fondo de pensiones (' . number_format($rate * 100, 2) . '%)'
                    ];
                }
            }
            if ($countryCode === 'PE' && $audience === 'employee' && $familyAllowanceAmount > 0) {
                $items[] = [
                    'name' => 'Asignación Familiar (10% RMV)',
                    'type' => 'earning',
                    'amount' => round($familyAllowanceAmount, 2),
                    'description' => 'Asignación familiar'
                ];
            }
            if ($countryCode === 'PE' && $audience === 'employee') {
                $fifth = self::peruFifthCategoryBreakdown($grossAmount);
                if (($fifth['tax_per_month'] ?? 0) > 0) {
                    $items[] = [
                        'name' => 'Impuesto a la Renta (5ta Categoría)',
                        'type' => 'tax',
                        'amount' => round((float)$fifth['tax_per_month'], 2),
                        'description' => 'Retención mensual proyectada basada en UIT ' . self::UIT_PERU_2025,
                        'meta' => $fifth
                    ];
                }
            }
            return $items;
        }

        switch ($countryCode) {
            case 'PE': // Peru
                return self::calculatePeru($grossAmount, $contractType, $options);
            case 'MX': // Mexico
                return self::calculateMexico($grossAmount, $contractType, $options);
            default:
                return [];
        }
    }

    /**
     * Peru Tax Logic
     * Covers 4th Category (Independent) and 5th Category (Dependent)
     */
    private static function calculatePeru(float $gross, string $type, array $options): array
    {
        $items = [];
        $isDependent = in_array($type, ['full_time', 'part_time', 'eor_employee', 'fixed']);
        
        if ($isDependent) {
            // --- 5ta Categoría (Renta de Trabajo Dependiente) ---
            // Simplified Monthly Projection Algorithm
            
            $fifth = self::peruFifthCategoryBreakdown($gross);
            $monthlyRetention = round((float)($fifth['tax_per_month'] ?? 0), 2);
            
            if ($monthlyRetention > 0) {
                $items[] = [
                    'name' => 'Impuesto a la Renta (5ta Categoría)',
                    'type' => 'tax',
                    'amount' => $monthlyRetention,
                    'description' => 'Retención mensual proyectada basada en UIT ' . self::UIT_PERU_2025,
                    'meta' => $fifth
                ];
            }
            
            // AFP/ONP (Pension) - Simplified average or generic
            // Real implementation would need user's specific AFP choice (Integra, Prima, etc.)
            // We'll use a generic "AFP/ONP" placeholder rate of ~13% if not specified
            $pensionRate = $options['pension_rate'] ?? 0.13;
            $rmvValue = (float)($options['rmv'] ?? self::RMV_PERU_2025);
            $familyAllowanceAmount = !empty($options['has_family_allowance']) ? (float)($options['family_allowance_amount'] ?? ($rmvValue * 0.10)) : 0.0;
            $pensionBase = $gross + $familyAllowanceAmount;
            $pensionAmount = round($pensionBase * $pensionRate, 2);
            
            $items[] = [
                'name' => 'Fondo de Pensiones (AFP/ONP)',
                'type' => 'deduction',
                'amount' => $pensionAmount,
                'description' => 'Aporte obligatorio al fondo de pensiones (~13%)'
            ];

        } else {
            // --- 4ta Categoría (Renta de Trabajo Independiente - Recibos por Honorarios) ---
            // Rule: 8% retention if amount > 1500 PEN (unless suspension letter)
            
            $hasSuspension = $options['has_suspension_letter'] ?? false;
            
            if (!$hasSuspension && $gross > 1500) {
                $retention = round($gross * 0.08, 2);
                $items[] = [
                    'name' => 'Retención 4ta Categoría (8%)',
                    'type' => 'tax',
                    'amount' => $retention,
                    'description' => 'Retención por Recibo por Honorarios > S/1,500'
                ];
            }
        }
        
        return $items;
    }

    private static function peruFifthCategoryBreakdown(float $grossMonthly): array
    {
        $uit = self::UIT_PERU_2025;
        $annualGross = $grossMonthly * 14;
        $deduction = 7 * $uit;
        $taxableAnnual = max(0, $annualGross - $deduction);

        $brackets = [
            [5, 0.08],
            [20, 0.14],
            [35, 0.17],
            [45, 0.20],
            [INF, 0.30]
        ];

        $annualTax = 0.0;
        $remainingIncome = $taxableAnnual;
        $previousLimit = 0.0;
        $topRate = 0.0;

        foreach ($brackets as $bracket) {
            $limitUIT = $bracket[0];
            $rate = (float)$bracket[1];
            $bracketSize = ($limitUIT === INF) ? INF : ($limitUIT * $uit) - ($previousLimit * $uit);
            if ($remainingIncome <= 0) break;
            $taxableInBracket = min($remainingIncome, $bracketSize);
            if ($taxableInBracket > 0) {
                $annualTax += $taxableInBracket * $rate;
                $topRate = $rate;
            }
            $remainingIncome -= $taxableInBracket;
            $previousLimit = (float)$limitUIT;
        }

        $taxPerMonth = round($annualTax / 12, 2);
        return [
            'uit' => round($uit, 2),
            'annual_projection_income' => round($annualGross, 2),
            'deduction_7_uit' => round($deduction, 2),
            'annual_taxable_base' => round($taxableAnnual, 2),
            'top_bracket_rate' => $topRate,
            'annual_tax_total' => round($annualTax, 2),
            'tax_per_month' => $taxPerMonth
        ];
    }

    /**
     * Mexico Tax Logic (ISR)
     * Simplified placeholder for structure
     */
    private static function calculateMexico(float $gross, string $type, array $options): array
    {
        // Placeholder for ISR calculation
        // Mexico uses a monthly table with Lower Limit, Fixed Fee, and % on excess
        
        // Example logic (very simplified)
        $items = [];
        $isr = $gross * 0.10; // Dummy 10%
        
        $items[] = [
            'name' => 'ISR (Retención Provisional)',
            'type' => 'tax',
            'amount' => round($isr, 2),
            'description' => 'Impuesto Sobre la Renta (Estimado)'
        ];
        
        return $items;
    }
}
