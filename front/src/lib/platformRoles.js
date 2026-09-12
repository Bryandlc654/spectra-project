export const PLATFORM_ROLES = {
  SUPER_ADMIN: 'super_admin',
  SUPPORT: 'support', // Customer Success
  FINANCE: 'finance', // Finance Ops
  LEGAL: 'legal', // Legal Ops / Compliance
  SECURITY: 'security', // Security / Risk
  COMPANY_ADMIN: 'company_admin',
  IT_ADMIN: 'it_admin',
  FREELANCER: 'freelancer',
  USER: 'user',
  ADMIN: 'admin' // Legacy
};

export const ROLE_LABELS = {
  [PLATFORM_ROLES.SUPER_ADMIN]: 'Super Admin',
  [PLATFORM_ROLES.SUPPORT]: 'Support / Customer Success',
  [PLATFORM_ROLES.FINANCE]: 'Finance Ops',
  [PLATFORM_ROLES.LEGAL]: 'Legal Ops / Compliance',
  [PLATFORM_ROLES.SECURITY]: 'Security / Risk (Seguridad)',
  [PLATFORM_ROLES.COMPANY_ADMIN]: 'Admin Empresa',
  [PLATFORM_ROLES.IT_ADMIN]: 'IT Admin',
  [PLATFORM_ROLES.FREELANCER]: 'Freelance',
  [PLATFORM_ROLES.USER]: 'Usuario',
  [PLATFORM_ROLES.ADMIN]: 'Admin'
};

// Store dynamic permissions in memory
let DYNAMIC_PERMISSIONS = null;

/**
 * Initialize dynamic permissions from backend
 * @param {Object} permissionsMap - Object mapping role keys to array of allowed modules
 */
export function setDynamicPermissions(permissionsMap) {
  DYNAMIC_PERMISSIONS = permissionsMap;
}

export function hasAccess(role, section, tenantRoles = []) {
  // Explicitly deny 'onboarding' (doing it) for SUPER_ADMIN, as they don't need to be onboarded
  if (role === PLATFORM_ROLES.SUPER_ADMIN && section === 'onboarding') return false;

  // Explicitly deny 'support' section for SUPER_ADMIN as per requirements
  if (role === PLATFORM_ROLES.SUPER_ADMIN && section === 'support') return false;

  // Explicitly deny 'projects', 'org_chart', 'timesheets', 'withdrawal_methods' for SUPER_ADMIN as they are for other roles
  if (role === PLATFORM_ROLES.SUPER_ADMIN && ['projects', 'org_chart', 'timesheets', 'withdrawal_methods'].includes(section)) return false;

  // STRICT RULE: Support role solo tiene acceso a 'support' y básico (dashboard/profile)
  if (role === PLATFORM_ROLES.SUPPORT) {
    return [
      'support', 
      'dashboard', 
      'profile',
      'support_companies',
      'support_tickets',
      'support_users',
      'support_onboarding',
      'support_payments',
      'support_contracts',
      'support_moderation',
      'support_audit'
    ].includes(section);
  }

  if (role === PLATFORM_ROLES.SUPER_ADMIN || role === PLATFORM_ROLES.ADMIN) return true;

  // If dynamic permissions are loaded, use them
  if (DYNAMIC_PERMISSIONS && DYNAMIC_PERMISSIONS[role]) {
      if (role === PLATFORM_ROLES.COMPANY_ADMIN && (section === 'company_tenant_management' || section === 'company_payroll')) return true;
      
      return DYNAMIC_PERMISSIONS[role].includes(section);
  }

  // Tenant Finance Admin Role (from Backend 'Finance' role)
  if (tenantRoles && Array.isArray(tenantRoles)) {
      if (tenantRoles.includes('Finance')) {
        const financeAllowed = [
            'dashboard', 'profile', 
            'finance', 'payroll', 'reports', 
            'documents', 'time_off', 'expenses', 'team', 
            'procurement', 'projects', 'timesheets', 
            'benefits', 'payslips'
        ];
        if (financeAllowed.includes(section)) return true;
      }

      // Tenant Bookkeeper / Viewer Role (from Backend 'Viewer' role)
      if (tenantRoles.includes('Viewer')) {
          const viewerAllowed = [
              'dashboard', 'profile', 
              'finance', 'payroll', 'reports', 
              'documents', 'time_off', 'expenses', 
              'procurement', 'projects', 'timesheets', 
              'benefits', 'payslips', 'contracts', 'org_chart'
          ];
          if (viewerAllowed.includes(section)) return true;
      }

      // Tenant Admin: acceso a módulos operativos clave
      if (tenantRoles.includes('Admin')) {
          const adminAllowed = [
              'dashboard', 'profile',
              'finance', 'payroll', 'reports',
              'documents', 'projects', 'timesheets',
              'benefits', 'payslips',
              // Permitir acceso a calculadora de sueldo (ruta usa sección 'freelancer')
              'freelancer'
          ];
          if (adminAllowed.includes(section)) return true;
      }
  }

  // Restricted roles (Company Admin, Freelancer, User) -> Only Dashboard & Profile & specific modules
  if ([PLATFORM_ROLES.COMPANY_ADMIN, PLATFORM_ROLES.USER, PLATFORM_ROLES.IT_ADMIN].includes(role)) {
    
    // COMPANY_ADMIN: New modular structure (2.1 - 2.11)
    if (role === PLATFORM_ROLES.COMPANY_ADMIN) {
        const companyPermissions = [
            'dashboard', 
            'profile',
            'company_tenant_management', // 2.1
            'company_internal_users',    // 2.2
            'company_talent',            // 2.3
            'company_contracts',         // 2.4
            'company_onboarding',        // 2.5
            'company_projects',          // 2.6
            'company_procurement',       // 2.7
            'company_payroll',           // 2.8
            'company_billing',           // 2.9
            'company_reports',           // 2.10
            'company_audit'              // 2.11
        ];

        if (companyPermissions.includes(section)) return true;

        // Map legacy sections to new permissions for App.jsx compatibility
        const mappings = {
            'tenants': 'company_tenant_management',
            'users': 'company_internal_users',
            'freelancers': 'company_talent',
            'contracts': 'company_contracts',
            'projects': 'company_projects',
            'timesheets': 'company_projects',
            'procurement': 'company_procurement',
            'finance': 'company_billing', // Allows access to /dashboard/finance routes (invoices)
            'payroll': 'company_payroll',
            'audit': 'company_audit',
            'reports': 'company_reports'
        };

        if (mappings[section] && companyPermissions.includes(mappings[section])) return true;
        
        return false;
    }

    const allowed = ['dashboard', 'profile', 'onboarding', 'offboarding', 'org_chart', 'payroll', 'contracts', 'documents', 'time_off', 'expenses', 'compliance', 'team', 'projects', 'timesheets', 'procurement', 'nps_survey', 'tenants'];
    // if (role === PLATFORM_ROLES.COMPANY_ADMIN) {
    //   allowed.push('offboarding_admin');
    //   allowed.push('nps_dashboard');
    // }
    
    // IT Admin permissions
    if (role === PLATFORM_ROLES.IT_ADMIN) {
        return ['dashboard', 'profile', 'equipment', 'settings', 'integrations'].includes(section);
    }

    return allowed.includes(section);
  }

  if (role === PLATFORM_ROLES.FREELANCER || role === 'freelance') {
    return ['dashboard', 'onboarding', 'offboarding', 'org_chart', 'expenses', 'compliance', 'freelancer_projects', 'freelancer'].includes(section);
  }

  // Always allow basic access for internal roles
  if (section === 'dashboard' || section === 'profile') return true;

  // Fallback to hardcoded Internal Platform Roles
  switch (section) {

    case 'tenants': // Empresas
      return [PLATFORM_ROLES.SUPPORT, PLATFORM_ROLES.FINANCE, PLATFORM_ROLES.LEGAL, PLATFORM_ROLES.SECURITY].includes(role);

    case 'admins': // Usuarios de Plataforma
      return [PLATFORM_ROLES.SECURITY].includes(role);

    case 'users': // Usuarios Globales (company users)
      return [PLATFORM_ROLES.SECURITY, PLATFORM_ROLES.LEGAL].includes(role);

    case 'rbac': // Roles y Permisos
      return [PLATFORM_ROLES.SECURITY].includes(role);

    case 'kyb': // KYB / Compliance
      return [PLATFORM_ROLES.LEGAL, PLATFORM_ROLES.SECURITY].includes(role);

    case 'freelancers': // Freelancers Directory
      return [PLATFORM_ROLES.LEGAL].includes(role);

    case 'contracts': // Contratos
      return [PLATFORM_ROLES.LEGAL, PLATFORM_ROLES.FINANCE].includes(role);
    
    case 'contracts_templates':
      return [PLATFORM_ROLES.LEGAL, PLATFORM_ROLES.FINANCE].includes(role);
    
    case 'contracts_envelopes':
      return [PLATFORM_ROLES.LEGAL, PLATFORM_ROLES.FINANCE].includes(role);

    case 'finance': // Finanzas
      return [PLATFORM_ROLES.FINANCE].includes(role);

    case 'projects':
      return [PLATFORM_ROLES.FINANCE].includes(role);

    case 'timesheets':
      return [PLATFORM_ROLES.FINANCE].includes(role);

    case 'procurement':
      return [PLATFORM_ROLES.FINANCE, PLATFORM_ROLES.LEGAL].includes(role);

    case 'benefits':
      return [PLATFORM_ROLES.FINANCE, PLATFORM_ROLES.LEGAL].includes(role);

    case 'payroll':
      return [PLATFORM_ROLES.FINANCE, PLATFORM_ROLES.COMPANY_ADMIN].includes(role);

    case 'payslips':
      return [PLATFORM_ROLES.FINANCE, PLATFORM_ROLES.COMPANY_ADMIN, PLATFORM_ROLES.USER, PLATFORM_ROLES.FREELANCER].includes(role);

    case 'immigration':
      return [PLATFORM_ROLES.LEGAL].includes(role);

    case 'background_checks':
      return [PLATFORM_ROLES.LEGAL, PLATFORM_ROLES.SECURITY].includes(role);

    case 'offboarding_admin':
      return [PLATFORM_ROLES.LEGAL].includes(role);

    case 'time_off':
      return [PLATFORM_ROLES.FINANCE, PLATFORM_ROLES.COMPANY_ADMIN].includes(role);

    case 'equipment':
      return [PLATFORM_ROLES.FINANCE].includes(role);

    case 'employee_documents':
        return [PLATFORM_ROLES.LEGAL, PLATFORM_ROLES.COMPANY_ADMIN].includes(role);

      case 'onboarding':
      return [PLATFORM_ROLES.LEGAL].includes(role);

    case 'onboarding_admin':
      return [PLATFORM_ROLES.LEGAL].includes(role);

    case 'offboarding':
        return [PLATFORM_ROLES.LEGAL, PLATFORM_ROLES.FINANCE].includes(role);

    case 'compliance':
        // Available to everyone essentially, but maybe restricted view?
        // Everyone needs to see their compliance
        return true;

      case 'advances':
      case 'cards':
        // Available to everyone, but admin/finance have more power
        return true;

    case 'performance':
    case 'expenses':
        // Available to everyone
        return true;

    case 'withdrawal_methods':
        return [PLATFORM_ROLES.FINANCE, PLATFORM_ROLES.FREELANCER, PLATFORM_ROLES.USER].includes(role);

    case 'legal_entities':
      return [PLATFORM_ROLES.LEGAL, PLATFORM_ROLES.FINANCE].includes(role);

    case 'reports':
      return [PLATFORM_ROLES.FINANCE, PLATFORM_ROLES.COMPANY_ADMIN].includes(role);

    case 'support': // Soporte
      return false;

    case 'audit': // Auditoría
      return [PLATFORM_ROLES.SECURITY, PLATFORM_ROLES.LEGAL].includes(role);

    case 'settings': // Configuración
      return [PLATFORM_ROLES.SECURITY].includes(role); // Maybe Finance needs currencies? For now restrict to Security.

    case 'broadcasts':
      return false;

    case 'nps_dashboard':
        return [PLATFORM_ROLES.FINANCE].includes(role);

    case 'nps_survey':
        return true;

    default:
      return false;
  }
}
