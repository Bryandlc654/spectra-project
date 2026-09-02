import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import StatusMessage from '../../components/StatusMessage';
import FiscalParametersModal from './FiscalParametersModal';
import { apiFetch } from '../../lib/api';

export default function CountriesPage({ apiUrl, token }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, per_page: 10, total: 0, total_pages: 1 });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [iso2, setIso2] = useState('');
  const [name, setName] = useState('');

  const [fiscalCountry, setFiscalCountry] = useState(null);

  // ---- Delete modal state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingRow, setDeletingRow] = useState(null);

  const canPrev = meta.page > 1;
  const canNext = meta.page < meta.total_pages;

  const title = useMemo(() => (editing ? 'Editar país' : 'Nuevo país'), [editing]);

  async function load() {
    setLoading(true);
    setStatus(null);
    try {
      const data = await apiFetch(apiUrl, '/api/countries', {
        token,
        params: { page, per_page: perPage, q },
      });
      setRows(data?.data || []);
      setMeta(data?.meta || { page, per_page: perPage, total: 0, total_pages: 1 });
    } catch (e) {
      setStatus({ tone: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function openCreate() {
    setEditing(null);
    setIso2('');
    setName('');
    setOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setIso2(row.iso2 || '');
    setName(row.name || '');
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setStatus(null);

    const payload = { iso2: iso2.trim().toUpperCase(), name: name.trim() };

    try {
      if (editing?.id) {
        await apiFetch(apiUrl, `/api/countries/${editing.id}`, { token, method: 'PUT', body: payload });
        setStatus({ tone: 'success', message: 'País actualizado' });
      } else {
        await apiFetch(apiUrl, '/api/countries', { token, method: 'POST', body: payload });
        setStatus({ tone: 'success', message: 'País creado' });
      }
      setOpen(false);
      await load();
    } catch (e2) {
      setStatus({ tone: 'error', message: e2.message });
    }
  }

  function askRemove(row) {
    setDeletingRow(row);
    setDeleteOpen(true);
  }

  async function confirmRemove() {
    if (!deletingRow?.id) return;
    setDeleting(true);
    setStatus(null);
    try {
      await apiFetch(apiUrl, `/api/countries/${deletingRow.id}`, { token, method: 'DELETE' });
      setStatus({ tone: 'success', message: 'País eliminado' });
      setDeleteOpen(false);
      setDeletingRow(null);

      // Ajuste de paginación: si borras el último ítem de la página, retrocede una
      const willBeEmpty = rows.length === 1 && page > 1;
      if (willBeEmpty) setPage((p) => Math.max(1, p - 1));
      else await load();
    } catch (e) {
      setStatus({ tone: 'error', message: e.message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Países y Fiscalidad</h1>
          <p className="text-sm text-slate-600">Gestión de países, impuestos y parámetros fiscales por región.</p>
        </div>

        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90"
          type="button"
        >
          <i className="bi bi-plus-lg" aria-hidden="true" />
          Agregar país
        </button>
      </div>

      {status?.message ? <StatusMessage tone={status.tone} message={status.message} /> : null}

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o ISO2…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setPage(1);
              load();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <i className="bi bi-arrow-repeat" aria-hidden="true" />
            Buscar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600">
                <th className="px-4 py-3 font-semibold">ISO2</th>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={3}>
                    Cargando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-5 text-slate-500" colSpan={3}>
                    Sin resultados.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold text-slate-900">{r.iso2}</td>
                    <td className="px-4 py-3 text-slate-700">{r.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setFiscalCountry(r)}
                          className="h-9 w-9 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 grid place-items-center"
                          title="Parámetros Fiscales"
                        >
                          <i className="bi bi-bank" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="h-9 w-9 rounded-xl border border-slate-200 hover:bg-slate-50 grid place-items-center"
                          title="Editar"
                        >
                          <i className="bi bi-pencil" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => askRemove(r)}
                          className="h-9 w-9 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 grid place-items-center"
                          title="Eliminar"
                        >
                          <i className="bi bi-trash" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-600">
            Total: <span className="font-semibold text-slate-900">{meta.total}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!canPrev}
              type="button"
            >
              <i className="bi bi-chevron-left" aria-hidden="true" />
            </button>
            <div className="text-sm font-semibold text-slate-700">
              {meta.page} / {meta.total_pages}
            </div>
            <button
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}
              disabled={!canNext}
              type="button"
            >
              <i className="bi bi-chevron-right" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL CREATE/EDIT */}
      <Modal open={open} title={title} onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700">ISO2</label>
            <input
              value={iso2}
              onChange={(e) => setIso2(e.target.value)}
              placeholder="PE"
              maxLength={2}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              required
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Perú"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90"
              type="submit"
            >
              {editing ? 'Guardar cambios' : 'Crear'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL DELETE (sin alert/confirm) */}
      <Modal
        open={deleteOpen}
        title="Eliminar país"
        onClose={() => {
          if (deleting) return;
          setDeleteOpen(false);
          setDeletingRow(null);
        }}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-extrabold">Esta acción no se puede deshacer.</div>
            <div className="mt-1">
              Vas a eliminar el país:{' '}
              <span className="font-semibold">{deletingRow?.name || '—'}</span>
              {deletingRow?.iso2 ? (
                <span className="text-red-700"> ({String(deletingRow.iso2).toUpperCase()})</span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                setDeleteOpen(false);
                setDeletingRow(null);
              }}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={deleting}
              onClick={confirmRemove}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              <i className="bi bi-trash3" aria-hidden="true" />
              {deleting ? 'Eliminando…' : 'Sí, eliminar'}
            </button>
          </div>
        </div>
      </Modal>

      <FiscalParametersModal 
        country={fiscalCountry} 
        onClose={() => setFiscalCountry(null)}
        apiUrl={apiUrl}
        token={token}
      />
    </div>
  );
}
