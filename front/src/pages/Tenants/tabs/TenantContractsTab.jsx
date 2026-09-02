import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../../components/ToastProvider';
import Modal from '../../../components/Modal';

export default function TenantContractsTab({ companyId, api }) {
    const toast = useToast();
    const safeApi = useMemo(() => api, [api]);

    const [searchParams] = useSearchParams();
    const [contracts, setContracts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [currencies, setCurrencies] = useState([]);

    // Create Modal State
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [creating, setCreating] = useState(false);

    // Edit Modal State
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingContract, setEditingContract] = useState(null);
    const [editing, setEditing] = useState(false);

    // Terminate Modal State
    const [terminateModalOpen, setTerminateModalOpen] = useState(false);
    const [terminatingContract, setTerminatingContract] = useState(null);
    const [terminating, setTerminating] = useState(false);

    // Amendment Modal State
    const [amendModalOpen, setAmendModalOpen] = useState(false);
    const [amendingContract, setAmendingContract] = useState(null);
    const [amending, setAmending] = useState(false);

    // Legal Modal State
    const [legalModalOpen, setLegalModalOpen] = useState(false);
    const [legalContract, setLegalContract] = useState(null);
    const [members, setMembers] = useState([]);
    const [observations, setObservations] = useState([]);
    const [loadingLegal, setLoadingLegal] = useState(false);

    const [reloadKey, setReloadKey] = useState(0);

    // Load members for legal assignment
    useEffect(() => {
        if (!companyId || !legalModalOpen) return;
        safeApi.get(`/api/tenants/${companyId}/members`)
            .then(res => setMembers(res.data || res))
            .catch(console.error);
    }, [companyId, legalModalOpen, safeApi]);

    const handleExportLegal = async () => {
        try {
            const response = await safeApi.get(`/api/tenants/${companyId}/contracts/export-legal`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `contracts_legal_export_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (e) {
            console.error(e);
            toast.error('Error al exportar datos legales');
        }
    };

    const handleOpenLegal = async (contract) => {
        setLegalContract(contract);
        setLegalModalOpen(true);
        setLoadingLegal(true);
        try {
            const obs = await safeApi.get(`/api/tenants/${companyId}/contracts/${contract.id}/legal-observations`);
            setObservations(obs || []);
        } catch (e) {
            console.error(e);
            toast.error('Error al cargar observaciones');
        } finally {
            setLoadingLegal(false);
        }
    };

    const handleAssignLegal = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const reviewerId = formData.get('legal_reviewer_id');
        
        try {
            await safeApi.post(`/api/tenants/${companyId}/contracts/${legalContract.id}/assign-legal`, {
                legal_reviewer_id: reviewerId || null
            });
            toast.success('Asignación actualizada');
            forceReload();
            // Update local state
            setLegalContract(prev => ({ ...prev, legal_reviewer_id: reviewerId, legal_status: reviewerId ? 'pending_review' : 'not_required' }));
        } catch (e) {
            console.error(e);
            toast.error('Error al asignar revisor');
        }
    };

    const handleLegalAction = async (status, observation) => {
        if (!observation && status !== 'approved') {
            toast.error('La observación es requerida para rechazar o solicitar cambios');
            return;
        }
        
        try {
            await safeApi.post(`/api/tenants/${companyId}/contracts/${legalContract.id}/legal-review`, {
                status,
                observation
            });
            toast.success('Revisión registrada');
            forceReload();
            setLegalModalOpen(false);
        } catch (e) {
            console.error(e);
            toast.error('Error al registrar revisión');
        }
    };

    useEffect(() => {
        if (!safeApi?.get || !companyId) return;

        let cancelled = false;
        async function load() {
            setLoading(true);
            setErr('');
            try {
                const params = new URLSearchParams();
                params.set('page', String(page));
                if (statusFilter) params.set('status', statusFilter);
                if (search) params.set('q', search.trim());

                const res = await safeApi.get(`/api/tenants/${companyId}/contracts?${params.toString()}`);
                let items = [];
                let pages = 1;

                if (Array.isArray(res)) {
                    items = res;
                } else if (Array.isArray(res.items)) {
                    items = res.items;
                    pages = res.pages || res.meta?.total_pages || 1;
                } else if (Array.isArray(res.data)) {
                    items = res.data;
                    pages = res.meta?.total_pages || res.pages || 1;
                }

                if (!cancelled) {
                    setContracts(items);
                    setTotalPages(Math.max(1, Number(pages) || 1));
                }
            } catch (e) {
                if (!cancelled) {
                    setErr(e?.message || 'No se pudieron cargar los contratos');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [safeApi, companyId, page, statusFilter, search, reloadKey]);

    const forceReload = () => setReloadKey(k => k + 1);

    // Freelancer Search State
    const [freelancerSearch, setFreelancerSearch] = useState('');
    const [freelancerResults, setFreelancerResults] = useState([]);
    const [searchingFreelancer, setSearchingFreelancer] = useState(false);
    const [selectedFreelancer, setSelectedFreelancer] = useState(null);
    const [showFreelancerResults, setShowFreelancerResults] = useState(false);

    useEffect(() => {
        const start = searchParams.get('start');
        const initialFreelancerId = searchParams.get('freelancer_id');
        if (start === 'create') {
            setCreateModalOpen(true);
        }
        if (initialFreelancerId) {
            safeApi.get(`/api/freelancers/${initialFreelancerId}`)
                .then(f => {
                    if (f && f.id) {
                        setSelectedFreelancer(f);
                    }
                })
                .catch(() => {});
        }
    }, [searchParams, safeApi]);

    useEffect(() => {
        if (!freelancerSearch || freelancerSearch.length < 2) {
            setFreelancerResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setSearchingFreelancer(true);
            try {
                const res = await safeApi.get(`/api/freelancers?q=${freelancerSearch}`);
                setFreelancerResults(Array.isArray(res.data) ? res.data : []);
                setShowFreelancerResults(true);
            } catch (e) {
                console.error(e);
            } finally {
                setSearchingFreelancer(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [freelancerSearch, safeApi]);

    useEffect(() => {
        if (!safeApi?.get) return;
        safeApi.get('/api/currencies?per_page=100')
            .then(res => {
                const items = Array.isArray(res) ? res : (res.data || []);
                setCurrencies(items);
            })
            .catch(() => {});
    }, [safeApi]);

    const handleSelectFreelancer = (f) => {
        setSelectedFreelancer(f);
        setFreelancerSearch('');
        setShowFreelancerResults(false);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!companyId) return;
        
        setCreating(true);
        try {
            const formData = new FormData(e.target);
            const payload = {
                title: formData.get('title'),
                type: formData.get('type'),
                freelancer_id: selectedFreelancer?.id || formData.get('freelancer_id') || null,
                currency_id: formData.get('currency_id'),
                rate: formData.get('rate'),
                start_date: formData.get('start_date'),
                end_date: formData.get('end_date') || null,
            };

            await safeApi.post(`/api/tenants/${companyId}/contracts`, payload);
            toast.success('Contrato creado exitosamente');
            setCreateModalOpen(false);
            // Reset states
            setSelectedFreelancer(null);
            setFreelancerSearch('');
            forceReload();
        } catch (error) {
            console.error(error);
            toast.error(error?.message || 'Error al crear el contrato');
        } finally {
            setCreating(false);
        }
    };

    const [signing, setSigning] = useState(null);

    const handleSign = async (contract) => {
        if (!window.confirm(`¿Enviar "${contract.title}" para firma digital?`)) return;
        
        setSigning(contract.id);
        try {
            await safeApi.post('/api/envelopes', { contract_id: contract.id });
            toast.success('Contrato enviado para firma');
            forceReload();
        } catch (error) {
            console.error(error);
            toast.error(error?.message || 'Error al enviar contrato');
        } finally {
            setSigning(null);
        }
    };

    const handleEdit = (contract) => {
        setEditingContract(contract);
        setEditModalOpen(true);
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        if (!companyId || !editingContract) return;

        setEditing(true);
        try {
            const formData = new FormData(e.target);
            const payload = {
                title: formData.get('title'),
                rate: formData.get('rate'),
                start_date: formData.get('start_date'),
                end_date: formData.get('end_date') || null,
                scope_of_work: formData.get('scope_of_work'),
                special_clause: formData.get('special_clause'),
                notice_period: formData.get('notice_period'),
                status: formData.get('status'),
            };

            await safeApi.put(`/api/tenants/${companyId}/contracts/${editingContract.id}`, payload);
            toast.success('Contrato actualizado exitosamente');
            setEditModalOpen(false);
            forceReload();
        } catch (error) {
            console.error(error);
            toast.error(error?.message || 'Error al actualizar el contrato');
        } finally {
            setEditing(false);
        }
    };

    const handleTerminate = (contract) => {
        setTerminatingContract(contract);
        setTerminateModalOpen(true);
    };

    const handleTerminateSubmit = async (e) => {
        e.preventDefault();
        if (!companyId || !terminatingContract) return;

        setTerminating(true);
        try {
            const formData = new FormData(e.target);
            const payload = {
                end_date: formData.get('end_date'),
                reason: formData.get('reason'),
            };

            await safeApi.post(`/api/tenants/${companyId}/contracts/${terminatingContract.id}/terminate`, payload);
            toast.success('Contrato terminado exitosamente');

            // Trigger Offboarding
            if (terminatingContract.freelancer_id) {
                try {
                    await safeApi.post('/api/onboarding/trigger-offboarding', { user_id: terminatingContract.freelancer_id });
                    toast.success('Proceso de offboarding iniciado');
                } catch (offErr) {
                    console.error('Error triggering offboarding:', offErr);
                    // Don't block the UI, just warn
                    toast.warning('Contrato terminado, pero falló inicio de offboarding');
                }
            }

            setTerminateModalOpen(false);
            forceReload();
        } catch (error) {
            console.error(error);
            toast.error(error?.message || 'Error al terminar el contrato');
        } finally {
            setTerminating(false);
        }
    };

    // Amendments List Modal State
    const [viewAmendmentsModalOpen, setViewAmendmentsModalOpen] = useState(false);
    const [currentAmendments, setCurrentAmendments] = useState([]);
    const [loadingAmendments, setLoadingAmendments] = useState(false);
    const [selectedContractForAmendments, setSelectedContractForAmendments] = useState(null);

    const handleViewAmendments = async (contract) => {
        setSelectedContractForAmendments(contract);
        setViewAmendmentsModalOpen(true);
        setLoadingAmendments(true);
        try {
            const res = await safeApi.get(`/api/tenants/${companyId}/contracts/${contract.id}/amendments`);
            setCurrentAmendments(Array.isArray(res) ? res : (res.data || []));
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar enmiendas');
        } finally {
            setLoadingAmendments(false);
        }
    };

    const handleSignAmendment = async (amendment) => {
        if (!window.confirm(`¿Enviar enmienda para firma digital?`)) return;
        
        try {
            await safeApi.post('/api/envelopes', { amendment_id: amendment.id });
            toast.success('Enmienda enviada para firma');
            // Reload amendments list
            handleViewAmendments(selectedContractForAmendments);
        } catch (error) {
            console.error(error);
            toast.error(error?.message || 'Error al enviar enmienda');
        }
    };

    const handleAmend = (contract) => {
        setAmendingContract(contract);
        setAmendModalOpen(true);
    };

    const handleAmendSubmit = async (e) => {
        e.preventDefault();
        if (!companyId || !amendingContract) return;

        setAmending(true);
        try {
            const formData = new FormData(e.target);
            const payload = {
                title: formData.get('title'),
                rate: formData.get('rate'),
                start_date: formData.get('start_date'),
                end_date: formData.get('end_date') || null,
                scope_of_work: formData.get('scope_of_work'),
                special_clause: formData.get('special_clause'),
            };

            await safeApi.post(`/api/tenants/${companyId}/contracts/${amendingContract.id}/amend`, payload);
            toast.success('Enmienda creada y registrada');
            setAmendModalOpen(false);
            forceReload();
        } catch (error) {
            console.error(error);
            toast.error(error?.message || 'Error al crear enmienda');
        } finally {
            setAmending(false);
        }
    };

    const formatDate = (value) => {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleDateString();
    };

    const renderStatusBadge = (statusRaw) => {
        if (!statusRaw) return <span className="text-xs text-slate-500">Sin estado</span>;
        const status = String(statusRaw).toLowerCase();
        let cls = 'bg-slate-100 text-slate-700';
        
        if (status === 'draft') cls = 'bg-slate-100 text-slate-700';
        else if (status === 'active') cls = 'bg-emerald-50 text-emerald-700';
        else if (status === 'expired') cls = 'bg-red-50 text-red-700';
        else if (status === 'terminated') cls = 'bg-gray-200 text-gray-700';
        else if (status === 'pending') cls = 'bg-amber-50 text-amber-700';

        return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
                {status || 'Desconocido'}
            </span>
        );
    };

    const renderLegalStatus = (statusRaw) => {
        if (!statusRaw || statusRaw === 'not_required') return null;
        const status = String(statusRaw).toLowerCase();
        
        let cls = 'bg-slate-100 text-slate-600';
        let icon = 'bi-shield';
        let label = 'Legal';

        if (status === 'pending_review') {
            cls = 'bg-amber-50 text-amber-700';
            icon = 'bi-hourglass-split';
            label = 'Revisión Pendiente';
        } else if (status === 'in_review') {
            cls = 'bg-blue-50 text-blue-700';
            icon = 'bi-eye';
            label = 'En Revisión';
        } else if (status === 'approved') {
            cls = 'bg-emerald-50 text-emerald-700';
            icon = 'bi-shield-check';
            label = 'Aprobado Legal';
        } else if (status === 'rejected') {
            cls = 'bg-red-50 text-red-700';
            icon = 'bi-shield-x';
            label = 'Rechazado Legal';
        } else if (status === 'changes_requested') {
            cls = 'bg-orange-50 text-orange-700';
            icon = 'bi-pencil-square';
            label = 'Cambios Solicitados';
        }

        return (
            <span className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium border border-transparent ${cls}`}>
                <i className={`bi ${icon}`}></i>
                {label}
            </span>
        );
    };

    const renderEnvelopeStatus = (c) => {
        if (!c.envelope_status) return null;
        
        let cls = 'bg-slate-100 text-slate-700';
        let label = c.envelope_status;

        if (c.envelope_status === 'sent') {
            cls = 'bg-blue-50 text-blue-700';
            label = 'Enviado';
        } else if (c.envelope_status === 'signed' || c.envelope_status === 'completed') {
            cls = 'bg-emerald-50 text-emerald-700';
            label = 'Firmado';
        } else if (c.envelope_status === 'voided') {
            cls = 'bg-gray-100 text-gray-500';
            label = 'Anulado';
        }

        return (
             <div className="mt-1">
                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium border border-transparent ${cls}`}>
                    <i className="bi bi-pen"></i>
                    {label}
                </span>
            </div>
        );
    };

    const handleCopyId = (id) => {
        if (!id || typeof navigator === 'undefined' || !navigator.clipboard) return;
        navigator.clipboard.writeText(String(id)).then(
            () => toast.success('ID copiado'),
            () => {}
        );
    };

    if (!safeApi?.get) {
        return (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                API no inicializada para este tab.
            </div>
        );
    }

    if (loading && !contracts.length && !err) {
        return <div className="py-8 text-center text-slate-500">Cargando contratos…</div>;
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Contratos</h3>
                    <p className="text-xs text-slate-500">
                        Listado de contratos asociados a este tenant.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <select
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                        <option value="">Todos los estados</option>
                        <option value="draft">Borrador</option>
                        <option value="active">Activo</option>
                        <option value="pending">Pendiente</option>
                        <option value="expired">Expirado</option>
                        <option value="terminated">Terminado</option>
                    </select>

                    <input
                        type="search"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Buscar por título, ref…"
                        className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                    />

                    <button
                        type="button"
                        onClick={forceReload}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <i className="bi bi-arrow-repeat" />
                        Refrescar
                    </button>

                    <button
                        type="button"
                        onClick={handleExportLegal}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        title="Exportar datos legales"
                    >
                        <i className="bi bi-file-earmark-spreadsheet" />
                        Exportar
                    </button>

                    <button
                        type="button"
                        onClick={() => setCreateModalOpen(true)}
                        className="inline-flex items-center gap-1 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90"
                    >
                        <i className="bi bi-plus-lg" />
                        Nuevo Contrato
                    </button>
                </div>
            </div>

            {err && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                    {err}
                </div>
            )}

            {!contracts.length && !loading && !err && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    No hay contratos registrados para este tenant.
                </div>
            )}

            {contracts.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-4 py-3 text-left">Título / Referencia</th>
                                <th className="px-4 py-3 text-left">Estado</th>
                                <th className="px-4 py-3 text-left">Tipo</th>
                                <th className="px-4 py-3 text-left">Inicio</th>
                                <th className="px-4 py-3 text-left">Fin</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {contracts.map((c) => {
                                const title = c.title || c.name || c.subject || c.id;
                                const ref = c.reference || c.contract_number || '';
                                const type = c.type || c.contract_type || '—';
                                const start = c.start_date || c.starts_at || c.created_at;
                                const end = c.end_date || c.ends_at || null;

                                return (
                                    <tr key={c.id || `${title}-${ref}`} className="hover:bg-slate-50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-slate-900">
                                                    {title || 'Sin título'}
                                                </span>
                                                {c.id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyId(c.id)}
                                                        className="text-slate-400 hover:text-brand"
                                                        title="Copiar ID"
                                                    >
                                                        <i className="bi bi-clipboard" />
                                                    </button>
                                                )}
                                            </div>
                                            {ref && (
                                                <div className="text-xs text-slate-500 font-mono">
                                                    Ref: {ref}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {renderStatusBadge(c.status)}
                                            {renderEnvelopeStatus(c)}
                                            {renderLegalStatus(c.legal_status)}
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">
                                            {type}
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                                            {formatDate(start)}
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                                            {end ? formatDate(end) : 'Indefinido'}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEdit(c)}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand"
                                                    title="Editar"
                                                >
                                                    <i className="bi bi-pencil" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenLegal(c)}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                                                    title="Revisión Legal"
                                                >
                                                    <i className="bi bi-shield-check" />
                                                </button>
                                                {c.status === 'active' && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewAmendments(c)}
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-purple-50 hover:text-purple-600"
                                                            title="Historial de Enmiendas"
                                                        >
                                                            <i className="bi bi-clock-history" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAmend(c)}
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                                                            title="Crear Enmienda"
                                                        >
                                                            <i className="bi bi-file-earmark-diff" />
                                                        </button>
                                                    </>
                                                )}
                                                {c.status !== 'terminated' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleTerminate(c)}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                                                        title="Terminar Contrato"
                                                    >
                                                        <i className="bi bi-x-lg" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                            <button
                                type="button"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                                <i className="bi bi-chevron-left" />
                                Anterior
                            </button>
                            <span>
                                Página {page} de {totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={page >= totalPages}
                                onClick={() => setPage((p) => p + 1)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                                Siguiente
                                <i className="bi bi-chevron-right" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Create Modal */}
            <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Nuevo Contrato">
                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Título del Contrato</label>
                        <input
                            required
                            name="title"
                            type="text"
                            placeholder="Ej. Desarrollo Web Frontend"
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
                            <select
                                name="type"
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                            >
                                <option value="fixed">Fixed Rate</option>
                                <option value="hourly">Hourly</option>
                                <option value="milestone">Milestone</option>
                                <option value="retainer">Retainer</option>
                            </select>
                        </div>
                        <div className="relative">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Freelancer</label>
                            {selectedFreelancer ? (
                                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs text-emerald-700 font-bold">
                                            {selectedFreelancer.full_name?.charAt(0) || 'F'}
                                        </div>
                                        <div className="truncate text-sm font-medium text-emerald-900">
                                            {selectedFreelancer.full_name}
                                            <span className="ml-1 text-xs font-normal text-emerald-600">({selectedFreelancer.email})</span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedFreelancer(null)}
                                        className="text-emerald-500 hover:text-emerald-700"
                                    >
                                        <i className="bi bi-x-lg" />
                                    </button>
                                    <input type="hidden" name="freelancer_id" value={selectedFreelancer.id} />
                                </div>
                            ) : (
                                <>
                                    <div className="relative">
                                        <i className="bi bi-search absolute left-3 top-2.5 text-slate-400"></i>
                                        <input
                                            type="text"
                                            value={freelancerSearch}
                                            onChange={(e) => {
                                                setFreelancerSearch(e.target.value);
                                                setShowFreelancerResults(true);
                                            }}
                                            onFocus={() => setShowFreelancerResults(true)}
                                            placeholder="Buscar freelancer por nombre..."
                                            className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                                            autoComplete="off"
                                        />
                                        {searchingFreelancer && (
                                            <div className="absolute right-3 top-2.5">
                                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand"></div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {showFreelancerResults && freelancerResults.length > 0 && (
                                        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                                            {freelancerResults.map(f => (
                                                <button
                                                    key={f.id}
                                                    type="button"
                                                    onClick={() => handleSelectFreelancer(f)}
                                                    className="w-full px-4 py-2 text-left hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50 last:border-0"
                                                >
                                                    <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                                                        {f.full_name?.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium text-slate-900">{f.full_name}</div>
                                                        <div className="text-xs text-slate-500">{f.email} • {f.area || 'General'}</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Fecha Inicio</label>
                            <input
                                required
                                name="start_date"
                                type="date"
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Fecha Fin (Opcional)</label>
                            <input
                                name="end_date"
                                type="date"
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Moneda</label>
                            <select
                                name="currency_id"
                                required
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                                defaultValue=""
                            >
                                <option value="" disabled>Selecciona una moneda</option>
                                {currencies.map(c => (
                                    <option key={c.id} value={String(c.id)}>
                                        {c.code} — {c.name}{c.symbol ? ` (${c.symbol})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Tarifa / Monto</label>
                            <input
                                name="rate"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setCreateModalOpen(false)}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={creating}
                            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                        >
                            {creating ? 'Creando...' : 'Crear Contrato'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Edit Modal */}
            <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Editar Contrato">
                <form onSubmit={handleEditSubmit} className="space-y-4">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Título del Contrato</label>
                        <input
                            required
                            name="title"
                            type="text"
                            defaultValue={editingContract?.title}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Tarifa</label>
                            <input
                                name="rate"
                                type="number"
                                step="0.01"
                                defaultValue={editingContract?.rate}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Estado</label>
                            <select
                                name="status"
                                defaultValue={editingContract?.status}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                            >
                                <option value="draft">Borrador</option>
                                <option value="active">Activo</option>
                                <option value="pending">Pendiente</option>
                                <option value="expired">Expirado</option>
                                <option value="terminated">Terminado</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Fecha Inicio</label>
                            <input
                                name="start_date"
                                type="date"
                                defaultValue={editingContract?.start_date?.split('T')[0]}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Fecha Fin</label>
                            <input
                                name="end_date"
                                type="date"
                                defaultValue={editingContract?.end_date?.split('T')[0]}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Alcance del Trabajo (Scope)</label>
                        <textarea
                            name="scope_of_work"
                            rows={3}
                            defaultValue={editingContract?.scope_of_work}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Cláusula Especial</label>
                        <textarea
                            name="special_clause"
                            rows={2}
                            defaultValue={editingContract?.special_clause}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                        />
                    </div>
                    
                    <div>
                         <label className="mb-1 block text-sm font-medium text-slate-700">Periodo de Aviso (Días)</label>
                         <input
                            name="notice_period"
                            type="number"
                            defaultValue={editingContract?.notice_period}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setEditModalOpen(false)}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={editing}
                            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                        >
                            {editing ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Amendment Modal */}
            <Modal open={amendModalOpen} onClose={() => setAmendModalOpen(false)} title="Crear Enmienda / Anexo">
                <form onSubmit={handleAmendSubmit} className="space-y-4">
                    <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
                        <p className="font-semibold">Modo Enmienda</p>
                        <p>Los cambios realizados aquí se registrarán como una enmienda legal o anexo al contrato actual.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Título del Anexo / Enmienda</label>
                            <input
                                name="amendment_title"
                                type="text"
                                defaultValue={`Enmienda ${new Date().toLocaleDateString()}`}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                                required
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Descripción / Notas Adicionales</label>
                            <textarea
                                name="amendment_description"
                                rows={2}
                                placeholder="Describe el propósito de este anexo..."
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                            />
                        </div>
                         <div className="col-span-2">
                            <label className="mb-1 block text-sm font-medium text-slate-700">URL del Documento (Opcional)</label>
                            <input
                                name="document_url"
                                type="text"
                                placeholder="https://..."
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                            />
                            <p className="text-xs text-slate-500 mt-1">Si ya tienes un documento firmado o generado, pega el enlace aquí.</p>
                        </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4 mt-4">
                        <h5 className="text-sm font-semibold text-slate-800 mb-3">Modificar Campos del Contrato (Opcional)</h5>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Título del Contrato</label>
                        <input
                            required
                            name="title"
                            type="text"
                            defaultValue={amendingContract?.title}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Nueva Tarifa</label>
                            <input
                                name="rate"
                                type="number"
                                step="0.01"
                                defaultValue={amendingContract?.rate}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Nueva Fecha Inicio</label>
                            <input
                                name="start_date"
                                type="date"
                                defaultValue={amendingContract?.start_date?.split('T')[0]}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Nueva Fecha Fin</label>
                            <input
                                name="end_date"
                                type="date"
                                defaultValue={amendingContract?.end_date?.split('T')[0]}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Alcance del Trabajo (Scope)</label>
                        <textarea
                            name="scope_of_work"
                            rows={3}
                            defaultValue={amendingContract?.scope_of_work}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Cláusula Especial</label>
                        <textarea
                            name="special_clause"
                            rows={2}
                            defaultValue={amendingContract?.special_clause}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                        />
                    </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setAmendModalOpen(false)}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={amending}
                            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {amending ? 'Guardando...' : 'Crear Enmienda'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* View Amendments Modal */}
            <Modal open={viewAmendmentsModalOpen} onClose={() => setViewAmendmentsModalOpen(false)} title="Historial de Enmiendas">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-slate-700">Enmiendas para: {selectedContractForAmendments?.title}</h4>
                        <button
                            onClick={() => {
                                setViewAmendmentsModalOpen(false);
                                handleAmend(selectedContractForAmendments);
                            }}
                            className="text-xs font-semibold text-brand hover:text-brand/80"
                        >
                            + Nueva Enmienda
                        </button>
                    </div>

                    {loadingAmendments ? (
                        <div className="py-8 text-center text-sm text-slate-500">Cargando historial...</div>
                    ) : currentAmendments.length === 0 ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                            No hay enmiendas registradas para este contrato.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {currentAmendments.map((amendment) => (
                                <div key={amendment.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                amendment.status === 'signed' ? 'bg-emerald-100 text-emerald-800' :
                                                amendment.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                                                'bg-slate-100 text-slate-800'
                                            }`}>
                                                {amendment.status === 'signed' ? 'Firmada' :
                                                 amendment.status === 'sent' ? 'Enviada' : 'Borrador'}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                {formatDate(amendment.created_at)}
                                            </span>
                                        </div>
                                        {amendment.status === 'draft' && (
                                            <button
                                                onClick={() => handleSignAmendment(amendment)}
                                                className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                                            >
                                                Enviar a Firma
                                            </button>
                                        )}
                                    </div>
                                    
                                    <div className="mb-2">
                                        <h5 className="font-semibold text-slate-900 text-sm">{amendment.title || 'Sin Título'}</h5>
                                        {amendment.description && (
                                            <p className="text-xs text-slate-600 mt-1">{amendment.description}</p>
                                        )}
                                        {amendment.document_url && (
                                            <a href={amendment.document_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline mt-1 inline-block">
                                                <i className="bi bi-paperclip mr-1"></i>Ver Documento
                                            </a>
                                        )}
                                    </div>

                                    <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                        <p className="font-semibold mb-1">Cambios:</p>
                                        <ul className="list-disc list-inside space-y-0.5">
                                            {(() => {
                                                try {
                                                    const changes = JSON.parse(amendment.changes_json);
                                                    if (!changes || Object.keys(changes).length === 0) {
                                                        return <li className="text-slate-400 italic">Solo documento/descripción</li>;
                                                    }
                                                    return Object.entries(changes).map(([field, vals]) => (
                                                        <li key={field}>
                                                            <span className="font-medium text-slate-800">{field}:</span> {vals.old} &rarr; {vals.new}
                                                        </li>
                                                    ));
                                                } catch (e) {
                                                    return <li>Error al leer cambios</li>;
                                                }
                                            })()}
                                        </ul>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            onClick={() => setViewAmendmentsModalOpen(false)}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Terminate Modal */}
            <Modal open={terminateModalOpen} onClose={() => setTerminateModalOpen(false)} title="Terminar Contrato">
                <form onSubmit={handleTerminateSubmit} className="space-y-4">
                    <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
                        <p className="font-semibold">¡Atención!</p>
                        <p>Esta acción finalizará el contrato permanentemente. Asegúrese de haber liquidado todos los pagos pendientes.</p>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Fecha de Terminación</label>
                        <input
                            required
                            name="end_date"
                            type="date"
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Motivo de Terminación</label>
                        <textarea
                            required
                            name="reason"
                            rows={3}
                            placeholder="Explique el motivo de la terminación..."
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setTerminateModalOpen(false)}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={terminating}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                            {terminating ? 'Terminando...' : 'Terminar Contrato'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Legal Review Modal */}
            <Modal open={legalModalOpen} onClose={() => setLegalModalOpen(false)} title="Gestión Legal y Compliance">
                <div className="space-y-6">
                    {/* 1. Asignación de Revisor */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="mb-3 text-sm font-semibold text-slate-800">1. Asignación de Revisor Legal</h4>
                        <form onSubmit={handleAssignLegal} className="flex gap-2 items-end">
                            <div className="flex-1">
                                <label className="mb-1 block text-xs font-medium text-slate-500">Revisor Responsable</label>
                                <select
                                    name="legal_reviewer_id"
                                    defaultValue={legalContract?.legal_reviewer_id || ''}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
                                >
                                    <option value="">-- Sin Asignar --</option>
                                    {members.map(m => (
                                        <option key={m.id} value={m.user_id || m.id}>
                                            {m.full_name || m.user?.full_name || m.email}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="submit"
                                className="rounded-lg bg-white border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Asignar
                            </button>
                        </form>
                    </div>

                    {/* 2. Acción de Revisión */}
                    <div className="rounded-xl border border-slate-200 p-4">
                         <h4 className="mb-3 text-sm font-semibold text-slate-800">2. Dictamen Legal</h4>
                         <div className="space-y-3">
                             <div>
                                <label className="mb-1 block text-xs font-medium text-slate-500">Observación / Comentario</label>
                                <textarea
                                    id="legal_observation"
                                    rows={3}
                                    placeholder="Ingrese observaciones detalladas..."
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                                />
                             </div>
                             <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => handleLegalAction('approved', document.getElementById('legal_observation').value)}
                                    className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                                >
                                    <i className="bi bi-check-circle mr-2"></i>Aprobar
                                </button>
                                <button
                                    onClick={() => handleLegalAction('changes_requested', document.getElementById('legal_observation').value)}
                                    className="flex-1 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600"
                                >
                                    <i className="bi bi-pencil-square mr-2"></i>Solicitar Cambios
                                </button>
                                <button
                                    onClick={() => handleLegalAction('rejected', document.getElementById('legal_observation').value)}
                                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                                >
                                    <i className="bi bi-x-circle mr-2"></i>Rechazar
                                </button>
                             </div>
                         </div>
                    </div>

                    {/* 3. Historial de Observaciones */}
                    <div>
                        <h4 className="mb-3 text-sm font-semibold text-slate-800">Historial de Observaciones</h4>
                        {loadingLegal ? (
                            <div className="text-center py-4 text-slate-500 text-xs">Cargando...</div>
                        ) : observations.length === 0 ? (
                            <div className="text-center py-4 text-slate-400 text-xs italic bg-slate-50 rounded-lg">No hay observaciones registradas.</div>
                        ) : (
                            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                                {observations.map(obs => (
                                    <div key={obs.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-xs font-bold text-slate-700">{obs.user_name || 'Usuario'}</span>
                                            <span className="text-[10px] text-slate-400">{formatDate(obs.created_at)}</span>
                                        </div>
                                        <div className="mb-2">
                                            {renderLegalStatus(obs.status_snapshot)}
                                        </div>
                                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{obs.content}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end pt-2 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={() => setLegalModalOpen(false)}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
