import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../components/ToastProvider';

export default function EnvelopesPage({ apiUrl, token }) {
    const toast = useToast();
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
        return { 
            get: (p) => request('GET', p),
            post: (p, b) => request('POST', p, b)
        };
    }, [apiUrl, token]);

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
    const [selectedEnvelope, setSelectedEnvelope] = useState(null);

    // Create Modal State
    const [companies, setCompanies] = useState([]);
    const [contracts, setContracts] = useState([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState('');
    const [selectedContractId, setSelectedContractId] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        load();
    }, [api, page, statusFilter, search]);

    // Load companies for the modal
    useEffect(() => {
        if (isCreateModalOpen) {
            api.get('/api/tenants?per_page=100').then(res => {
                setCompanies(res.data || []);
            }).catch(console.error);
        }
    }, [isCreateModalOpen, api]);

    // Load contracts when company changes
    useEffect(() => {
        if (selectedCompanyId) {
            // We need an endpoint to list contracts. Reusing pagedCompanyIndex approach via tenant controller or global contract?
            // Actually, we don't have a direct "list all contracts for tenant" endpoint that returns simple list.
            // But we can use the tenant contracts endpoint.
            api.get(`/api/tenants/${selectedCompanyId}/contracts?per_page=100`).then(res => {
                setContracts(res.data || []);
            }).catch(console.error);
        } else {
            setContracts([]);
        }
    }, [selectedCompanyId, api]);

    async function load() {
        setLoading(true);
        setErr('');
        try {
            const params = new URLSearchParams();
            params.set('page', String(page));
            if (statusFilter) params.set('status', statusFilter);
            if (search) params.set('q', search.trim());

            const res = await api.get(`/api/envelopes?${params.toString()}`);
            let data = [];
            let pages = 1;

            if (Array.isArray(res)) {
                data = res;
            } else if (Array.isArray(res.data)) {
                data = res.data;
                pages = res.meta?.total_pages || 1;
            }

            setItems(data);
            setTotalPages(Math.max(1, Number(pages) || 1));
        } catch (e) {
            setErr(e?.message || 'No se pudieron cargar los sobres');
        } finally {
            setLoading(false);
        }
    }

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!selectedContractId) return;

        setCreating(true);
        try {
            await api.post('/api/envelopes', { contract_id: selectedContractId });
            toast.success('Contrato enviado para firma (Spectra Sign)');
            setIsCreateModalOpen(false);
            setSelectedCompanyId('');
            setSelectedContractId('');
            load();
        } catch (error) {
            toast.error(error.message || 'Error al crear el sobre');
        } finally {
            setCreating(false);
        }
    };

    const handleSync = async (id) => {
        try {
            await api.post(`/api/envelopes/${id}?action=sync`);
            toast.success('Estado sincronizado');
            load();
        } catch (e) {
            toast.error(e.message || 'Error al sincronizar');
        }
    };

    const handleVoid = async () => {
        if (!selectedEnvelope) return;
        try {
            await api.post(`/api/envelopes/${selectedEnvelope.id}?action=void`);
            toast.success('Sobre anulado');
            setIsVoidModalOpen(false);
            setSelectedEnvelope(null);
            load();
        } catch (e) {
            toast.error(e.message || 'Error al anular');
        }
    };

    const openVoidModal = (envelope) => {
        setSelectedEnvelope(envelope);
        setIsVoidModalOpen(true);
    };

    const signingLink = (envelope) => (
        envelope.sign_token
            ? `${window.location.origin}/sign/${envelope.sign_token}`
            : envelope.signing_url
    );

    const handleCopyLink = async (envelope) => {
        const link = signingLink(envelope);
        if (!link) {
            toast.error('Este sobre no tiene enlace de firma');
            return;
        }
        try {
            await navigator.clipboard.writeText(link);
            toast.success('Enlace de firma copiado');
        } catch {
            window.prompt('Copia el enlace de firma:', link);
        }
    };

    const renderStatusBadge = (statusRaw) => {
        const status = String(statusRaw).toLowerCase();
        let cls = 'bg-slate-100 text-slate-700';
        
        if (status === 'completed' || status === 'signed') cls = 'bg-emerald-50 text-emerald-700';
        else if (status === 'sent' || status === 'delivered') cls = 'bg-blue-50 text-blue-700';
        else if (status === 'voided' || status === 'declined') cls = 'bg-red-50 text-red-700';
        else if (status === 'created') cls = 'bg-slate-100 text-slate-700';

        return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
                {statusRaw}
            </span>
        );
    };

    const formatDate = (val) => val ? new Date(val).toLocaleString() : '—';

    return (
        <div className="space-y-5">
             <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Sobres de Firma</h3>
                    <p className="text-xs text-slate-500">
                        Firmas electrónicas con Spectra Sign (sin DocuSign).
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-600"
                    >
                        <i className="bi bi-plus-lg mr-1" />
                        Nuevo Sobre
                    </button>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                        <option value="">Todos</option>
                        <option value="sent">Enviados (Sent)</option>
                        <option value="delivered">Entregados (Delivered)</option>
                        <option value="completed">Completados (Signed)</option>
                        <option value="voided">Anulados (Voided)</option>
                    </select>
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar..."
                        className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                    />
                     <button
                        type="button"
                        onClick={() => { setPage(1); load(); }}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <i className="bi bi-arrow-repeat" />
                    </button>
                </div>
            </div>

            {err && <div className="text-red-600 bg-red-50 p-3 rounded">{err}</div>}

            {!loading && !items.length && !err && (
                <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-2xl">
                    No hay sobres registrados.
                </div>
            )}

            {items.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-4 py-3 text-left">Envelope ID</th>
                                <th className="px-4 py-3 text-left">Contrato / Tenant</th>
                                <th className="px-4 py-3 text-left">Estado</th>
                                <th className="px-4 py-3 text-left">Último Evento</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {items.map(e => (
                                <tr key={e.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                                        {e.envelope_id || e.id}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-slate-900">{e.contract_title || 'Sin título'}</div>
                                        <div className="text-xs text-slate-500">{e.company_name || 'Tenant desconocido'}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {renderStatusBadge(e.status)}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 text-xs">
                                        {formatDate(e.last_event_at)}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            {e.signing_url && (e.status === 'sent' || e.status === 'delivered') && (
                                                <button
                                                    onClick={() => window.open(signingLink(e), '_blank', 'noopener')}
                                                    className="text-emerald-600 hover:text-emerald-800 text-xs font-semibold"
                                                    title="Abrir portal de firma"
                                                >
                                                    Firmar
                                                </button>
                                            )}
                                            {e.sign_token && e.status !== 'voided' && (
                                                <button
                                                    onClick={() => handleCopyLink(e)}
                                                    className="text-slate-600 hover:text-slate-900 text-xs font-semibold"
                                                    title="Copiar enlace de firma"
                                                >
                                                    Copiar
                                                </button>
                                            )}
                                            {e.pdf_url && (
                                                <button
                                                    onClick={() => window.open(e.pdf_url, '_blank', 'noopener')}
                                                    className="text-brand hover:text-brand-600 text-xs font-semibold"
                                                    title="Descargar PDF firmado"
                                                >
                                                    PDF
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => handleSync(e.id)}
                                                className="text-brand hover:text-brand-600 text-xs font-semibold"
                                                title="Sincronizar estado"
                                            >
                                                Sync
                                            </button>
                                            {e.status !== 'voided' && e.status !== 'completed' && (
                                                <button 
                                                    onClick={() => openVoidModal(e)}
                                                    className="text-red-600 hover:text-red-800 text-xs font-semibold"
                                                    title="Anular sobre"
                                                >
                                                    Anular
                                                </button>
                                            )}
                                        </div>
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

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                        <h3 className="mb-4 text-lg font-bold text-slate-900">Nuevo Sobre de Firma</h3>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-700">Empresa (Tenant)</label>
                                <select 
                                    className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                    value={selectedCompanyId}
                                    onChange={e => {
                                        setSelectedCompanyId(e.target.value);
                                        setSelectedContractId('');
                                    }}
                                    required
                                >
                                    <option value="">Seleccione una empresa</option>
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.legal_name || c.trade_name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-700">Contrato</label>
                                <select 
                                    className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                    value={selectedContractId}
                                    onChange={e => setSelectedContractId(e.target.value)}
                                    required
                                    disabled={!selectedCompanyId}
                                >
                                    <option value="">Seleccione un contrato</option>
                                    {contracts.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.title || c.reference || 'Sin título'} ({c.status})
                                        </option>
                                    ))}
                                </select>
                                {selectedCompanyId && contracts.length === 0 && (
                                    <p className="mt-1 text-xs text-slate-500">No hay contratos disponibles para esta empresa.</p>
                                )}
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating || !selectedContractId}
                                    className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50"
                                >
                                    {creating ? 'Enviando...' : 'Crear y Enviar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Void Modal */}
            {isVoidModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                        <h3 className="mb-2 text-lg font-bold text-slate-900">Confirmar Anulación</h3>
                        <p className="mb-6 text-sm text-slate-600">
                            ¿Estás seguro de que deseas anular el sobre 
                            <span className="font-mono font-bold mx-1">{selectedEnvelope?.envelope_id}</span>?
                            Esta acción no se puede deshacer.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setIsVoidModalOpen(false)}
                                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleVoid}
                                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
                            >
                                Anular Sobre
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
