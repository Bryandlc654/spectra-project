import React, { useEffect, useState, useMemo } from 'react';
import RBACTabs from './RBACTabs';
import { PLATFORM_ROLES, ROLE_LABELS, setDynamicPermissions } from '../../lib/platformRoles';
import { SYSTEM_PERMISSIONS } from './PermissionsPage';
import { createApi } from '../../lib/api';

const SYSTEM_ROLES = [
  {
    id: PLATFORM_ROLES.SUPER_ADMIN,
    name: ROLE_LABELS[PLATFORM_ROLES.SUPER_ADMIN],
    description: 'Acceso total a todos los módulos y configuraciones del sistema.',
    isStatic: true
  },
  {
    id: PLATFORM_ROLES.SUPPORT,
    name: ROLE_LABELS[PLATFORM_ROLES.SUPPORT],
    description: 'Gestión de clientes, usuarios y soporte técnico.'
  },
  {
    id: PLATFORM_ROLES.FINANCE,
    name: ROLE_LABELS[PLATFORM_ROLES.FINANCE],
    description: 'Operaciones financieras, facturación y contratos.'
  },
  {
    id: PLATFORM_ROLES.LEGAL,
    name: ROLE_LABELS[PLATFORM_ROLES.LEGAL],
    description: 'Cumplimiento legal, KYB y auditoría de contratos.'
  },
  {
    id: PLATFORM_ROLES.SECURITY,
    name: ROLE_LABELS[PLATFORM_ROLES.SECURITY],
    description: 'Seguridad de la información, auditoría y control de acceso.'
  },
  {
    id: PLATFORM_ROLES.COMPANY_ADMIN,
    name: ROLE_LABELS[PLATFORM_ROLES.COMPANY_ADMIN],
    description: 'Administración completa de una empresa (Tenant).'
  },
  {
    id: PLATFORM_ROLES.FREELANCER,
    name: ROLE_LABELS[PLATFORM_ROLES.FREELANCER],
    description: 'Trabajador independiente con acceso a proyectos y tiempos.'
  },
  {
    id: PLATFORM_ROLES.USER,
    name: ROLE_LABELS[PLATFORM_ROLES.USER],
    description: 'Usuario estándar (Empleado).'
  }
];

const DEFAULT_PERMISSIONS = {
  [PLATFORM_ROLES.SUPER_ADMIN]: SYSTEM_PERMISSIONS.map(p => p.id),
  [PLATFORM_ROLES.SUPPORT]: ['tenants', 'admins', 'users', 'support', 'broadcasts', 'freelancers'],
  [PLATFORM_ROLES.FINANCE]: ['tenants', 'finance', 'contracts'],
  [PLATFORM_ROLES.COMPANY_ADMIN]: ['dashboard', 'payroll', 'contracts', 'documents', 'time_off', 'expenses', 'team', 'projects', 'timesheets', 'procurement', 'nps_dashboard'],
  [PLATFORM_ROLES.FREELANCER]: ['dashboard', 'contracts', 'expenses', 'timesheets', 'support'],
  [PLATFORM_ROLES.USER]: ['dashboard', 'profile', 'time_off', 'documents', 'benefits', 'payslips'],
  [PLATFORM_ROLES.LEGAL]: ['tenants', 'users', 'kyb', 'contracts', 'audit', 'freelancers'],
  [PLATFORM_ROLES.SECURITY]: ['tenants', 'admins', 'users', 'rbac', 'kyb', 'audit', 'settings']
};

export default function RoleTemplatesPage({ apiUrl, token }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const [dynamicMap, setDynamicMap] = useState({});
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  
  // Editing
  const [editingRole, setEditingRole] = useState(null);
  const [selectedModules, setSelectedModules] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPermissions();
    loadStats();
    // eslint-disable-next-line
  }, []);

  async function loadStats() {
    try {
      const res = await api.get('/api/roles/system/stats');
      setStats(res.data || res || {});
    } catch (e) {
      console.error('Error loading stats', e);
    }
  }

  async function loadPermissions() {
    try {
      setLoading(true);
      const res = await api.get('/api/roles/system/permissions');
      const data = res.data || res || {};
      setDynamicMap(data);
      // Update the global lib state as well so navigation works immediately
      setDynamicPermissions(data);
    } catch (e) {
      console.error('Error loading permissions', e);
    } finally {
      setLoading(false);
    }
  }

  function getActiveModules(roleId) {
    if (dynamicMap[roleId]) return dynamicMap[roleId];
    return DEFAULT_PERMISSIONS[roleId] || [];
  }

  function openEdit(role) {
    setEditingRole(role);
    setSelectedModules(getActiveModules(role.id));
  }

  function toggleModule(modId) {
    setSelectedModules(prev => {
      if (prev.includes(modId)) return prev.filter(m => m !== modId);
      return [...prev, modId];
    });
  }

  async function handleSave() {
    if (!editingRole) return;
    setSaving(true);
    try {
      await api.post('/api/roles/system/permissions', {
        role: editingRole.id,
        modules: selectedModules
      });
      await loadPermissions(); // Reload and update global state
      setEditingRole(null);
    } catch (e) {
      alert('Error guardando: ' + (e.message || 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Seguridad</div>
        <h1 className="text-xl font-bold">Roles del Sistema</h1>
        <p className="text-sm text-slate-600">Catálogo de roles y permisos definidos en la plataforma.</p>
      </div>

      <RBACTabs />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SYSTEM_ROLES.map(role => {
          const activeModules = getActiveModules(role.id);
          const isSuperAdmin = role.id === PLATFORM_ROLES.SUPER_ADMIN;
          const userCount = stats[role.id] || 0;

          return (
            <div key={role.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md transition">
              <div className="mb-4">
                <div className="flex justify-between items-start">
                    <h3 className="text-lg font-bold text-slate-800">{role.name}</h3>
                    {!isSuperAdmin && (
                        <button 
                            onClick={() => openEdit(role)}
                            className="text-slate-400 hover:text-brand transition-colors p-1"
                            title="Editar permisos"
                        >
                            <i className="bi bi-pencil-square"></i>
                        </button>
                    )}
                </div>
                <p className="text-sm text-slate-500 line-clamp-2 mt-1">{role.description}</p>
              </div>

              <div className="flex-1 mb-4">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Módulos Permitidos</div>
                <div className="flex flex-wrap gap-1.5">
                  {isSuperAdmin ? (
                      <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-brand/10 text-brand">
                        Acceso Total
                      </span>
                  ) : activeModules.length > 0 ? (
                    activeModules.map((modId) => {
                        const def = SYSTEM_PERMISSIONS.find(p => p.id === modId);
                        return (
                            <span key={modId} className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600">
                                {def ? def.name : modId}
                            </span>
                        );
                    })
                  ) : (
                    <span className="text-xs text-slate-400 italic">Sin acceso a módulos</span>
                  )}
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-100 mt-auto flex items-center justify-between">
                 <div className="flex items-center gap-3">
                     <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                        <i className={`bi ${isSuperAdmin ? 'bi-shield-fill text-brand' : 'bi-shield-lock'}`} />
                        {isSuperAdmin ? 'Rol de Sistema (Fijo)' : 'Rol Configurable'}
                     </span>
                     {userCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            <i className="bi bi-people-fill"></i>
                            {userCount}
                        </span>
                     )}
                 </div>
                 {dynamicMap[role.id] && !isSuperAdmin && (
                     <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                         Personalizado
                     </span>
                 )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] flex flex-col">
                <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Editar Permisos</h2>
                        <p className="text-sm text-slate-500">Rol: <span className="font-semibold text-brand">{editingRole.name}</span></p>
                    </div>
                    <button onClick={() => setEditingRole(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                        <i className="bi bi-x-lg text-lg"></i>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {SYSTEM_PERMISSIONS.map(p => {
                            const isSelected = selectedModules.includes(p.id);
                            return (
                                <label 
                                    key={p.id} 
                                    className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                                        isSelected 
                                        ? 'border-brand bg-brand/5 ring-1 ring-brand' 
                                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                >
                                    <input 
                                        type="checkbox" 
                                        className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                                        checked={isSelected}
                                        onChange={() => toggleModule(p.id)}
                                    />
                                    <div>
                                        <div className="text-sm font-semibold text-slate-700">{p.name}</div>
                                        <div className="text-xs text-slate-500 line-clamp-2">{p.description}</div>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
                    <button 
                        onClick={() => setEditingRole(null)}
                        className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
                        disabled={saving}
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 rounded-xl bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand/90 transition disabled:opacity-50"
                    >
                        {saving ? (
                            <>
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></span>
                                Guardando...
                            </>
                        ) : (
                            <>
                                <i className="bi bi-check-lg"></i>
                                Guardar Cambios
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
