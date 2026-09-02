import React, { useEffect, useMemo, useState } from 'react';
import { createApi } from '../../../lib/api';
import { useToast } from '../../../components/ToastProvider';

export default function TenantRolesTab({ companyId, apiUrl, token }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Templates
  const [openTemplate, setOpenTemplate] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  
  // Custom Role Editor
  const [openEditor, setOpenEditor] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleName, setRoleName] = useState('');
  const [rolePermissions, setRolePermissions] = useState([]); // Selected codes
  const [allPermissions, setAllPermissions] = useState(null); // { module: [perms] }
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (companyId) load();
    // eslint-disable-next-line
  }, [companyId]);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const res = await api.get(`/api/companies/${companyId}/roles`);
      const data = res.data || res || [];
      setRoles(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || 'Error cargando roles de la empresa');
    } finally {
      setLoading(false);
    }
  }

  async function restoreDefaults() {
      if (!window.confirm('¿Estás seguro de restaurar los roles por defecto? Esto podría duplicar roles si ya existen con el mismo nombre.')) return;
      
      setRestoring(true);
      try {
          await api.post(`/api/companies/${companyId}/roles/restore-defaults`);
          toast.success('Roles restaurados correctamente');
          load();
      } catch (e) {
          toast.error(e.message || 'Error restaurando roles');
      } finally {
          setRestoring(false);
      }
  }

  // --- Template Logic ---

  async function openTemplateModal() {
    setOpenTemplate(true);
    setTemplatesLoading(true);
    try {
      const data = await api.get('/api/roles/templates');
      setTemplates(data || []);
    } catch (e) {
      toast.error('Error cargando plantillas: ' + e.message);
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function applyTemplate(e) {
    e.preventDefault();
    if (!selectedTemplate) return;

    setCreatingTemplate(true);
    try {
      await api.post(`/api/companies/${companyId}/roles/apply-template`, {
        template_key: selectedTemplate,
      });
      setOpenTemplate(false);
      setSelectedTemplate('');
      toast.success('Plantilla aplicada correctamente');
      await load();
    } catch (e) {
      toast.error(e.message || 'Error aplicando plantilla');
    } finally {
      setCreatingTemplate(false);
    }
  }

  // --- Custom Role Logic ---

  async function openRoleEditor(role = null) {
      setEditingRole(role);
      setRoleName(role ? role.name : '');
      setRolePermissions(role ? role.permissions || [] : []);
      setOpenEditor(true);
      
      if (!allPermissions) {
          setEditorLoading(true);
          try {
              const res = await api.get('/api/permissions');
              setAllPermissions(res.data || res || {});
          } catch (e) {
              toast.error('Error cargando permisos del sistema');
          } finally {
              setEditorLoading(false);
          }
      }
  }

  async function saveRole(e) {
      e.preventDefault();
      if (!roleName.trim()) return;

      setSaving(true);
      try {
          if (editingRole) {
              // Update
              await api.put(`/api/companies/${companyId}/roles/${editingRole.id}`, {
                  name: roleName,
                  permissions: rolePermissions
              });
              toast.success('Rol actualizado correctamente');
          } else {
              // Create
              await api.post(`/api/companies/${companyId}/roles`, {
                  name: roleName,
                  permissions: rolePermissions
              });
              toast.success('Rol creado correctamente');
          }
          setOpenEditor(false);
          load();
      } catch (e) {
          toast.error(e.message || 'Error guardando rol');
      } finally {
          setSaving(false);
      }
  }

  async function handleDelete(role) {
      if (!window.confirm(`¿Eliminar rol "${role.name}"? Esta acción no se puede deshacer.`)) return;
      try {
          await api.delete(`/api/companies/${companyId}/roles/${role.id}`);
          toast.success('Rol eliminado');
          load();
      } catch (e) {
          toast.error(e.message || 'Error eliminando rol');
      }
  }

  const togglePermission = (code) => {
      setRolePermissions(prev => {
          if (prev.includes(code)) return prev.filter(c => c !== code);
          return [...prev, code];
      });
  };

  const toggleModule = (moduleName, codes) => {
      const allSelected = codes.every(c => rolePermissions.includes(c));
      if (allSelected) {
          // Deselect all
          setRolePermissions(prev => prev.filter(c => !codes.includes(c)));
      } else {
          // Select all
          const toAdd = codes.filter(c => !rolePermissions.includes(c));
          setRolePermissions(prev => [...prev, ...toAdd]);
      }
  };

  if (loading && !roles.length && !err) return <div className="py-8 text-center text-slate-500">Cargando roles...</div>;
  if (err) return <div className="py-8 text-center text-red-500">{err}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
            <h3 className="text-lg font-bold text-slate-800">Roles y Permisos</h3>
            <p className="text-xs text-slate-500">Gestiona el acceso de los usuarios a la empresa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
            <button 
                onClick={load}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                title="Recargar"
            >
                <i className="bi bi-arrow-repeat" />
            </button>
            <button 
                onClick={restoreDefaults}
                disabled={restoring}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
                {restoring ? <i className="bi bi-arrow-clockwise animate-spin"/> : <i className="bi bi-magic"/>}
                <span className="hidden sm:inline">Restaurar Defaults</span>
            </button>
            <button
                onClick={openTemplateModal}
                className="inline-flex items-center gap-2 rounded-xl border border-brand/20 bg-brand/5 px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/10"
            >
                <i className="bi bi-collection" />
                <span className="hidden sm:inline">Usar Plantilla</span>
            </button>
            <button
                onClick={() => openRoleEditor(null)}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand/90 shadow-sm shadow-brand-500/20"
            >
                <i className="bi bi-plus-lg" />
                Nuevo Rol
            </button>
        </div>
      </div>

      {!roles.length && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
              No hay roles configurados. Puedes restaurar los valores por defecto o crear uno nuevo.
          </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {roles.map(role => (
              <div key={role.id} className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-all">
                  <div>
                      <div className="flex items-start justify-between mb-2">
                          <h4 className="font-bold text-slate-800 line-clamp-1" title={role.name}>{role.name}</h4>
                          {role.is_system ? (
                              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Sistema</span>
                          ) : (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openRoleEditor(role)} className="p-1 text-slate-400 hover:text-brand" title="Editar">
                                      <i className="bi bi-pencil-square" />
                                  </button>
                                  <button onClick={() => handleDelete(role)} className="p-1 text-slate-400 hover:text-red-600" title="Eliminar">
                                      <i className="bi bi-trash" />
                                  </button>
                              </div>
                          )}
                      </div>
                      
                      <div className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
                          <i className="bi bi-people-fill text-slate-400" />
                          {role.user_count || 0} usuarios
                      </div>

                      <div className="border-t border-slate-100 pt-3">
                          <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-slate-400">Permisos</span>
                              <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-full text-slate-500 font-mono">
                                  {role.permissions?.length || 0}
                              </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                              {(role.permissions || []).slice(0, 4).map((p, idx) => (
                                  <span key={idx} className="inline-block px-1.5 py-0.5 bg-slate-50 text-slate-600 text-[10px] rounded border border-slate-100" title={typeof p === 'string' ? p : p.code}>
                                      {typeof p === 'string' ? p.split('.').pop() : p.code}
                                  </span>
                              ))}
                              {(role.permissions || []).length > 4 && (
                                  <span className="inline-block px-1.5 py-0.5 bg-slate-50 text-slate-400 text-[10px] rounded border border-slate-100">
                                      +{(role.permissions.length - 4)}
                                  </span>
                              )}
                          </div>
                      </div>
                  </div>
              </div>
          ))}
      </div>

      {/* Modal Apply Template */}
      {openTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpenTemplate(false)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
              <h3 className="text-lg font-bold text-slate-900">Aplicar Plantilla</h3>
              <button onClick={() => setOpenTemplate(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                <i className="bi bi-x-lg" />
              </button>
            </div>
            
            <div className="overflow-y-auto p-6">
                {templatesLoading ? (
                    <div className="py-8 text-center text-slate-500">Cargando plantillas...</div>
                ) : (
                    <div className="space-y-3">
                        {templates.map(tpl => (
                            <label 
                              key={tpl.key} 
                              className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                                  selectedTemplate === tpl.key 
                                  ? 'border-brand bg-brand/5 ring-1 ring-brand' 
                                  : 'border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                                <input 
                                  type="radio" 
                                  name="template" 
                                  value={tpl.key} 
                                  checked={selectedTemplate === tpl.key}
                                  onChange={(e) => setSelectedTemplate(e.target.value)}
                                  className="mt-1"
                                />
                                <div>
                                    <div className="font-semibold text-slate-900">{tpl.name}</div>
                                    <div className="text-xs text-slate-500">{tpl.description}</div>
                                    <div className="mt-1 text-[10px] text-slate-400">{tpl.permissions_count} permisos</div>
                                </div>
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="border-t border-slate-100 px-6 py-4 shrink-0 bg-slate-50">
              <button
                onClick={applyTemplate}
                disabled={creatingTemplate || !selectedTemplate}
                className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white hover:bg-brand/90 disabled:opacity-70 shadow-sm shadow-brand-500/20"
              >
                {creatingTemplate ? 'Creando Rol...' : 'Crear Rol desde Plantilla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editor (Create/Edit) */}
      {openEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpenEditor(false)} />
          <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
              <h3 className="text-lg font-bold text-slate-900">{editingRole ? 'Editar Rol' : 'Nuevo Rol Personalizado'}</h3>
              <button onClick={() => setOpenEditor(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                <i className="bi bi-x-lg" />
              </button>
            </div>
            
            <form onSubmit={saveRole} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre del Rol</label>
                        <input 
                            type="text" 
                            value={roleName}
                            onChange={(e) => setRoleName(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:ring-brand"
                            placeholder="Ej. Supervisor de Ventas"
                            required
                        />
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold text-slate-700 mb-3">Permisos</h4>
                        {editorLoading ? (
                            <div className="text-center py-8 text-slate-500">Cargando permisos...</div>
                        ) : !allPermissions ? (
                            <div className="text-center py-8 text-red-500">No se pudieron cargar los permisos</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {Object.entries(allPermissions).map(([module, perms]) => {
                                    const modulePerms = perms.map(p => p.code);
                                    const allSelected = modulePerms.every(c => rolePermissions.includes(c));
                                    const someSelected = modulePerms.some(c => rolePermissions.includes(c));

                                    return (
                                        <div key={module} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                                            <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                                                <span className="font-bold text-xs uppercase tracking-wider text-slate-600">{module}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleModule(module, modulePerms)}
                                                    className="text-[10px] font-semibold text-brand hover:underline"
                                                >
                                                    {allSelected ? 'Ninguno' : 'Todos'}
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {perms.map(p => (
                                                    <label key={p.code} className="flex items-start gap-2 cursor-pointer group">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={rolePermissions.includes(p.code)}
                                                            onChange={() => togglePermission(p.code)}
                                                            className="mt-0.5 rounded border-slate-300 text-brand focus:ring-brand"
                                                        />
                                                        <div className="text-xs text-slate-600 group-hover:text-slate-900 transition-colors">
                                                            {p.name || p.code}
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t border-slate-100 px-6 py-4 shrink-0 bg-slate-50 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => setOpenEditor(false)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={saving || !roleName.trim()}
                        className="rounded-xl bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-70 shadow-sm shadow-brand-500/20"
                    >
                        {saving ? 'Guardando...' : (editingRole ? 'Actualizar Rol' : 'Crear Rol')}
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
