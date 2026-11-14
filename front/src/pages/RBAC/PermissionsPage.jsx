import React, { useMemo, useState } from 'react';
import RBACTabs from './RBACTabs';

// Definición estática de los permisos/módulos del sistema
export const SYSTEM_PERMISSIONS = [
  {
    id: 'tenants',
    name: 'Empresas',
    module: 'Core',
    description: 'Gestión del ciclo de vida de empresas, onboarding, validación y configuración de cuentas empresariales.'
  },
  {
    id: 'admins',
    name: 'Usuarios de Plataforma',
    module: 'Seguridad',
    description: 'Gestión de administradores internos (staff), asignación de roles y control de acceso al panel administrativo.'
  },
  {
    id: 'users',
    name: 'Usuarios Globales',
    module: 'Gestión',
    description: 'Visualización y gestión centralizada de todos los usuarios finales pertenecientes a las empresas clientes.'
  },
  {
    id: 'rbac',
    name: 'Roles y Permisos',
    module: 'Seguridad',
    description: 'Configuración de la matriz de acceso, definición de roles del sistema y auditoría de permisos.'
  },
  {
    id: 'kyb',
    name: 'KYB / Compliance',
    module: 'Compliance',
    description: 'Procesos de Know Your Business, verificación de identidad corporativa, listas negras y cumplimiento normativo.'
  },
  {
    id: 'freelancers',
    name: 'Freelancers',
    module: 'Gestión',
    description: 'Directorio de talento independiente, verificación de perfiles y gestión de la red de freelancers.'
  },
  {
    id: 'contracts',
    name: 'Contratos',
    module: 'Legal',
    description: 'Administración de plantillas de contratos, generación de documentos legales y seguimiento de firmas.'
  },
  {
    id: 'finance',
    name: 'Finanzas',
    module: 'Finanzas',
    description: 'Panel financiero global, facturación a clientes, conciliación de pagos y reportes de ingresos.'
  },
  {
    id: 'support',
    name: 'Soporte',
    module: 'Soporte',
    description: 'Sistema de tickets de ayuda, gestión de incidencias técnicas y atención al cliente.'
  },
  {
    id: 'audit',
    name: 'Auditoría',
    module: 'Seguridad',
    description: 'Registro inmutable de actividades (logs), historial de cambios críticos y trazabilidad de acciones.'
  },
  {
    id: 'settings',
    name: 'Configuración',
    module: 'Core',
    description: 'Ajustes globales de la plataforma, gestión de monedas, idiomas, integraciones y parámetros del sistema.'
  },
  {
    id: 'broadcasts',
    name: 'Comunicados',
    module: 'Comunicación',
    description: 'Herramienta para el envío de notificaciones masivas, alertas de mantenimiento y novedades a los usuarios.'
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    module: 'Core',
    description: 'Panel principal con resumen de actividad y accesos rápidos.'
  },
  {
    id: 'profile',
    name: 'Mi Perfil',
    module: 'Core',
    description: 'Datos personales, seguridad de la cuenta y preferencias.'
  },
  {
    id: 'integrations',
    name: 'Integraciones',
    module: 'Core',
    description: 'Conexiones con servicios externos y configuración de APIs.'
  },
  {
    id: 'company_tenant_management',
    name: 'Gestión de Empresa',
    module: 'Empresa',
    description: 'Datos generales, configuración y estado de la empresa.'
  },
  {
    id: 'company_internal_users',
    name: 'Usuarios Internos',
    module: 'Empresa',
    description: 'Empleados y usuarios internos de la empresa.'
  },
  {
    id: 'company_talent',
    name: 'Talento / Freelancers',
    module: 'Empresa',
    description: 'Freelancers vinculados a la empresa y su gestión.'
  },
  {
    id: 'company_contracts',
    name: 'Contratos de Empresa',
    module: 'Empresa',
    description: 'Contratos de la empresa y seguimiento de firmas.'
  },
  {
    id: 'company_onboarding',
    name: 'Onboarding Operativo',
    module: 'Empresa',
    description: 'Procesos de incorporación operativa de la empresa.'
  },
  {
    id: 'company_projects',
    name: 'Proyectos de Empresa',
    module: 'Empresa',
    description: 'Proyectos, entregables y registro de tiempos.'
  },
  {
    id: 'company_procurement',
    name: 'Compras de Empresa',
    module: 'Empresa',
    description: 'Requisiciones y proveedores de la empresa.'
  },
  {
    id: 'company_payroll',
    name: 'Pagos y Nómina',
    module: 'Empresa',
    description: 'Nómina, pagos, billetera y adelantos de sueldo.'
  },
  {
    id: 'company_billing',
    name: 'Facturación de Empresa',
    module: 'Empresa',
    description: 'Facturas, cobros y documentos de facturación.'
  },
  {
    id: 'company_reports',
    name: 'Reportes de Empresa',
    module: 'Empresa',
    description: 'Reportes operativos y financieros de la empresa.'
  },
  {
    id: 'company_audit',
    name: 'Auditoría de Empresa',
    module: 'Empresa',
    description: 'Historial de acciones y trazabilidad de la empresa.'
  },
  {
    id: 'payroll',
    name: 'Nómina',
    module: 'Empresa',
    description: 'Ejecución de nómina, planillas y deducciones.'
  },
  {
    id: 'payslips',
    name: 'Recibos de Nómina',
    module: 'Empleado',
    description: 'Consulta de recibos y boletas de pago.'
  },
  {
    id: 'benefits',
    name: 'Beneficios',
    module: 'Empleado',
    description: 'Planes de beneficios y cobertura del empleado.'
  },
  {
    id: 'documents',
    name: 'Documentos',
    module: 'Empleado',
    description: 'Documentos personales y laborales del empleado.'
  },
  {
    id: 'employee_documents',
    name: 'Documentos de Empleado',
    module: 'Empresa',
    description: 'Gestión documental de los empleados de la empresa.'
  },
  {
    id: 'time_off',
    name: 'Permisos y Vacaciones',
    module: 'Empleado',
    description: 'Solicitudes de vacaciones, permisos y ausencias.'
  },
  {
    id: 'expenses',
    name: 'Gastos',
    module: 'Empleado',
    description: 'Registro, aprobación y reembolso de gastos.'
  },
  {
    id: 'team',
    name: 'Equipo',
    module: 'Empresa',
    description: 'Miembros del equipo, asignaciones y jerarquía directa.'
  },
  {
    id: 'projects',
    name: 'Proyectos',
    module: 'Empresa',
    description: 'Proyectos y seguimiento de tareas y entregables.'
  },
  {
    id: 'timesheets',
    name: 'Hojas de Tiempo',
    module: 'Empresa',
    description: 'Registro de horas trabajadas y entregables.'
  },
  {
    id: 'procurement',
    name: 'Compras',
    module: 'Empresa',
    description: 'Requisiciones, proveedores y órdenes de compra.'
  },
  {
    id: 'reports',
    name: 'Reportes',
    module: 'Empresa',
    description: 'Reportes operativos y financieros.'
  },
  {
    id: 'org_chart',
    name: 'Organigrama',
    module: 'Empresa',
    description: 'Estructura organizacional y relaciones del equipo.'
  },
  {
    id: 'compliance',
    name: 'Compliance',
    module: 'Empleado',
    description: 'Requisitos, documentos y formularios fiscales.'
  },
  {
    id: 'onboarding',
    name: 'Onboarding',
    module: 'Empleado',
    description: 'Proceso de incorporación del empleado.'
  },
  {
    id: 'onboarding_admin',
    name: 'Onboarding (Admin)',
    module: 'Empresa',
    description: 'Seguimiento de las incorporaciones del equipo.'
  },
  {
    id: 'offboarding',
    name: 'Offboarding',
    module: 'Empleado',
    description: 'Proceso de salida del empleado.'
  },
  {
    id: 'offboarding_admin',
    name: 'Offboarding (Admin)',
    module: 'Empresa',
    description: 'Seguimiento de las salidas del equipo.'
  },
  {
    id: 'performance',
    name: 'Desempeño',
    module: 'Empresa',
    description: 'Evaluaciones de desempeño y objetivos.'
  },
  {
    id: 'advances',
    name: 'Adelantos de Sueldo',
    module: 'Empleado',
    description: 'Solicitudes y gestión de adelantos de sueldo.'
  },
  {
    id: 'cards',
    name: 'Tarjetas',
    module: 'Empleado',
    description: 'Tarjetas corporativas y control de consumos.'
  },
  {
    id: 'withdrawal_methods',
    name: 'Métodos de Retiro',
    module: 'Empleado',
    description: 'Cuentas bancarias y métodos de pago del usuario.'
  },
  {
    id: 'equipment',
    name: 'Equipos',
    module: 'Empresa',
    description: 'Asignación de equipos y activos de la empresa.'
  },
  {
    id: 'legal_entities',
    name: 'Entidades Legales',
    module: 'Legal',
    description: 'Personas jurídicas y datos fiscales de la empresa.'
  },
  {
    id: 'immigration',
    name: 'Migración',
    module: 'Legal',
    description: 'Trámites migratorios, visados y documentación.'
  },
  {
    id: 'background_checks',
    name: 'Background Checks',
    module: 'Legal',
    description: 'Verificaciones de antecedentes y estudios de seguridad.'
  },
  {
    id: 'contracts_templates',
    name: 'Plantillas de Contratos',
    module: 'Legal',
    description: 'Plantillas globales para la generación de contratos.'
  },
  {
    id: 'contracts_envelopes',
    name: 'Firmas / Sobres',
    module: 'Legal',
    description: 'Envío, firma y seguimiento de documentos contractuales.'
  },
  {
    id: 'freelancer',
    name: 'Área Freelancer',
    module: 'Freelancer',
    description: 'Proyectos, pagos y perfil del freelancer.'
  },
  {
    id: 'freelancer_projects',
    name: 'Proyectos Freelancer',
    module: 'Freelancer',
    description: 'Proyectos y entregables asignados al freelancer.'
  },
  {
    id: 'nps_survey',
    name: 'Encuesta NPS',
    module: 'Empleado',
    description: 'Encuestas de satisfacción y clima laboral.'
  },
  {
    id: 'nps_dashboard',
    name: 'Dashboard NPS',
    module: 'Empresa',
    description: 'Resultados y métricas de satisfacción del equipo.'
  },
  {
    id: 'support_tickets',
    name: 'Tickets de Soporte',
    module: 'Soporte',
    description: 'Gestión de tickets e incidencias de soporte.'
  },
  {
    id: 'support_companies',
    name: 'Vista de Empresas (Soporte)',
    module: 'Soporte',
    description: 'Consulta de empresas en modo solo lectura.'
  },
  {
    id: 'support_users',
    name: 'Vista de Usuarios (Soporte)',
    module: 'Soporte',
    description: 'Consulta de usuarios en modo solo lectura.'
  },
  {
    id: 'support_onboarding',
    name: 'Onboarding (Soporte)',
    module: 'Soporte',
    description: 'Seguimiento de incorporaciones desde soporte.'
  },
  {
    id: 'support_payments',
    name: 'Incidencias de Pagos',
    module: 'Soporte',
    description: 'Consulta y gestión de incidencias de pagos.'
  },
  {
    id: 'support_contracts',
    name: 'Visor de Contratos (Soporte)',
    module: 'Soporte',
    description: 'Consulta de contratos desde soporte.'
  },
  {
    id: 'support_moderation',
    name: 'Moderación',
    module: 'Soporte',
    description: 'Moderación de cuentas y contenido reportado.'
  },
  {
    id: 'support_audit',
    name: 'Auditoría (Soporte)',
    module: 'Soporte',
    description: 'Historial de acciones visible para soporte.'
  }
];

export default function PermissionsPage() {
  const [search, setSearch] = useState('');

  // Agrupación y filtrado
  const filtered = useMemo(() => {
    if (!search.trim()) return SYSTEM_PERMISSIONS;
    const s = search.toLowerCase();
    return SYSTEM_PERMISSIONS.filter(p => 
      p.name?.toLowerCase().includes(s) || 
      p.description?.toLowerCase().includes(s) ||
      p.module?.toLowerCase().includes(s)
    );
  }, [search]);

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(p => {
      const moduleName = p.module || 'General';
      if (!groups[moduleName]) groups[moduleName] = [];
      groups[moduleName].push(p);
    });
    return groups;
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Seguridad</div>
        <h1 className="text-xl font-bold">Catálogo de Permisos</h1>
        <p className="text-sm text-slate-600">Definición de módulos y capacidades de acceso en la plataforma.</p>
      </div>

      <RBACTabs />

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="w-full max-w-md">
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Buscar Permiso / Módulo</label>
            <div className="relative">
                <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input aria-label="Buscar Permiso / Módulo" 
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Ej: finanzas, legal, usuarios..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                />
            </div>
          </div>
        </div>
        
        {Object.keys(grouped).length === 0 && (
          <div className="py-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-400 mb-3">
                <i className="bi bi-shield-x text-xl"></i>
            </div>
            <p className="text-slate-500 font-medium">No se encontraron permisos</p>
            <p className="text-slate-400 text-sm">Intenta con otros términos de búsqueda.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(grouped).map(([moduleName, items]) => (
            <div key={moduleName} className="flex flex-col gap-3">
              <h3 className="font-bold text-slate-800 capitalize flex items-center gap-2 pb-2 border-b border-slate-100">
                <span className="h-2.5 w-2.5 rounded-full bg-brand"></span>
                {moduleName}
              </h3>
              <div className="space-y-3">
                {items.map(p => (
                  <div key={p.id} className="group flex flex-col gap-1.5 p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-sm hover:border-slate-200 transition-all">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700">
                        {p.name}
                        </span>
                        <code className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {p.id}
                        </code>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {p.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
