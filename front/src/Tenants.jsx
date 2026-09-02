import React, { useEffect, useMemo, useState } from 'react';
import StatusMessage from './components/StatusMessage';
import { normalizePageResponse } from './utils/pagination';

function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="text-sm font-bold">{title}</div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-slate-100">
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function Tenants({ apiUrl, token }) {
  const [statusMsg, setStatusMsg] = useState({ tone: 'info', message: '' });
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState('');
  const [state, setState] = useState(''); // active | suspended | ''
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });

  const [openCreate, setOpenCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    legal_name: '',
    trade_name: '',
    country_id: '',
    default_currency_id: '',
    timezone: 'UTC',
    default_language: 'es',
  });

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  async function fetchList(nextPage) {
    setLoading(true);
    setStatusMsg({ tone: 'info', message: 'Cargando tenants...' });
    try {
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('per_page', String(perPage));
      if (q.trim()) params.set('q', q.trim());
      if (state) params.set('status', state);

      const res = await fetch(`${apiUrl}/api/tenants?${params.toString()}`, {
        headers: { ...authHeaders },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudo cargar el listado');

      const normalized = normalizePageResponse(data);
      setRows(normalized.items);
      setMeta({ page: normalized.page, totalPages: normalized.totalPages, total: normalized.total });
      setStatusMsg({ tone: 'success', message: 'Listado actualizado' });
    } catch (e) {
      setStatusMsg({ tone: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function applyFilters() {
    setPage(1);
    fetchList(1);
  }

  async function createTenant(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          ...createForm,
          country_id: Number(createForm.country_id),
          default_currency_id: Number(createForm.default_currency_id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudo crear');

      setStatusMsg({ tone: 'success', message: 'Tenant creado' });
      setOpenCreate(false);
      setCreateForm({
        legal_name: '',
        trade_name: '',
        country_id: '',
        default_currency_id: '',
        timezone: 'UTC',
        default_language: 'es',
      });
      setPage(1);
      fetchList(1);
    } catch (e2) {
      setStatusMsg({ tone: 'error', message: e2.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Tenants</div>
          <h2 className="text-xl font-bold text-slate-900">Gestión de empresas</h2>
          <p className="text-sm text-slate-600">Filtra, navega y crea nuevos tenants desde el panel global.</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setOpenCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90"
          >
            <i className="bi bi-plus-lg" aria-hidden="true" />
            Agregar
          </button>
        </div>
      </div>

      {statusMsg?.message ? <StatusMessage tone={statusMsg.tone} message={statusMsg.message} /> : null}

      <div className="rounded-2xl bg-white border border-slate-200 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-600">Buscar</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Razón social o nombre comercial"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              />
            </div>

            <div className="w-44">
              <label className="text-xs font-semibold text-slate-600">Estado</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              >
                <option value="">Todos</option>
                <option value="active">Activo</option>
                <option value="suspended">Suspendido</option>
              </select>
            </div>
          </div>

          <button
            onClick={applyFilters}
            disabled={loading}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Aplicar
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-500">
                <th className="py-3">Empresa</th>
                <th className="py-3">País</th>
                <th className="py-3">Moneda</th>
                <th className="py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="py-3">
                    <div className="font-semibold text-slate-900">{r.legal_name}</div>
                    <div className="text-xs text-slate-500">{r.trade_name || '—'}</div>
                  </td>
                  <td className="py-3 text-slate-700">{r.country_id}</td>
                  <td className="py-3 text-slate-700">{r.default_currency_id}</td>
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${r.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-slate-500">
                    No hay resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Total: <span className="font-semibold text-slate-700">{meta.total}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={loading || meta.page <= 1}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Anterior
            </button>
            <div className="text-sm text-slate-700">
              {meta.page} / {meta.totalPages}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={loading || meta.page >= meta.totalPages}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      <Modal open={openCreate} title="Agregar tenant" onClose={() => setOpenCreate(false)}>
        <form onSubmit={createTenant} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700">Razón social</label>
            <input
              required
              value={createForm.legal_name}
              onChange={(e) => setCreateForm((p) => ({ ...p, legal_name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">Nombre comercial</label>
            <input
              value={createForm.trade_name}
              onChange={(e) => setCreateForm((p) => ({ ...p, trade_name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-700">Country ID</label>
              <input
                required
                value={createForm.country_id}
                onChange={(e) => setCreateForm((p) => ({ ...p, country_id: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Currency ID</label>
              <input
                required
                value={createForm.default_currency_id}
                onChange={(e) => setCreateForm((p) => ({ ...p, default_currency_id: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-700">Timezone</label>
              <input
                value={createForm.timezone}
                onChange={(e) => setCreateForm((p) => ({ ...p, timezone: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Idioma</label>
              <select
                value={createForm.default_language}
                onChange={(e) => setCreateForm((p) => ({ ...p, default_language: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              >
                <option value="es">es</option>
                <option value="en">en</option>
              </select>
            </div>
          </div>

          <button
            disabled={loading}
            className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
          >
            {loading ? 'Guardando...' : 'Crear tenant'}
          </button>
        </form>
      </Modal>
    </section>
  );
}
