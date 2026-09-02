import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { createApi } from '../../lib/api';
import { normalizePageResponse } from '../../lib/pagination';
import { useAuth } from "../../context/AuthContext";
import { PLATFORM_ROLES } from '../../lib/platformRoles';
import ConfirmModal from '../../components/ConfirmModal';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import TenantImportModal from './TenantImportModal';

function ActionMenu({ tenant, onAction }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const close = () => setOpen(false);
    if (open) {
      window.addEventListener('click', close);
      window.addEventListener('resize', close);
      window.addEventListener('scroll', close, true);
    }
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const toggle = (e) => {
    e.stopPropagation();
    if (!open) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.right - 224 // w-56 = 224px
      });
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const { user } = useAuth();
  const isSupport = user?.platform_role === PLATFORM_ROLES.SUPPORT;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        className={`h-8 w-8 rounded-lg transition flex items-center justify-center ${
          open ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
        }`}
      >
        <i className="bi bi-three-dots-vertical" />
      </button>

      {open && createPortal(
        <div
          className="fixed z-[100] w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
          style={{ top: position.top, left: position.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            to={`/dashboard/tenants/${tenant.id}`}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
          >
            <i className="bi bi-eye" /> Ver detalle
          </Link>
          <Link
            to={`/dashboard/tenants/${tenant.id}/members`}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
          >
            <i className="bi bi-people" /> Ver miembros
          </Link>
          <Link
            to={`/dashboard/audit?tenant_id=${tenant.id}`}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
          >
            <i className="bi bi-clock-history" /> Ver auditoría
          </Link>
          
          {!isSupport && (
            <>
              <button
                onClick={() => {
                  setOpen(false);
                  onAction('impersonate', tenant);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
              >
                <i className="bi bi-incognito" /> Vista soporte
              </button>
              <div className="my-1 border-t border-slate-100" />
              <button
                onClick={() => {
                  setOpen(false);
                  onAction('edit', tenant);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
              >
                <i className="bi bi-pencil" /> Editar
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onAction('toggle_status', tenant);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  tenant.status === 'active'
                    ? 'text-amber-600 hover:bg-amber-50'
                    : 'text-emerald-600 hover:bg-emerald-50'
                }`}
              >
                {tenant.status === 'active' ? (
                  <>
                    <i className="bi bi-pause-circle" /> Suspender
                  </>
                ) : (
                  <>
                    <i className="bi bi-play-circle" /> Reactivar
                  </>
                )}
              </button>
              
              <button
                onClick={() => {
                  setOpen(false);
                  onAction('delete', tenant);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition"
              >
                <i className="bi bi-trash" /> Eliminar
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export default function TenantsListPage({ apiUrl, token }) {
  const { user } = useAuth();
  const isSupport = user?.platform_role === PLATFORM_ROLES.SUPPORT;
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [countryId, setCountryId] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, perPage, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Action states
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'suspend'|'activate', tenant: ... }
  const [actionLoading, setActionLoading] = useState(null);
  const [reason, setReason] = useState('');
  
  // Edit state
  const [openImport, setOpenImport] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '',
    legal_name: '',
    trade_name: '',
    country_id: '',
    default_currency_id: '',
    timezone_id: ''
  });

  // ---- Lookups (countries/currencies/timezones)
  const [countries, setCountries] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [timezones, setTimezones] = useState([]);
  const [lookupsLoading, setLookupsLoading] = useState(false);
  const [lookupsErr, setLookupsErr] = useState('');

  const countriesById = useMemo(() => {
    const m = new Map();
    for (const c of countries) m.set(String(c.id), c);
    return m;
  }, [countries]);

  const currenciesById = useMemo(() => {
    const m = new Map();
    for (const c of currencies) m.set(String(c.id), c);
    return m;
  }, [currencies]);

  const timezonesById = useMemo(() => {
    const m = new Map();
    for (const t of timezones) m.set(String(t.id), t);
    return m;
  }, [timezones]);

  async function load(nextPage = page) {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('per_page', String(perPage));
      if (q.trim()) params.set('q', q.trim());
      if (status) params.set('status', status);
      if (countryId) params.set('country_id', countryId);
      if (date) params.set('date', date);

      const data = await api.get(`/api/tenants?${params.toString()}`);
      const out = normalizePageResponse(data);
      setRows(out.items);
      setMeta(out.meta);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadLookups() {
    setLookupsLoading(true);
    setLookupsErr('');
    try {
      const [c1, c2, c3] = await Promise.all([
        api.get('/api/countries?page=1&per_page=200'),
        api.get('/api/currencies?page=1&per_page=200'),
        api.get('/api/timezones?page=1&per_page=200'),
      ]);

      const outCountries = normalizePageResponse(c1);
      const outCurrencies = normalizePageResponse(c2);
      const outTimezones = normalizePageResponse(c3);

      setCountries(outCountries.items || []);
      setCurrencies(outCurrencies.items || []);
      setTimezones(outTimezones.items || []);
    } catch (e) {
      setLookupsErr(e.message);
    } finally {
      setLookupsLoading(false);
    }
  }

  useEffect(() => {
    load(page);
    // eslint-disable-next-line
  }, [page]);

  useEffect(() => {
    loadLookups();
    // eslint-disable-next-line
  }, []);

  function applyFilters() {
    setPage(1);
    load(1);
  }

  async function handleAction(type, tenant) {
    if (type === 'impersonate') {
      setActionLoading(tenant.id);
      try {
        const res = await api.post(`/api/tenants/${tenant.id}/impersonate`, { 
          reason: 'Soporte Técnico',
          duration_minutes: 60 
        });
        
        const { token } = res.data;
        
        // Construct impersonated session
        const impersonatedSession = {
          token,
          user: {
            id: 'impersonated',
            full_name: `Soporte @ ${tenant.legal_name}`,
            email: 'support@spectra.internal',
            platform_role: 'company_admin',
            is_impersonated: true,
            company_id: tenant.id
          }
        };

        // Save original session if not already saved (to avoid overwriting with another impersonated session)
        const currentSession = localStorage.getItem('spectra_session');
        if (currentSession) {
          const parsed = JSON.parse(currentSession);
          if (!parsed.user.is_impersonated) {
            localStorage.setItem('spectra_original_session', currentSession);
          }
        }

        // Persist and redirect
        localStorage.setItem('spectra_session', JSON.stringify(impersonatedSession));
        toast.success(`Iniciando sesión como admin en ${tenant.legal_name}...`);
        
        // Force reload to apply new session
        window.location.href = '/dashboard';

      } catch (e) {
        toast.error(e.message || 'Error al iniciar impersonación');
      } finally {
        setActionLoading(null);
      }
      return;
    }
    if (type === 'toggle_status') {
      setReason('');
      setConfirmAction({
        type: tenant.status === 'active' ? 'suspend' : 'activate',
        tenant,
      });
    }
    if (type === 'edit') {
      setEditForm({
        id: tenant.id,
        legal_name: tenant.legal_name,
        trade_name: tenant.trade_name || '',
        country_id: tenant.country_id,
        default_currency_id: tenant.default_currency_id,
        timezone_id: tenant.timezone_id || tenant.timezoneId || '',
      });
      setOpenEdit(true);
    }
    if (type === 'delete') {
      setReason('');
      setConfirmAction({
        type: 'delete',
        tenant,
      });
    }
  }

  async function submitEdit(e) {
    e.preventDefault();
    setActionLoading(editForm.id);
    try {
      await api.put(`/api/tenants/${editForm.id}`, editForm);
      toast.success('Empresa actualizada correctamente');
      setOpenEdit(false);
      load();
    } catch (err) {
      toast.error(err.message || 'Error al actualizar');
    } finally {
      setActionLoading(null);
    }
  }

  async function executeStatusChange() {
    if (!confirmAction?.tenant) return;
    const { type, tenant } = confirmAction;
    
    if (type === 'suspend' && !reason.trim()) {
      toast.error('El motivo es requerido para suspender una empresa');
      return;
    }

    setActionLoading(tenant.id);
    try {
      if (type === 'delete') {
        await api.del(`/api/tenants/${tenant.id}`);
        toast.success('Empresa eliminada correctamente');
      } else {
        const endpoint = type === 'suspend' ? 'suspend' : 'activate'; 
        await api.post(`/api/tenants/${tenant.id}/${endpoint}`, { reason });
        toast.success(`Empresa ${type === 'suspend' ? 'suspendida' : 'reactivada'} correctamente`);
      }
      
      setConfirmAction(null);
      await load();
    } catch (e) {
      toast.error(e.message || 'Error al ejecutar acción');
    } finally {
      setActionLoading(null);
    }
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    if (countryId) params.set('country_id', countryId);
    if (date) params.set('date', date);
    
    const url = `${apiUrl}/api/tenants/export?${params.toString()}`;
    window.open(url, '_blank');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Empresas</div>
          <h1 className="text-xl font-bold">Lista de Empresas</h1>
          <p className="text-sm text-slate-600">Gestión centralizada de tenants, estados y accesos.</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Buscar</label>
            <div className="relative mt-1">
              <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Razón social, nombre comercial..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
              />
            </div>
          </div>
          
          <div>
            <label className="text-xs font-semibold text-slate-600">Estado</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
            >
              <option value="">Todos</option>
              <option value="active">Activo</option>
              <option value="suspended">Suspendido</option>
              <option value="pending">Pendiente</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">País</label>
            <select
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
            >
              <option value="">Todos</option>
              {countries.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Fecha creación</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
            />
          </div>

          <div className="flex gap-2 items-end">
            <button
              onClick={applyFilters}
              disabled={loading}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 transition shadow-sm"
              type="button"
            >
              Filtrar
            </button>
            
            {!isSupport && (
            <button
              onClick={() => setOpenImport(true)}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 transition shadow-sm"
              type="button"
              title="Importar CSV"
            >
              <i className="bi bi-upload" />
            </button>
            )}

            <button
              onClick={handleExport}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 transition shadow-sm"
              type="button"
              title="Exportar CSV"
            >
              <i className="bi bi-download" />
            </button>
          </div>
        </div>

        {err ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-center gap-2">
            <i className="bi bi-exclamation-triangle-fill" /> {err}
          </div>
        ) : null}

        {/* Mobile Card View */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:hidden">
          {rows.map((r) => {
            const country = countriesById.get(String(r.country_id));
            const tzId = r.timezone_id ?? r.timezoneId ?? null;
            const tz = tzId ? timezonesById.get(String(tzId)) : null;

            return (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{r.legal_name}</div>
                    <div className="text-xs text-slate-500">{r.trade_name || '—'}</div>
                  </div>
                  <ActionMenu tenant={r} onAction={handleAction} />
                </div>
                
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block">Ubicación</span>
                    <div className="flex items-center gap-1 mt-1">
                      {country && <span className="text-slate-700">{country.iso2}</span>}
                      {tz && <span className="text-xs text-slate-400">({tz.name})</span>}
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block">Estado</span>
                    <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold mt-1 border ${
                          r.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : r.status === 'suspended'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {r.status === 'active' ? 'Activo' : r.status === 'suspended' ? 'Suspendido' : r.status}
                      </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-500 block">Usuarios</span>
                    <div className="flex items-center gap-1 mt-1 text-slate-700">
                       <i className="bi bi-people-fill text-slate-400" /> {r.stats?.users_count ?? 0}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-500 block">Freelancers</span>
                    <div className="flex items-center gap-1 mt-1 text-slate-700">
                       <i className="bi bi-briefcase-fill text-slate-400" /> {r.stats?.freelancers_count ?? 0}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span>Creado: {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</span>
                    <span>Actividad: {r.last_activity_at ? new Date(r.last_activity_at).toLocaleDateString() : '—'}</span>
                </div>
              </div>
            );
          })}
          
          {!rows.length && !loading && (
             <div className="text-center py-10 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No se encontraron empresas.
             </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="mt-6 overflow-x-auto hidden md:block">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 bg-slate-50/50">
                <th className="py-3 px-3 font-semibold rounded-tl-xl">Empresa / Contacto</th>
                <th className="py-3 px-3 font-semibold">Ubicación</th>
                <th className="py-3 px-3 font-semibold">Estadísticas</th>
                <th className="py-3 px-3 font-semibold">Estado</th>
                <th className="py-3 px-3 font-semibold">Creado</th>
                <th className="py-3 px-3 font-semibold text-right rounded-tr-xl">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const country = countriesById.get(String(r.country_id));
                const tzId = r.timezone_id ?? r.timezoneId ?? null;
                const tz = tzId ? timezonesById.get(String(tzId)) : null;

                return (
                  <tr key={r.id} className="group hover:bg-slate-50/80 transition">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{r.legal_name}</div>
                      <div className="text-xs text-slate-500">{r.trade_name || '—'}</div>
                      {/* Placeholder for owner if available */}
                      {r.owner && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                          <i className="bi bi-person" /> {r.owner.name}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex flex-col gap-1">
                        {country && (
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <span className="text-xs">{country.iso2}</span>
                            <span className="truncate max-w-[120px]" title={country.name}>{country.name}</span>
                          </div>
                        )}
                        {tz && (
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <i className="bi bi-clock" /> {tz.name}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex gap-3 text-xs">
                        <div className="text-slate-600" title="Usuarios internos">
                          <i className="bi bi-people-fill mr-1 text-slate-400" />
                          <span className="font-semibold">{r.stats?.users_count ?? '—'}</span>
                        </div>
                        <div className="text-slate-600" title="Freelancers activos">
                          <i className="bi bi-briefcase-fill mr-1 text-slate-400" />
                          <span className="font-semibold">{r.stats?.freelancers_count ?? '—'}</span>
                        </div>
                      </div>
                      {/* Last activity placeholder */}
                      <div className="mt-1 text-[10px] text-slate-400">
                        Actividad: {r.last_activity_at ? new Date(r.last_activity_at).toLocaleDateString() : '—'}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                          r.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : r.status === 'suspended'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {r.status === 'active' ? 'Activo' : r.status === 'suspended' ? 'Suspendido' : r.status}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-xs text-slate-500">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                    </td>

                    <td className="py-3 px-3 text-right relative">
                      <ActionMenu tenant={r} onAction={handleAction} />
                    </td>
                  </tr>
                );
              })}

              {!rows.length && !loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="mx-auto h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center mb-3 text-slate-400 text-xl">
                      <i className="bi bi-search" />
                    </div>
                    No se encontraron empresas con los filtros seleccionados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="text-xs text-slate-500">
            Mostrando <span className="font-semibold text-slate-700">{rows.length}</span> de <span className="font-semibold text-slate-700">{meta.total}</span> resultados
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={loading || meta.page <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              type="button"
            >
              Anterior
            </button>
            <div className="text-sm font-medium text-slate-700 min-w-[3rem] text-center">
              {meta.page} / {meta.totalPages}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={loading || meta.page >= meta.totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              type="button"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={openEdit}
        title="Editar Empresa"
        onClose={() => setOpenEdit(false)}
      >
        <form onSubmit={submitEdit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700">Razón Social</label>
            <input
              required
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
              value={editForm.legal_name}
              onChange={(e) => setEditForm({ ...editForm, legal_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700">Nombre Comercial</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
              value={editForm.trade_name}
              onChange={(e) => setEditForm({ ...editForm, trade_name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700">País</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                value={editForm.country_id}
                onChange={(e) => setEditForm({ ...editForm, country_id: e.target.value })}
              >
                <option value="">Seleccionar...</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Moneda</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                value={editForm.default_currency_id}
                onChange={(e) => setEditForm({ ...editForm, default_currency_id: e.target.value })}
              >
                <option value="">Seleccionar...</option>
                {currencies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700">Zona Horaria</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
              value={editForm.timezone_id}
              onChange={(e) => setEditForm({ ...editForm, timezone_id: e.target.value })}
            >
              <option value="">Seleccionar...</option>
              {timezones.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setOpenEdit(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={actionLoading === editForm.id}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-70"
            >
              {actionLoading === editForm.id ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmAction}
        title={
          confirmAction?.type === 'delete' ? 'Eliminar Empresa' :
          confirmAction?.type === 'suspend' ? 'Suspender Empresa' : 'Reactivar Empresa'
        }
        message={
          confirmAction?.type === 'delete'
            ? `¿Estás seguro de que deseas eliminar a ${confirmAction?.tenant?.legal_name}? Esta acción no se puede deshacer.` :
          confirmAction?.type === 'suspend'
            ? `¿Estás seguro de que deseas suspender a ${confirmAction?.tenant?.legal_name}? Los usuarios no podrán acceder.`
            : `¿Deseas reactivar el acceso para ${confirmAction?.tenant?.legal_name}?`
        }
        confirmText={
          confirmAction?.type === 'delete' ? 'Eliminar' :
          confirmAction?.type === 'suspend' ? 'Suspender' : 'Reactivar'
        }
        onClose={() => setConfirmAction(null)}
        onConfirm={executeStatusChange}
        loading={actionLoading === confirmAction?.tenant?.id}
        danger={confirmAction?.type === 'suspend' || confirmAction?.type === 'delete'}
      >
        {confirmAction?.type === 'suspend' && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Motivo de suspensión <span className="text-red-600">*</span></label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-300 shadow-sm focus:border-brand focus:ring-brand/10 p-2.5 text-sm"
              placeholder="Indica el motivo por el cual se suspende esta empresa..."
              rows={3}
              required
            />
          </div>
        )}
        {confirmAction?.type === 'activate' && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Motivo (opcional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-300 shadow-sm focus:border-brand focus:ring-brand/10 p-2.5 text-sm"
              placeholder="Nota opcional sobre la reactivación..."
              rows={2}
            />
          </div>
        )}
      </ConfirmModal>

      <TenantImportModal
        open={openImport}
        onClose={() => setOpenImport(false)}
        api={api}
        countries={countries}
        currencies={currencies}
        timezones={timezones}
        onSuccess={() => {
            load();
        }}
      />
    </div>
  );
}
