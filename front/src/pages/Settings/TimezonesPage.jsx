import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import StatusMessage from '../../components/StatusMessage';
import { apiFetch } from '../../lib/api';

function ConfirmDeleteModal({ open, title = 'Confirmar eliminación', description, onClose, onConfirm, loading }) {
    return (
        <Modal open={open} title={title} onClose={onClose}>
            <div className="space-y-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {description}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        disabled={loading}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        disabled={loading}
                    >
                        {loading ? 'Eliminando...' : 'Sí, eliminar'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

export default function TimezonesPage({ apiUrl, token }) {
    const [q, setQ] = useState('');
    const [page, setPage] = useState(1);
    const [perPage] = useState(10);

    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null);

    const [rows, setRows] = useState([]);
    const [meta, setMeta] = useState({ page: 1, per_page: 10, total: 0, total_pages: 1 });

    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(null);

    const [name, setName] = useState('');

    // delete modal
    const [openDelete, setOpenDelete] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [deletingBusy, setDeletingBusy] = useState(false);

    const canPrev = meta.page > 1;
    const canNext = meta.page < meta.total_pages;

    const title = useMemo(() => (editing ? 'Editar zona horaria' : 'Nueva zona horaria'), [editing]);

    async function load() {
        setLoading(true);
        setStatus(null);
        try {
            const data = await apiFetch(apiUrl, '/api/timezones', {
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
        setName('');
        setOpen(true);
    }

    function openEdit(row) {
        setEditing(row);
        setName(row.name || '');
        setOpen(true);
    }

    async function submit(e) {
        e.preventDefault();
        setStatus(null);

        const payload = { name: name.trim() };

        try {
            if (!payload.name) {
                setStatus({ tone: 'error', message: 'El nombre es requerido.' });
                return;
            }

            if (editing?.id) {
                await apiFetch(apiUrl, `/api/timezones/${editing.id}`, { token, method: 'PUT', body: payload });
                setStatus({ tone: 'success', message: 'Zona horaria actualizada' });
            } else {
                await apiFetch(apiUrl, '/api/timezones', { token, method: 'POST', body: payload });
                setStatus({ tone: 'success', message: 'Zona horaria creada' });
            }
            setOpen(false);
            await load();
        } catch (e2) {
            setStatus({ tone: 'error', message: e2.message });
        }
    }

    function askRemove(row) {
        setDeleting(row);
        setOpenDelete(true);
    }

    async function confirmRemove() {
        if (!deleting?.id) return;
        setDeletingBusy(true);
        setStatus(null);
        try {
            await apiFetch(apiUrl, `/api/timezones/${deleting.id}`, { token, method: 'DELETE' });
            setStatus({ tone: 'success', message: 'Zona horaria eliminada' });
            setOpenDelete(false);
            setDeleting(null);

            // Si borraste el último registro de la página, retrocede una página si corresponde
            if (rows.length === 1 && page > 1) setPage((p) => p - 1);
            else await load();
        } catch (e) {
            setStatus({ tone: 'error', message: e.message });
        } finally {
            setDeletingBusy(false);
        }
    }

    return (
        <div className="p-4 md:p-6 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-slate-900">Zonas horarias</h1>
                    <p className="text-sm text-slate-600">Gestiona el catálogo de zonas horarias para empresas.</p>
                </div>

                <button
                    onClick={openCreate}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90"
                    type="button"
                >
                    <i className="bi bi-plus-lg" aria-hidden="true" />
                    Agregar zona horaria
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
                            placeholder="Buscar por nombre…"
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
                                <th className="px-4 py-3 font-semibold">Nombre</th>
                                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td className="px-4 py-5 text-slate-500" colSpan={2}>
                                        Cargando…
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td className="px-4 py-5 text-slate-500" colSpan={2}>
                                        Sin resultados.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((r) => (
                                    <tr key={r.id} className="hover:bg-slate-50/60">
                                        <td className="px-4 py-3 text-slate-900 font-semibold">{r.name}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-2">
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

            {/* Create/Edit modal */}
            <Modal open={open} title={title} onClose={() => setOpen(false)}>
                <form onSubmit={submit} className="space-y-4">
                    <div>
                        <label className="text-sm font-semibold text-slate-700">Nombre</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="America/Lima"
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
                            required
                        />
                        <p className="mt-1 text-xs text-slate-500">
                            Usa el identificador IANA (ej: <span className="font-semibold">America/Lima</span>).
                        </p>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Cancelar
                        </button>
                        <button className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90" type="submit">
                            {editing ? 'Guardar cambios' : 'Crear'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete confirm modal */}
            <ConfirmDeleteModal
                open={openDelete}
                onClose={() => {
                    if (deletingBusy) return;
                    setOpenDelete(false);
                    setDeleting(null);
                }}
                loading={deletingBusy}
                description={
                    deleting
                        ? `Vas a eliminar la zona horaria "${deleting.name}". Esta acción no se puede deshacer.`
                        : 'Vas a eliminar este registro.'
                }
                onConfirm={confirmRemove}
            />
        </div>
    );
}
