<?php

namespace App\Support;

use PDO;

/**
 * Gate central de módulos: replica en el backend la matriz de roles de plataforma
 * (system_role_permissions + fallback de platformRoles.js) para los roles internos.
 * Las empresas/empleados (user, company_admin, freelancer) no se restringen aquí:
 * su acceso ya está acotado por los controladores.
 */
class ModuleAccess
{
    private static ?array $matrix = null;

    public static function guard(PDO $pdo): void
    {
        $user = Auth::user();
        if (!$user) return;

        $role = $user['platform_role'] ?? '';

        // Roles de empresa/empleados: fuera del alcance de la matriz de la plataforma
        if (in_array($role, ['user', 'company_admin', 'freelancer', 'freelance'], true)) return;

        $module = self::moduleForRequest();
        if ($module === null) return; // tabla no mapeada -> mantener comportamiento actual (fail-open)

        if (self::allowedForRole($role, $module, $pdo)) return;

        Response::error('Acceso denegado', 403);
        exit;
    }

    private static function allowedForRole(string $role, string $module, PDO $pdo): bool
    {
        // Support: whitelist estricta (espejo de platformRoles.js)
        if ($role === 'support') {
            return in_array($module, [
                'support', 'support_companies', 'support_users', 'support_tickets', 'support_onboarding',
                'support_payments', 'support_contracts', 'support_moderation', 'support_audit',
                'audit', 'onboarding', 'dashboard', 'profile'
            ], true);
        }

        if (in_array($role, ['super_admin', 'admin'], true)) return true;

        if ($role === 'it_admin') {
            return in_array($module, ['dashboard', 'profile', 'equipment', 'settings', 'integrations'], true);
        }

        // Matriz dinámica si el rol tiene módulos configurados
        $matrix = self::loadMatrix($pdo, $role);
        if (!empty($matrix)) {
            return in_array($module, $matrix, true);
        }

        // Fallback espejo de platformRoles.js para roles internos
        switch ($module) {
            case 'tenants':
                return in_array($role, ['support', 'finance', 'legal', 'security'], true);
            case 'admins':
                return $role === 'security';
            case 'users':
                return in_array($role, ['security', 'legal'], true);
            case 'rbac':
            case 'settings':
                return $role === 'security';
            case 'kyb':
                return in_array($role, ['legal', 'security'], true);
            case 'freelancers':
                return $role === 'legal';
            case 'onboarding':
                return $role === 'legal';
            case 'contracts':
            case 'contracts_templates':
            case 'contracts_envelopes':
            case 'benefits':
            case 'procurement':
            case 'offboarding':
            case 'legal_entities':
                return in_array($role, ['finance', 'legal'], true);
            case 'finance':
            case 'projects':
            case 'timesheets':
            case 'payroll':
            case 'payslips':
            case 'time_off':
            case 'equipment':
            case 'reports':
            case 'nps_dashboard':
            case 'withdrawal_methods':
                return $role === 'finance';
            case 'immigration':
            case 'employee_documents':
                return $role === 'legal';
            case 'background_checks':
                return in_array($role, ['legal', 'security'], true);
            case 'audit':
                return in_array($role, ['security', 'legal'], true);
            case 'compliance':
            case 'advances':
            case 'cards':
            case 'performance':
            case 'expenses':
            case 'nps_survey':
                return true;
            case 'support':
            case 'support_companies':
            case 'support_tickets':
            case 'support_onboarding':
            case 'support_payments':
            case 'support_contracts':
            case 'support_moderation':
            case 'support_audit':
            case 'broadcasts':
                return false;
            default:
                return false;
        }
    }

    private static function loadMatrix(PDO $pdo, string $role): array
    {
        if (self::$matrix === null) {
            self::$matrix = [];
            try {
                $stmt = $pdo->query("SELECT role_key, module FROM system_role_permissions");
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    self::$matrix[$row['role_key']][] = $row['module'];
                }
            } catch (\Throwable $e) {
                self::$matrix = [];
            }
        }
        return self::$matrix[$role] ?? [];
    }

    private static function moduleForRequest(): ?string
    {
        $segments = self::requestSegments();
        $table = strtolower($segments[1] ?? '');
        if ($table === '') return null;
        $sub = strtolower($segments[2] ?? '');

        // Casos especiales por vista
        if ($table === 'users') {
            if ($sub === 'support-view') return 'support_users';
            if (($_GET['role_scope'] ?? '') === 'internal') return 'admins';
            return 'users';
        }
        if ($table === 'global-contracts' && $sub === 'support-view') return 'support_contracts';
        if ($table === 'finance' && $sub === 'support-view') return 'support_payments';
        if ($table === 'tenants' && $sub === 'support-view') return 'support_companies';

        $map = [
            'tenants' => 'tenants',
            'companies' => 'tenants',
            'roles' => 'rbac',
            'permissions' => 'rbac',
            'kyb' => 'kyb',
            'audit' => 'audit',
            'audit_logs' => 'audit',
            'system-settings' => 'settings',
            'freelancers' => 'freelancers',
            'freelancer-areas' => 'freelancers',
            'global-contract-templates' => 'contracts_templates',
            'global-contracts' => 'contracts',
            'envelopes' => 'contracts_envelopes',
            'finance' => 'finance',
            'fees' => 'finance',
            'support-tickets' => 'support',
            'moderation' => 'support_moderation',
            'compliance' => 'compliance',
            'payroll' => 'payroll',
            'projects' => 'projects',
            'timesheets' => 'timesheets',
            'procurement' => 'procurement',
            'vendors' => 'procurement',
            'requisitions' => 'procurement',
            'bank-accounts' => 'procurement',
            'time-off' => 'time_off',
            'equipment' => 'equipment',
            'employee-documents' => 'employee_documents',
            'benefits' => 'benefits',
            'immigration' => 'immigration',
            'legal-entities' => 'legal_entities',
            'onboarding' => 'onboarding',
            'background-checks' => 'background_checks',
            'cards' => 'cards',
            'advances' => 'advances',
            'performance' => 'performance',
            'analytics' => 'reports',
            'expenses' => 'expenses',
            'nps' => 'nps_dashboard',
        ];

        return $map[$table] ?? null;
    }

    private static function requestSegments(): array
    {
        $path = trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/');
        $segments = array_values(array_filter(explode('/', $path), fn($s) => $s !== ''));
        $apiIndex = array_search('api', $segments, true);
        if ($apiIndex === false) return [];
        return array_slice($segments, $apiIndex);
    }
}