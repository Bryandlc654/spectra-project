import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../components/ToastProvider';

export default function ContractsListPage({ apiUrl, token }) {
    const api = useMemo(() => {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        const request = async (method, path, body = null) => {
            const opts = { method, headers };
            if (body) opts.body = JSON.stringify(body);
            const res = await fetch(`${apiUrl}${path}`, opts);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || 'Error');
            return data;
        };
        return { get: (p) => request('GET', p) };
    }, [apiUrl, token]);

    const [contracts, setContracts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        load();
    }, [api, page, statusFilter, debouncedSearch]);

    async function load() {
        setLoading(true);
        setErr('');
        try {
            const params = new URLSearchParams();
            params.set('page', String(page));
            if (statusFilter) params.set('status', statusFilter);
            if (debouncedSearch) params.set('q', debouncedSearch);

            // Endpoint Global de Contratos
            const res = await api.get(`/api/global-contracts?${params.toString()}`);
            let items = [];
            let pages = 1;

            if (Array.isArray(res)) {
                items = res;
            } else if (Array.isArray(res.data)) {
                items = res.data;
                pages = res.meta?.total_pages || 1;
            }

            setContracts(items);
            setTotalPages(Math.max(1, Number(pages) || 1));
        } catch (e) {
            setErr(e?.message || 'No se pudieron cargar los contratos globales');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
        return () => clearTimeout(t);
    }, [search]);

    const renderStatusBadge = (statusRaw) => {
        if (!statusRaw) return <span className="text-xs text-slate-500">Sin estado</span>;
        const status = String(statusRaw).toLowerCase();
        let cls = 'bg-slate-100 text-slate-700';
        if (status === 'active') cls = 'bg-emerald-50 text-emerald-700';
        else if (status === 'draft') cls = 'bg-slate-100 text-slate-700';
        else if (status === 'expired') cls = 'bg-red-50 text-red-700';
        else if (status === 'terminated') cls = 'bg-gray-200 text-gray-700';
        else if (status === 'pending') cls = 'bg-amber-50 text-amber-700';
        return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
                {status}
            </span>
        );
    };

    const formatDate = (val) => val ? new Date(val).toLocaleDateString() : '—';

    const renderEnvelopeStatus = (c) => {
        if (!c.envelope_status) return null;
        
        let color = 'bg-slate-100 text-slate-700';
        let icon = 'bi-file-earmark';
        
        const st = c.envelope_status.toLowerCase();
        
        if (st === 'completed' || st === 'signed') {
            color = 'bg-blue-50 text-blue-700';
            icon = 'bi-check-circle-fill';
        } else if (st === 'sent' || st === 'delivered') {
            color = 'bg-amber-50 text-amber-700';
            icon = 'bi-send';
        } else if (st === 'voided' || st === 'declined') {
            color = 'bg-red-50 text-red-700';
            icon = 'bi-x-circle';
        }
        
        return (
            <div className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
                <i className={`bi ${icon}`} />
                <span>Firma: {st}</span>
            </div>
        );
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Visor Global de Contratos</h3>
                    <p className="text-xs text-slate-500">
                        Todos los contratos de todas las empresas.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <select
                        value={statusFilter}
                        onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                        <option value="">Todos</option>
                        <option value="active">Activos</option>
                        <option value="draft">Borradores</option>
                        <option value="pending">Pendientes</option>
                        <option value="expired">Expirados</option>
                    </select>
                    <input
                        type="search"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        placeholder="Buscar..."
                        className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                    />
                </div>
            </div>

            {err && <div className="text-red-600 bg-red-50 p-3 rounded">{err}</div>}

            {loading && !contracts.length && (
                <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-2xl">
                    Cargando...
                </div>
            )}

            {!loading && !contracts.length && !err && (
                <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-2xl">
                    No hay contratos encontrados.
                </div>
            )}

            {contracts.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-4 py-3 text-left">Título / Ref</th>
                                <th className="px-4 py-3 text-left">Empresa (Tenant)</th>
                                <th className="px-4 py-3 text-left">Tipo</th>
                                <th className="px-4 py-3 text-left">Estado</th>
                                <th className="px-4 py-3 text-left">Fecha</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {contracts.map(c => (
                                <tr key={c.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-semibold text-slate-900">
                                        {c.title || c.subject || c.id}
                                        {c.reference && <div className="text-xs text-slate-500">{c.reference}</div>}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                        {c.company_name || c.company_id}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 capitalize">
                                        {c.type}
                                    </td>
                                    <td className="px-4 py-3">
                                        {renderStatusBadge(c.status)}
                                        {renderEnvelopeStatus(c)}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {formatDate(c.created_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                            <button
                                disabled={page <= 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="disabled:opacity-50"
                            >
                                Anterior
                            </button>
                            <span>Página {page} de {totalPages}</span>
                            <button
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => p + 1)}
                                className="disabled:opacity-50"
                            >
                                Siguiente
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
