import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { PLATFORM_ROLES, ROLE_LABELS, hasAccess } from '../lib/platformRoles';

// Styles
const linkClasses = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition select-none ${
    isActive
      ? 'bg-brand text-white shadow-sm shadow-brand/20'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
  }`;

const groupClasses = (isOpen, collapsed) =>
  `flex items-center rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer select-none ${
    isOpen ? 'bg-slate-50' : ''
  } ${collapsed ? 'justify-center' : 'justify-between'}`;

function NavItem({ to, icon, label, end, onClick, collapsed }) {
  if (onClick) {
    const btnBase =
      'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 select-none';
    const btnLayout = collapsed ? 'justify-center' : 'gap-3';

    return (
      <button
        onClick={onClick}
        className={`${btnBase} ${btnLayout}`}
        title={collapsed ? label : undefined}
      >
        {icon && <i className={`bi ${icon} text-lg`} />}
        {!collapsed && <span>{label}</span>}
      </button>
    );
  }

  const getLinkClasses = ({ isActive }) => {
    const base = linkClasses({ isActive });
    if (collapsed) {
      return `${base} justify-center`;
    }
    return base;
  };

  return (
    <NavLink to={to} className={getLinkClasses} end={end} title={collapsed ? label : undefined}>
      {icon && <i className={`bi ${icon} text-lg`} />}
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

function NavGroup({ icon, label, children, basePath, collapsed }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Auto-expand if current path starts with basePath
  useEffect(() => {
    if (basePath && location.pathname.startsWith(basePath)) {
      setOpen(true);
    }
  }, [location.pathname, basePath]);

  return (
    <div>
      <div
        className={groupClasses(open, collapsed)}
        onClick={() => !collapsed && setOpen(!open)}
        title={collapsed ? label : undefined}
      >
        <div className="flex items-center gap-3">
          {icon && <i className={`bi ${icon} text-lg text-slate-500`} />}
          {!collapsed && <span>{label}</span>}
        </div>
        {!collapsed && (
          <i
            className={`bi bi-chevron-down transition-transform text-xs text-slate-400 ${
              open ? 'rotate-180' : ''
            }`}
          />
        )}
      </div>
      {!collapsed && open && (
        <div className="mt-1 ml-4 space-y-1 border-l border-slate-200 pl-3">
          {children}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ user, onLogout, open = true, onClose, collapsed = false, isMobile = false }) {
  const location = useLocation();
  const role = user?.platform_role || 'user';
  const roleLabel = ROLE_LABELS[role] || 'Usuario';

  // Extract tenant ID from URL if present (fallback if user.company_id is missing)
  const match = location.pathname.match(/^\/dashboard\/tenants\/([^\/]+)/);
  const urlTenantId = match && match[1] !== 'create' && match[1] !== 'subscription' ? match[1] : null;
  
  // Determine the active company ID for the sidebar context
  const companyId = user?.company_id || urlTenantId;
  const tenantRoles = Array.isArray(user?.roles)
    ? user.roles.map((r) => (typeof r === 'string' ? r : (r?.name || r?.id || ''))).filter(Boolean)
    : [];
  const isTenantAdmin = tenantRoles.some((r) => String(r).toLowerCase() === 'admin');

  const containerClasses = isMobile
    ? `fixed top-0 left-0 z-30 h-screen w-[280px] transform ${open ? 'translate-x-0' : '-translate-x-full'} bg-white border-r border-slate-200 transition-transform duration-200`
    : `sticky top-0 flex h-screen ${collapsed ? 'w-[72px]' : 'w-[280px]'} flex-col border-r border-slate-200 bg-white transition-all duration-200`;

  return (
    <aside className={containerClasses} role="navigation" aria-label="Navegación principal">
      {/* Header */}
      <div className={`flex-none ${collapsed ? 'p-3' : 'p-5'}`}>
        <div className="text-xs text-red-500 hidden">
           Debug: {user?.email} | CID: {user?.company_id} | URL: {urlTenantId}
        </div>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/20">
            <i className="bi bi-layers-fill text-xl" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="leading-5 text-sm font-extrabold text-slate-900">Spectra</div>
              <div className="text-xs font-semibold text-slate-500">
                {roleLabel}
              </div>
            </div>
          )}
          {isMobile && onClose && (
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              aria-label="Cerrar menú"
            >
              <i className="bi bi-x-lg" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation - Scrollable */}
      <div className={`flex-1 overflow-y-auto ${collapsed ? 'px-2' : 'px-4'} pb-4`}>
        <div className="space-y-1">
          <NavItem to="/dashboard" icon="bi-grid-1x2-fill" label="Dashboard" end collapsed={collapsed} />

          {/* COMPANY_ADMIN SPECIFIC MODULES (2.1 - 2.11) */}
          {role === PLATFORM_ROLES.COMPANY_ADMIN && companyId && (
            <>
              {/* 2.1 Gestión de la empresa (Nuevo Módulo Unificado) */}
              {hasAccess(role, 'company_tenant_management') && (
                 <NavItem to="/dashboard/company-management" icon="bi-building-gear" label="Gestión Empresa" collapsed={collapsed} />
              )}

              {/* 2.2 Gestión de usuarios internos */}
              {hasAccess(role, 'company_internal_users') && (
                 <NavItem to="/dashboard/company-users" icon="bi-people" label="Usuarios Internos" collapsed={collapsed} />
              )}

              {/* 2.3 Gestión de freelancers */}
              {hasAccess(role, 'company_talent') && (
                 <NavItem to="/dashboard/company-freelancers" icon="bi-person-workspace" label="Talento / Freelancers" collapsed={collapsed} />
              )}

              {/* 2.4 Contratos - Updated to point to company-level contracts page */}
          {hasAccess(role, 'company_contracts') && (
            <NavItem to="/dashboard/company-contracts" icon="bi-file-earmark-text" label="Contratos" collapsed={collapsed} />
          )}

              {/* 2.5 Onboarding Operativo */}
              {hasAccess(role, 'company_onboarding') && (
                 <NavItem to="/dashboard/company-onboarding" icon="bi-clipboard-check" label="Onboarding Ops" collapsed={collapsed} />
              )}

              {/* 2.6 Proyectos */}
              {hasAccess(role, 'company_projects') && (
                 <NavGroup icon="bi-kanban" label="Proyectos" basePath="/dashboard/projects" collapsed={collapsed}>
                    <NavItem to="/dashboard/projects" label="Proyectos" end collapsed={collapsed} />
                    <NavItem to="/dashboard/timesheets" label="Tiempos / Entregables" collapsed={collapsed} />
                 </NavGroup>
              )}

              {/* 2.7 Procurement */}
              {hasAccess(role, 'company_procurement') && (
                 <NavGroup icon="bi-bag-check" label="Compras" basePath="/dashboard/procurement" collapsed={collapsed}>
                    <NavItem to="/dashboard/procurement/requisitions" label="Requisiciones" collapsed={collapsed} />
                    <NavItem to="/dashboard/procurement/vendors" label="Proveedores" collapsed={collapsed} />
                 </NavGroup>
              )}

              {/* 2.8 Pagos y Payroll */}
              {hasAccess(role, 'company_payroll') && (
                 <NavGroup icon="bi-cash-stack" label="Pagos y Nómina" basePath="/dashboard/payroll" collapsed={collapsed}>
                    <NavItem to="/dashboard/payroll" label="Nómina" collapsed={collapsed} />
                    <NavItem to="/dashboard/billing/payments" label="Billetera / Pagos" collapsed={collapsed} />
                    <NavItem to="/dashboard/net-salary" icon="bi-calculator" label="Calculadora de sueldo" collapsed={collapsed} />
                 </NavGroup>
              )}

              {/* 2.9 Facturación */}
              {hasAccess(role, 'company_billing') && (
                 <NavItem to="/dashboard/billing/invoices" icon="bi-receipt" label="Facturación" collapsed={collapsed} />
              )}

              {/* 2.10 Reportes */}
              {hasAccess(role, 'company_reports') && (
                 <NavItem to="/dashboard/company-reports" icon="bi-bar-chart" label="Reportes" collapsed={collapsed} />
              )}

              {/* 2.11 Auditoría */}
              {hasAccess(role, 'company_audit') && (
                 <NavItem to="/dashboard/company-audit" icon="bi-shield-check" label="Auditoría" collapsed={collapsed} />
              )}
            </>
          )}

          {companyId && role !== PLATFORM_ROLES.SUPER_ADMIN && role !== PLATFORM_ROLES.SUPPORT && role !== PLATFORM_ROLES.COMPANY_ADMIN && (
            <>
              <NavGroup icon="bi-building-gear" label="Gestión Corporativa" basePath={`/dashboard/tenants/${companyId}`} collapsed={collapsed}>
                <NavItem to={`/dashboard/tenants/${companyId}`} label="Resumen General" end collapsed={collapsed} />
                <NavItem to={`/dashboard/tenants/${companyId}/settings`} label="Configuración" collapsed={collapsed} />
                <NavItem to={`/dashboard/tenants/${companyId}/roles`} label="Roles y Permisos" collapsed={collapsed} />
                <NavItem to={`/dashboard/tenants/${companyId}/kyb`} label="Validación (KYB)" collapsed={collapsed} />
              </NavGroup>

              {role !== PLATFORM_ROLES.SUPER_ADMIN && role !== PLATFORM_ROLES.SUPPORT && (
                <NavGroup icon="bi-briefcase" label="Operaciones" basePath={`/dashboard/tenants/${companyId}`} collapsed={collapsed}>
                  <NavItem to={`/dashboard/tenants/${companyId}/contracts`} label="Contratos" collapsed={collapsed} />
                  <NavItem to={`/dashboard/tenants/${companyId}/members`} label="Equipo / Miembros" collapsed={collapsed} />
                  <NavItem to={`/dashboard/tenants/${companyId}/projects`} label="Proyectos" collapsed={collapsed} />
                  <NavItem to={`/dashboard/tenants/${companyId}/payroll`} label="Nómina" collapsed={collapsed} />
                  <NavItem to={`/dashboard/tenants/${companyId}/wallet`} label="Billetera / Finanzas" collapsed={collapsed} />
                </NavGroup>
              )}
            </>
          )}

          {hasAccess(role, 'tenants') && role !== PLATFORM_ROLES.SUPPORT && (!user?.company_id || role === PLATFORM_ROLES.SUPER_ADMIN) && (
            <NavGroup icon="bi-building" label="Empresas" basePath="/dashboard/tenants" collapsed={collapsed}>
              <NavItem to="/dashboard/tenants" label="Lista de empresas" end collapsed={collapsed} />
              <NavItem to="/dashboard/tenants/create" label="Crear empresa" collapsed={collapsed} />
              <NavItem to="/dashboard/tenants/subscription" label="Contratos por empresa" collapsed={collapsed} />
              {hasAccess(role, 'admins') && (
                <NavItem to="/dashboard/admins/company-admins" label="Company Admins por empresa" collapsed={collapsed} />
              )}
            </NavGroup>
          )}

          {hasAccess(role, 'admins') && (
            <NavGroup icon="bi-people-fill" label="Usuarios de Plataforma" basePath="/dashboard/admins" collapsed={collapsed}>
              <NavItem to="/dashboard/admins" label="Usuarios (internos)" collapsed={collapsed} />
              <NavItem to="/dashboard/rbac/roles" label="Roles de plataforma" collapsed={collapsed} />
              <NavItem to="/dashboard/security/sessions" label="Sesiones y seguridad" collapsed={collapsed} />
            </NavGroup>
          )}

          {hasAccess(role, 'kyb') && (
            <NavItem to="/dashboard/kyb" icon="bi-shield-lock" label="Solicitudes KYB" collapsed={collapsed} />
          )}

          {/* FREELANCER SPECIFIC MODULES */}
          {(role === PLATFORM_ROLES.FREELANCER || role === 'freelance') && (
             <>
               <NavItem to="/dashboard/profile" icon="bi-person-badge" label="Mi Perfil" collapsed={collapsed} />
               <NavItem to="/dashboard/projects" icon="bi-kanban" label="Mis Proyectos" collapsed={collapsed} />
               <NavItem to="/dashboard/payment-settings" icon="bi-credit-card" label="Datos de Pago" collapsed={collapsed} />
               <NavItem to="/dashboard/net-salary" icon="bi-calculator" label="Calculadora de sueldo" collapsed={collapsed} />
             </>
          )}

          {(isTenantAdmin && role !== PLATFORM_ROLES.COMPANY_ADMIN) && (
            <NavItem to="/dashboard/net-salary" icon="bi-calculator" label="Calculadora de sueldo" collapsed={collapsed} />
          )}

          {hasAccess(role, 'freelancers') && role !== PLATFORM_ROLES.COMPANY_ADMIN && (
            <NavGroup icon="bi-briefcase" label="Freelancers" basePath="/dashboard/freelancers" collapsed={collapsed}>
              <NavItem to="/dashboard/freelancers" label="Directorio" end collapsed={collapsed} />
              <NavItem to="/dashboard/onboarding/admin" label="Progreso Onboarding" collapsed={collapsed} />
              <NavItem to="/dashboard/offboarding/admin" label="Progreso Offboarding" collapsed={collapsed} />
              <NavItem to="/dashboard/freelancers/reviews" label="Revisiones y bloqueos" collapsed={collapsed} />
            </NavGroup>
          )}

          {hasAccess(role, 'contracts') && role !== PLATFORM_ROLES.COMPANY_ADMIN && role !== PLATFORM_ROLES.FREELANCER && (
            <NavGroup icon="bi-file-earmark-text" label="Contratos" basePath="/dashboard/contracts" collapsed={collapsed}>
              <NavItem to="/dashboard/contracts/templates" label="Plantillas (globales)" collapsed={collapsed} />
              <NavItem to="/dashboard/contracts" label="Contratos (visor global)" end collapsed={collapsed} />
              <NavItem to="/dashboard/contracts/envelopes" label="Firmas / Sobres" collapsed={collapsed} />
            </NavGroup>
          )}

          {hasAccess(role, 'finance') && role !== PLATFORM_ROLES.COMPANY_ADMIN && (
            <NavGroup icon="bi-cash-stack" label="Finanzas" basePath="/dashboard/finance" collapsed={collapsed}>
              <NavItem to="/dashboard/finance/invoices" label="Facturación / Invoices" collapsed={collapsed} />
              <NavItem to="/dashboard/finance/wallet" label="Wallet / Ledger" collapsed={collapsed} />
              <NavItem to="/dashboard/finance/reconciliation" label="Conciliación / Ajustes" collapsed={collapsed} />
            </NavGroup>
          )}

          {hasAccess(role, 'projects') && role !== PLATFORM_ROLES.COMPANY_ADMIN && role !== PLATFORM_ROLES.FREELANCER && (
            <NavItem to="/dashboard/projects" icon="bi-kanban" label="Proyectos" collapsed={collapsed} />
          )}

          {hasAccess(role, 'org_chart') && role !== PLATFORM_ROLES.COMPANY_ADMIN && (
            <NavItem to="/dashboard/org-chart" icon="bi-diagram-3" label="Organigrama" collapsed={collapsed} />
          )}

          {hasAccess(role, 'timesheets') && role !== PLATFORM_ROLES.COMPANY_ADMIN && (
            <NavItem to="/dashboard/timesheets" icon="bi-clock-history" label="Hojas de Tiempo" collapsed={collapsed} />
          )}

          {hasAccess(role, 'procurement') && role !== PLATFORM_ROLES.COMPANY_ADMIN && (
            <NavGroup icon="bi-bag-check" label="Compras" basePath="/dashboard/procurement" collapsed={collapsed}>
              <NavItem to="/dashboard/procurement/vendors" label="Proveedores" collapsed={collapsed} />
              <NavItem to="/dashboard/procurement/requisitions" label="Requisiciones" collapsed={collapsed} />
            </NavGroup>
          )}

          {hasAccess(role, 'support') && (
            <>
              <div className="mt-4 mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {!collapsed ? 'Soporte' : ''}
              </div>
              <NavItem to="/dashboard/support/tickets" icon="bi-ticket-perforated" label="Tickets" collapsed={collapsed} />
              <NavItem to="/dashboard/support/chat-inbox" icon="bi-chat-dots" label="Chat / Inbox" collapsed={collapsed} />
              <NavItem to="/dashboard/support/kb" icon="bi-book" label="Base de conocimiento" collapsed={collapsed} />
              <NavItem to="/dashboard/support/empresas" icon="bi-building" label="Vista de Empresas" collapsed={collapsed} />
              <NavItem to="/dashboard/support/users" icon="bi-people" label="Vista de Usuarios" collapsed={collapsed} />
              <NavItem to="/dashboard/support/onboarding" icon="bi-person-badge" label="Onboarding" collapsed={collapsed} />
              <NavItem to="/dashboard/support/payments" icon="bi-credit-card-2-front" label="Incidencias Pagos" collapsed={collapsed} />
              <NavItem to="/dashboard/support/contracts" icon="bi-file-text" label="Visor Contratos" collapsed={collapsed} />
              <NavItem to="/dashboard/support/moderation" icon="bi-shield-exclamation" label="Moderación" collapsed={collapsed} />
              <NavItem to="/dashboard/support/audit" icon="bi-clipboard-check" label="Auditoría" collapsed={collapsed} />
            </>
          )}

          {hasAccess(role, 'audit') && role !== PLATFORM_ROLES.COMPANY_ADMIN && (
            <NavItem to="/dashboard/audit" icon="bi-shield-check" label="Auditoría" collapsed={collapsed} />
          )}

          {hasAccess(role, 'settings') && (
            <NavGroup icon="bi-gear-fill" label="Configuración" basePath="/dashboard/settings" collapsed={collapsed}>
              <NavItem to="/dashboard/settings/countries" label="Países y Fiscalidad" collapsed={collapsed} />
              <NavItem to="/dashboard/settings/currencies" label="Monedas" collapsed={collapsed} />
              <NavItem to="/dashboard/rbac/permissions" label="Permisos (catálogo)" collapsed={collapsed} />
              <NavItem to="/dashboard/settings/auth" label="Autenticación (SSO)" collapsed={collapsed} />
              <NavItem to="/dashboard/settings/smtp" label="Servidor de Correo (SMTP)" collapsed={collapsed} />
              <NavItem to="/dashboard/settings/notifications" label="Notificaciones" collapsed={collapsed} />
            </NavGroup>
          )}

          {hasAccess(role, 'compliance') && (
            <NavGroup icon="bi-shield-check" label="Compliance" basePath="/dashboard/compliance" collapsed={collapsed}>
               <NavItem to="/dashboard/compliance" label="Requisitos y Documentos" end collapsed={collapsed} />
               <NavItem to="/dashboard/compliance/tax-forms" label="Formularios Fiscales" collapsed={collapsed} />
            </NavGroup>
          )}

          {hasAccess(role, 'profile') && (
            <>
              <div className="my-4 border-t border-slate-100" />

              <NavGroup icon="bi-person-circle" label="Perfil / Seguridad" basePath="/dashboard/profile" collapsed={collapsed}>
                <NavItem to="/dashboard/profile" label="Mi cuenta" end collapsed={collapsed} />
                {role !== PLATFORM_ROLES.SUPPORT && role !== PLATFORM_ROLES.COMPANY_ADMIN && role !== PLATFORM_ROLES.SUPER_ADMIN && (
                  <NavItem to="/dashboard/profile/withdrawal-methods" label="Métodos de Retiro" collapsed={collapsed} />
                )}
                <NavItem onClick={onLogout} label="Cerrar sesión" collapsed={collapsed} />
              </NavGroup>
            </>
          )}

          {!hasAccess(role, 'profile') && (
              <div className="mt-auto pt-4">
                  <NavItem onClick={onLogout} icon="bi-box-arrow-right" label="Cerrar sesión" collapsed={collapsed} />
              </div>
          )}
        </div>
      </div>

      {/* Footer User Info */}
      <div className={`flex-none border-t border-slate-200 bg-slate-50/50 ${collapsed ? 'p-3' : 'p-4'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-200 text-slate-600 font-bold text-xs">
            {String(user?.full_name || 'U').charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-slate-900">
                {user?.full_name || 'Usuario'}
              </div>
              <div className="truncate text-xs text-slate-500">
                {user?.email}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
