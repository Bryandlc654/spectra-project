import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createApi } from '../../lib/api';
import { normalizePageResponse } from '../../lib/pagination';
import { useToast } from '../../components/ToastProvider';
import ConfirmModal from '../../components/ConfirmModal';
import Modal from '../../components/Modal';

export default function FreelancersListPage({ apiUrl, token }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const [page, setPage] = useState(1);
  const perPage = 20;

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, perPage, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [country, setCountry] = useState('');
  const [area, setArea] = useState('');

  // Action state
  const [openCreate, setOpenCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: '',
    email: '',
    national_id: '',
    years_experience: '',
    area: '',
    country: '',
    city: '',
    phone: '',
    bio: '',
    skills: ''
  });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [skillInput, setSkillInput] = useState('');
  
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'block' | 'unblock' | 'reset_password' | 'delete', user: ... }
  const [actionLoading, setActionLoading] = useState(false);

  // Areas & Countries
  const [areas, setAreas] = useState([]);
  const [countries, setCountries] = useState([]);

  useEffect(() => {
    // Load Areas
    api.get('/api/freelancer-areas')
       .then(data => setAreas(data || []))
       .catch(err => console.error('Error loading areas', err));

    // Load Countries
    api.get('/api/countries?per_page=100')
       .then(data => {
         const out = normalizePageResponse(data);
         setCountries(out.items || []);
       })
       .catch(err => console.error('Error loading countries', err));
  }, [api]);

  async function load(nextPage = page) {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('per_page', String(perPage));

      if (search.trim()) params.set('q', search.trim());
      if (status) params.set('status', status);
      if (country.trim()) params.set('country', country.trim());
      if (area.trim()) params.set('area', area.trim());

      // Add timestamp to prevent caching
      params.set('_t', Date.now());

      const data = await api.get(`/api/freelancers?${params.toString()}`);
      const out = normalizePageResponse(data);
      
      setRows(out.items);
      setMeta(out.meta);
    } catch (e) {
      setErr(e.message || 'Error cargando freelancers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(page);
    // eslint-disable-next-line
  }, [page, status, country, area]);

  async function handleBlock() {
    if (!confirmAction?.user) return;
    const user = confirmAction.user;
    const isBlocking = confirmAction.type === 'block';

    setActionLoading(true);
    try {
      if (isBlocking) {
          await api.post(`/api/freelancers/${user.id}/block`);
          toast.success('Freelancer bloqueado correctamente');
      } else {
          await api.post(`/api/freelancers/${user.id}/unblock`);
          toast.success('Freelancer desbloqueado correctamente');
      }
      await load();
      setConfirmAction(null);
    } catch (e) {
      toast.error(e.message || `Error al ${isBlocking ? 'bloquear' : 'desbloquear'} freelancer`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!confirmAction?.user) return;
    const user = confirmAction.user;

    setActionLoading(true);
    try {
      await api.post(`/api/users/${user.id}/send-password-reset`);
      toast.success('Solicitud de cambio de contraseña enviada al freelancer');
      setConfirmAction(null);
    } catch (e) {
      toast.error(e.message || 'Error al solicitar cambio de contraseña');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirmAction?.user) return;
    const user = confirmAction.user;

    setActionLoading(true);
    try {
      await api.delete(`/api/freelancers/${user.id}`);
      toast.success('Freelancer eliminado correctamente');
      setConfirmAction(null);
      load();
    } catch (e) {
      toast.error(e.message || 'Error al eliminar freelancer');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      if (editingId) {
        await api.put(`/api/freelancers/${editingId}`, createForm);
        toast.success('Freelancer actualizado correctamente');
      } else {
        await api.post('/api/freelancers', createForm);
        toast.success('Freelancer creado correctamente');
      }
      setOpenCreate(false);
      resetForm();
      load(editingId ? page : 1);
    } catch (e) {
      toast.error(e.message || `Error al ${editingId ? 'actualizar' : 'crear'} freelancer`);
    } finally {
      setCreating(false);
    }
  }

  function resetForm() {
    setCreateForm({
      full_name: '',
      email: '',
      national_id: '',
      years_experience: '',
      area: '',
      country: '',
      city: '',
      phone: '',
      bio: '',
      skills: ''
    });
    setSkillInput('');
    setEditingId(null);
  }

  function handleEdit(user) {
    setCreateForm({
      full_name: user.full_name || '',
      email: user.email || '',
      national_id: user.national_id || '', // Note: API response might not have national_id if not in query?
      years_experience: user.years_experience || '',
      area: user.area || '',
      country: user.country || '',
      city: user.city || '',
      phone: user.phone || '',
      bio: user.bio || '',
      skills: user.skills || ''
    });
    setEditingId(user.id);
    setOpenCreate(true);
  }

  function handleAddSkill(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = skillInput.trim();
      if (val) {
        const current = createForm.skills ? createForm.skills.split(',').map(s => s.trim()).filter(Boolean) : [];
        if (!current.includes(val)) {
          setCreateForm({ ...createForm, skills: [...current, val].join(', ') });
        }
        setSkillInput('');
      }
    }
  }

  function handleRemoveSkill(skillToRemove) {
    const current = createForm.skills ? createForm.skills.split(',').map(s => s.trim()).filter(Boolean) : [];
    setCreateForm({ ...createForm, skills: current.filter(s => s !== skillToRemove).join(', ') });
  }

  async function handleExport() {
    try {
      // Assuming api.get returns the parsed JSON by default, we need to handle blob.
      // If api wrapper doesn't support blob, we might need to use fetch directly with token.
      // Let's try to use fetch directly to be safe.
      const response = await fetch(`${apiUrl}/api/freelancers/export`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Error exportando');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `freelancers_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      toast.error('Error al exportar freelancers');
    }
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const toastId = toast.loading('Importando freelancers...');
    try {
      const response = await fetch(`${apiUrl}/api/freelancers/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
          // Don't set Content-Type, let browser set it with boundary
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al importar');
      }
      
      toast.dismiss(toastId);
      toast.success(data.message || 'Importación completada');
      load(1);
    } catch (e) {
      toast.dismiss(toastId);
      toast.error(e.message || 'Error al importar');
    } finally {
      e.target.value = '';
    }
  }

  const confirmMessage = useMemo(() => {
    if (!confirmAction) return '';
    const name = confirmAction.user?.full_name || 'este freelancer';
    if (confirmAction.type === 'block') return `¿Estás seguro de que deseas bloquear el acceso de ${name}?`;
    if (confirmAction.type === 'unblock') return `¿Estás seguro de que deseas desbloquear el acceso de ${name}?`;
    if (confirmAction.type === 'reset_password') return `Se enviará un correo a ${name} para que cambie su contraseña de acceso. ¿Deseas continuar?`;
    if (confirmAction.type === 'delete') return `¿Estás seguro de que deseas eliminar a ${name}? Esta acción es irreversible y eliminará todos sus datos asociados.`;
    return 'Confirma la acción seleccionada.';
  }, [confirmAction]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Directorio de Freelancers</h1>
          <p className="text-slate-500 text-sm mt-1">Gestión y monitoreo de talento freelance</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExport}
            className="bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2"
          >
            <i className="bi bi-download"></i>
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <label className="bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2 cursor-pointer">
            <i className="bi bi-upload"></i>
            <span className="hidden sm:inline">Importar</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
          </label>
          <Link
            to="areas"
            className="bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2"
          >
            <i className="bi bi-gear"></i>
            <span className="hidden sm:inline">Gestionar Áreas</span>
          </Link>
          <button
            onClick={() => setOpenCreate(true)}
            className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark transition-all shadow-sm flex items-center gap-2"
          >
            <i className="bi bi-plus-lg"></i>
            <span className="hidden sm:inline">Nuevo</span>
            <span className="inline sm:hidden">Crear</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input
            type="text"
            placeholder="Buscar por nombre, email..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
          />
        </div>
        <div className="flex flex-wrap w-full md:w-auto gap-2">
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}
            className="flex-1 md:w-36 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none"
          >
            <option value="">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="suspended">Suspendidos</option>
          </select>

          <select
            value={area}
            onChange={e => { setArea(e.target.value); setPage(1); }}
            className="flex-1 md:w-40 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none"
          >
            <option value="">Todas las áreas</option>
            {areas.map(a => (
              <option key={a.id} value={a.name}>{a.name}</option>
            ))}
          </select>

          <select
            value={country}
            onChange={e => { setCountry(e.target.value); setPage(1); }}
            className="flex-1 md:w-40 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none"
          >
            <option value="">Todos los países</option>
            {countries.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error State */}
      {err && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2 animate-fadeIn">
          <i className="bi bi-exclamation-circle-fill"></i>
          {err}
        </div>
      )}

      {/* Loading State (Skeletons) */}
      {loading && (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 animate-pulse flex flex-col md:flex-row gap-4 items-center">
              <div className="h-12 w-12 bg-slate-200 rounded-full shrink-0"></div>
              <div className="flex-1 w-full space-y-2">
                <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                <div className="h-3 bg-slate-200 rounded w-1/2"></div>
              </div>
              <div className="hidden md:block h-8 bg-slate-200 rounded w-24"></div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && rows.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200 border-dashed">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="bi bi-people text-3xl text-slate-400"></i>
          </div>
          <h3 className="text-lg font-medium text-slate-900">No se encontraron freelancers</h3>
          <p className="text-slate-500 text-sm mt-1">Intenta ajustar los filtros de búsqueda o crea uno nuevo</p>
          {search && (
            <button 
                onClick={() => { setSearch(''); setStatus(''); setCountry(''); }}
                className="mt-4 text-brand font-medium text-sm hover:underline"
            >
                Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Desktop Table View */}
      {!loading && rows.length > 0 && (
        <div className="hidden md:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-900">
                <tr>
                  <th className="px-6 py-4">Freelancer</th>
                  <th className="px-6 py-4">Código</th>
                  <th className="px-6 py-4">Especialidad</th>
                  <th className="px-6 py-4">Contacto</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-lg shrink-0">
                          {r.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <Link to={`/dashboard/freelancers/${r.id}`} className="font-semibold text-slate-900 hover:text-brand hover:underline flex items-center gap-1">
                            {r.full_name}
                          </Link>
                          <div className="text-xs text-slate-500">Reg: {new Date(r.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs font-mono text-slate-700 border border-slate-200">
                        {r.freelancer_code || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{r.area || <span className="text-slate-400 italic">Sin área</span>}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <i className="bi bi-geo-alt"></i>
                        {r.country || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-slate-600">{r.email}</span>
                        {r.phone && <span className="text-xs text-slate-400">{r.phone}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        (!r.status || r.status === 'active')
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                          : r.status === 'suspended'
                          ? 'bg-red-50 text-red-700 border-red-100'
                          : 'bg-slate-50 text-slate-700 border-slate-100'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                            (!r.status || r.status === 'active') ? 'bg-emerald-500' : r.status === 'suspended' ? 'bg-red-500' : 'bg-slate-500'
                        }`}></span>
                        {(!r.status || r.status === 'active') ? 'Activo' : r.status === 'suspended' ? 'Suspendido' : r.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link 
                            to={String(r.id)}
                            className="p-1.5 text-slate-500 hover:text-brand hover:bg-brand/5 rounded transition-colors"
                            title="Ver perfil"
                          >
                            <i className="bi bi-eye"></i>
                          </Link>
                          <button 
                            onClick={() => handleEdit(r)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Editar"
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button 
                            onClick={() => setConfirmAction({ type: 'delete', user: r })}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Eliminar"
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                          <button 
                            onClick={() => setConfirmAction({ type: 'reset_password', user: r })}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                            title="Forzar cambio de contraseña"
                          >
                            <i className="bi bi-key"></i>
                          </button>
                          {r.status !== 'suspended' ? (
                            <button 
                              onClick={() => setConfirmAction({ type: 'block', user: r })}
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Bloquear acceso"
                            >
                              <i className="bi bi-slash-circle"></i>
                            </button>
                          ) : (
                            <button 
                              onClick={() => setConfirmAction({ type: 'unblock', user: r })}
                              className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="Desbloquear acceso"
                            >
                              <i className="bi bi-check-circle"></i>
                            </button>
                          )}
                        </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Desktop */}
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
            <span className="text-sm text-slate-500">
              Mostrando {(page - 1) * perPage + 1} a {Math.min(page * perPage, meta.total)} de {meta.total} resultados
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="px-3 py-1 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(meta.lastPage || 1, p + 1))}
                disabled={page >= (meta.lastPage || 1) || loading}
                className="px-3 py-1 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Card View */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden">
          {rows.map(r => (
            <div key={r.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-lg shrink-0">
                    {r.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="overflow-hidden">
                    <Link to={`/dashboard/freelancers/${r.id}`} className="font-semibold text-slate-900 block truncate">
                      {r.full_name}
                    </Link>
                    <div className="text-xs text-slate-500 truncate">{r.area || 'Sin área definida'}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Código: {r.freelancer_code || '—'}</div>
                  </div>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0 ${
                  (!r.status || r.status === 'active') 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : r.status === 'suspended'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-slate-100 text-slate-800'
                }`}>
                  {(!r.status || r.status === 'active') ? 'ACTIVO' : r.status === 'suspended' ? 'SUSP.' : r.status}
                </span>
              </div>
              
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <i className="bi bi-envelope text-slate-400"></i>
                  <span className="truncate">{r.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <i className="bi bi-geo-alt text-slate-400"></i>
                  <span>{r.country || 'N/A'}</span>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-between gap-2">
                <Link 
                  to={`/dashboard/freelancers/${r.id}`}
                  className="flex-1 bg-slate-50 text-slate-700 py-2 rounded-lg text-sm font-medium text-center hover:bg-slate-100 transition-colors"
                >
                  Ver Perfil
                </Link>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setConfirmAction({ type: 'reset_password', user: r })}
                    className="px-3 py-2 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
                    title="Forzar cambio de contraseña"
                  >
                    <i className="bi bi-key"></i>
                  </button>
                  {r.status !== 'suspended' ? (
                    <button 
                      onClick={() => setConfirmAction({ type: 'block', user: r })}
                      className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                      title="Bloquear"
                    >
                      <i className="bi bi-slash-circle"></i>
                    </button>
                  ) : (
                    <button 
                      onClick={() => setConfirmAction({ type: 'unblock', user: r })}
                      className="px-3 py-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                      title="Desbloquear"
                    >
                      <i className="bi bi-check-circle"></i>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {/* Pagination Mobile */}
          <div className="col-span-full flex items-center justify-center gap-4 py-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="w-10 h-10 flex items-center justify-center bg-white border border-slate-300 rounded-full shadow-sm disabled:opacity-50 active:bg-slate-100"
            >
              <i className="bi bi-chevron-left"></i>
            </button>
            <span className="text-sm font-medium text-slate-600">
              {page} / {meta.lastPage || 1}
            </span>
            <button
              onClick={() => setPage(p => Math.min(meta.lastPage || 1, p + 1))}
              disabled={page >= (meta.lastPage || 1) || loading}
              className="w-10 h-10 flex items-center justify-center bg-white border border-slate-300 rounded-full shadow-sm disabled:opacity-50 active:bg-slate-100"
            >
              <i className="bi bi-chevron-right"></i>
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal
        open={openCreate}
        title={editingId ? "Editar Freelancer" : "Registrar Nuevo Freelancer"}
        onClose={() => { setOpenCreate(false); resetForm(); }}
      >
        <form 
          onSubmit={handleCreate} 
          className="space-y-4 flex flex-col max-h-[80vh]"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-y-auto pr-1">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-brand focus:border-brand"
                value={createForm.full_name}
                onChange={e => setCreateForm({...createForm, full_name: e.target.value})}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
              <input
                type="email"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-brand focus:border-brand"
                value={createForm.email}
                onChange={e => setCreateForm({...createForm, email: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Documento de Identidad</label>
              <input
                type="text"
                placeholder="DNI, NIE, CC, etc."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-brand focus:border-brand"
                value={createForm.national_id}
                onChange={e => setCreateForm({ ...createForm, national_id: e.target.value })}
              />
            </div>


            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Área / Especialidad</label>
              <select
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-brand focus:border-brand bg-white"
                value={createForm.area}
                onChange={e => setCreateForm({...createForm, area: e.target.value})}
              >
                <option value="">Selecciona un área...</option>
                {areas.map(a => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Años de Experiencia</label>
              <input
                type="number"
                min="0"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-brand focus:border-brand"
                value={createForm.years_experience}
                onChange={e => setCreateForm({...createForm, years_experience: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
              <select
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-brand focus:border-brand bg-white"
                value={createForm.country}
                onChange={e => setCreateForm({...createForm, country: e.target.value})}
              >
                <option value="">Selecciona un país...</option>
                {countries.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ciudad</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-brand focus:border-brand"
                value={createForm.city}
                onChange={e => setCreateForm({...createForm, city: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-brand focus:border-brand"
                value={createForm.phone}
                onChange={e => setCreateForm({...createForm, phone: e.target.value})}
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Habilidades</label>
              <div className="w-full px-3 py-2 border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-brand/20 focus-within:border-brand bg-white min-h-[42px] flex flex-wrap gap-2">
                {createForm.skills.split(',').map(s => s.trim()).filter(Boolean).map((skill, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-brand/10 text-brand">
                    {skill}
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill)}
                      className="ml-1 text-brand/60 hover:text-brand focus:outline-none"
                    >
                      &times;
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  className="flex-1 min-w-[120px] outline-none text-sm bg-transparent"
                  placeholder={createForm.skills ? "" : "Escribe y presiona Enter..."}
                  value={skillInput}
                  onChange={e => setSkillInput(e.target.value)}
                  onKeyDown={handleAddSkill}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Presiona Enter o coma para agregar una habilidad</p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Bio / Descripción</label>
              <textarea
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-brand focus:border-brand"
                rows={3}
                value={createForm.bio}
                onChange={e => setCreateForm({...createForm, bio: e.target.value})}
              ></textarea>
            </div>
          </div>
          
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end pt-4 gap-2">
            <button
              type="button"
              onClick={() => { setOpenCreate(false); resetForm(); }}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creating}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark disabled:opacity-50"
            >
              {creating ? 'Guardando...' : (editingId ? 'Actualizar Freelancer' : 'Crear Freelancer')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Modal */}
      <ConfirmModal
        open={!!confirmAction}
        title={getConfirmTitle(confirmAction?.type)}
        message={confirmMessage}
        onClose={() => setConfirmAction(null)}
        onConfirm={
          confirmAction?.type === 'reset_password'
            ? handleResetPassword
            : confirmAction?.type === 'delete'
            ? handleDelete
            : handleBlock
        }
        loading={actionLoading}
        confirmText={
          confirmAction?.type === 'block'
            ? 'Bloquear'
            : confirmAction?.type === 'unblock'
            ? 'Desbloquear'
            : confirmAction?.type === 'delete'
            ? 'Eliminar'
            : 'Enviar correo'
        }
        type={
          confirmAction?.type === 'block' || confirmAction?.type === 'delete'
            ? 'danger'
            : confirmAction?.type === 'reset_password'
            ? 'warning'
            : 'success'
        }
      />
    </div>
  );
}

function getConfirmTitle(type) {
  if (type === 'block') return 'Bloquear Freelancer';
  if (type === 'unblock') return 'Desbloquear Freelancer';
  if (type === 'reset_password') return 'Forzar cambio de contraseña';
  if (type === 'delete') return 'Eliminar Freelancer';
  return 'Confirmar acción';
}
