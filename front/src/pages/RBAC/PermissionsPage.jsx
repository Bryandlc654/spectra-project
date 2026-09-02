import React, { useMemo, useState } from 'react';
import RBACTabs from './RBACTabs';

// Definición estática de los permisos/módulos del sistema
export const SYSTEM_PERMISSIONS = [
  {
    id: 'tenants',
    name: 'Empresas (Tenants)',
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
                <input 
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
