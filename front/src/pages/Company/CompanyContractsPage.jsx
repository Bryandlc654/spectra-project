import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ToastProvider';
import TenantContractTemplatesTab from '../../pages/Tenants/tabs/TenantContractTemplatesTab';
import Modal from '../../components/Modal';

export default function CompanyContractsPage({ apiUrl, token }) {
    const toast = useToast();
    const [searchParams] = useSearchParams();
    const { session } = useAuth();
    
    // Get company ID from session user, with fallback to companies array
    const companyId = session?.user?.company_id || session?.user?.companies?.[0]?.id;
    
    const [countries, setCountries] = useState([]);
    const [activeTab, setActiveTab] = useState('contracts');
    const [loading, setLoading] = useState(true);

    const api = useMemo(() => {
        const baseHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        return {
            get: async (endpoint, opts) => {
                const res = await fetch(`${apiUrl}${endpoint}`, { headers: baseHeaders, ...opts });
                if (!res.ok) throw new Error('Error fetching data');
                return res.json();
            },
            post: async (endpoint, body) => {
                const headers = { ...baseHeaders };
                if (body instanceof FormData) {
                    delete headers['Content-Type'];
                }
                const res = await fetch(`${apiUrl}${endpoint}`, {
                    method: 'POST',
                    headers,
                    body: body instanceof FormData ? body : JSON.stringify(body)
                });
                
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.message || 'Error posting data');
                }
                return res.json();
            },
            put: async (endpoint, body) => {
                const res = await fetch(`${apiUrl}${endpoint}`, {
                    method: 'PUT',
                    headers: baseHeaders,
                    body: JSON.stringify(body)
                });
                if (!res.ok) throw new Error('Error updating data');
                return res.json();
            },
            delete: async (endpoint) => {
                const res = await fetch(`${apiUrl}${endpoint}`, {
                    method: 'DELETE',
                    headers: baseHeaders
                });
                if (!res.ok) throw new Error('Error deleting data');
                return res.json();
            }
        };
    }, [apiUrl, token]);

    useEffect(() => {
        // Fetch countries
        async function init() {
            if (!companyId) return;
            
            setLoading(true);
            try {
                // Fetch countries
                try {
                    const cRes = await api.get('/api/countries?per_page=100');
                    setCountries(Array.isArray(cRes) ? cRes : (cRes.data || []));
                } catch (e) {
                    console.warn('Could not fetch countries, using defaults');
                    setCountries([
                        { id: 'US', name: 'United States' },
                        { id: 'MX', name: 'Mexico' },
                        { id: 'CO', name: 'Colombia' },
                        { id: 'ES', name: 'Spain' }
                    ]);
                }
            } catch (e) {
                console.error(e);
                toast.error('Error inicializando módulo');
            } finally {
                setLoading(false);
            }
        }
        init();
    }, [api, companyId]);

    if (!companyId) return (
        <div className="p-8 text-center">
            <div className="text-red-500 font-bold mb-2">Error: No se identificó la empresa en su sesión.</div>
            <div className="text-sm text-slate-500">
                Verifique que su usuario tenga una empresa asignada. <br/>
                User ID: {session?.user?.id || 'Desconocido'} <br/>
                Role: {session?.user?.role || 'Desconocido'}
            </div>
        </div>
    );
    if (loading) return <div className="p-8 text-center text-slate-500">Cargando...</div>;

    return (
        <div className="min-h-screen bg-slate-50 pb-20 pt-6">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Gestión de Contratos</h1>
                        <p className="text-sm text-slate-500">Administra contratos y plantillas legales.</p>
                    </div>
                </div>

                <div className="mb-6 border-b border-slate-200">
                    <nav className="-mb-px flex gap-6">
                        <button
                            onClick={() => setActiveTab('contracts')}
                            className={`border-b-2 py-4 text-sm font-medium transition-colors ${
                                activeTab === 'contracts'
                                    ? 'border-brand text-brand'
                                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                            }`}
                        >
                            Mis Contratos
                        </button>
                        <button
                            onClick={() => setActiveTab('templates')}
                            className={`border-b-2 py-4 text-sm font-medium transition-colors ${
                                activeTab === 'templates'
                                    ? 'border-brand text-brand'
                                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                            }`}
                        >
                            Plantillas
                        </button>
                    </nav>
                </div>

                {activeTab === 'contracts' && (
                    <CompanyContractsList companyId={companyId} api={api} countries={countries} />
                )}
                
                {activeTab === 'templates' && (
                    <TenantContractTemplatesTab companyId={companyId} api={api} countries={countries} />
                )}
            </div>
        </div>
    );
}

// Sub-component for Contracts List (Adapted from TenantContractsTab)
function CompanyContractsList({ companyId, api, countries }) {
    const toast = useToast();
    const [contracts, setContracts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [templates, setTemplates] = useState([]);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    
    // Filters
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    
    // Modals
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [terminateModalOpen, setTerminateModalOpen] = useState(false);
    const [terminatingContract, setTerminatingContract] = useState(null);
    const [renewModalOpen, setRenewModalOpen] = useState(false);
    const [renewingContract, setRenewingContract] = useState(null);
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState(null);
    const [createStep, setCreateStep] = useState(1); // 1: Template/Type, 2: Details
    
    // Create Form
    const [formData, setFormData] = useState({
        template_id: '',
        title: '',
        type: 'fixed',
        freelancer_id: '',
        currency_id: 1,
        rate: '',
        start_date: '',
        end_date: '',
        scope_of_work: '' // Will be populated from template if selected
    });

    // Freelancer Search for Create Form
    const [freelancerSearch, setFreelancerSearch] = useState('');
    const [freelancerResults, setFreelancerResults] = useState([]);
    const [selectedFreelancer, setSelectedFreelancer] = useState(null);

    useEffect(() => {
        loadContracts();
        loadTemplates();
    }, [companyId, statusFilter, debouncedSearch, api]);

    async function loadContracts() {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set('status', statusFilter);
            if (debouncedSearch) params.set('q', debouncedSearch);
            const res = await api.get(`/api/tenants/${companyId}/contracts?${params.toString()}`);
            setContracts(Array.isArray(res) ? res : (res.data || []));
        } catch (e) {
            console.error(e);
            toast.error('Error cargando contratos');
        } finally {
            setLoading(false);
        }
    }

    async function loadTemplates() {
        try {
            const res = await api.get(`/api/tenants/${companyId}/contract-templates?status=active`);
            setTemplates(Array.isArray(res) ? res : (res.data || []));
        } catch (e) {
            console.error('Error loading templates', e);
        }
    }

    // Freelancer Search Effect
    useEffect(() => {
        if (!freelancerSearch || freelancerSearch.length < 2) {
            setFreelancerResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const res = await api.get(`/api/freelancers?q=${freelancerSearch}`);
                setFreelancerResults(Array.isArray(res.data) ? res.data : []);
            } catch (e) { console.error(e); }
        }, 500);
        return () => clearTimeout(timer);
    }, [freelancerSearch]);

    // Debounce main contracts search to avoid calling API on each keystroke
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
        return () => clearTimeout(t);
    }, [search]);

    const handleCreateSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                freelancer_id: selectedFreelancer?.id || formData.freelancer_id,
                // If template selected, we send template_id or copy content
                // Assuming backend accepts template_id or we just use it to prefill
            };
            
            await api.post(`/api/tenants/${companyId}/contracts`, payload);
            toast.success('Contrato creado exitosamente');
            setCreateModalOpen(false);
            setFormData({
                template_id: '',
                title: '',
                type: 'fixed',
                freelancer_id: '',
                currency_id: 1,
                rate: '',
                start_date: '',
                end_date: '',
                scope_of_work: ''
            });
            setCreateStep(1);
            loadContracts();
        } catch (e) {
            console.error(e);
            toast.error(e.message || 'Error al crear contrato');
        }
    };
    
    const handleTemplateSelect = (e) => {
        const tplId = e.target.value;
        const tpl = templates.find(t => t.id == tplId);
        setFormData(prev => ({
            ...prev,
            template_id: tplId,
            title: tpl ? tpl.title : prev.title,
            type: tpl ? tpl.type : prev.type,
            scope_of_work: tpl ? tpl.body : prev.scope_of_work
        }));
    };

    const handleSign = async (contract) => {
        if (!window.confirm(`¿Enviar "${contract.title}" para firma digital (Spectra Sign)?`)) return;
        try {
            await api.post('/api/envelopes', { contract_id: contract.id });
            toast.success('Enviado a firma');
            loadContracts();
        } catch (e) {
            console.error(e);
            toast.error(e.message || 'Error al enviar');
        }
    };

    const handleTerminate = async (e) => {
        e.preventDefault();
        if (!terminatingContract) return;
        try {
            const data = new FormData(e.target);
            await api.post(`/api/tenants/${companyId}/contracts/${terminatingContract.id}/terminate`, {
                end_date: data.get('end_date'),
                reason: data.get('reason')
            });
            toast.success('Contrato terminado');
            setTerminateModalOpen(false);
            loadContracts();
        } catch (e) {
            console.error(e);
            toast.error(e.message || 'Error al terminar');
        }
    };

    const handleRenew = async (e) => {
        e.preventDefault();
        if (!renewingContract) return;
        try {
            const data = new FormData(e.target);
            await api.post(`/api/tenants/${companyId}/contracts/${renewingContract.id}/renew`, {
                new_end_date: data.get('new_end_date'),
                notes: data.get('notes')
            });
            toast.success('Solicitud de renovación enviada');
            setRenewModalOpen(false);
            loadContracts();
        } catch (e) {
            console.error(e);
            toast.error(e.message || 'Error al solicitar renovación');
        }
    };

    const handleViewDetails = async (contract) => {
        setSelectedContract(contract);
        setDetailsModalOpen(true);
        // Fetch full details (versions, etc) if not present
        if (!contract.versions) {
            try {
                // Use amendments endpoint for history/versions since show endpoint is not available
                const res = await api.get(`/api/tenants/${companyId}/contracts/${contract.id}/amendments`);
                const amendments = Array.isArray(res) ? res : (res.data || []);
                
                setSelectedContract(prev => ({ 
                    ...prev, 
                    versions: amendments.map(a => ({
                        version: a.version || 'Amendment',
                        created_at: a.created_at,
                        action: a.type || 'Enmienda'
                    }))
                }));
            } catch (e) {
                console.warn("Could not fetch contract history", e);
                // Non-blocking error, user can still see details
            }
        }
    };

    return (
        <div className="space-y-6">
            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                     <div className="relative">
                        <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            placeholder="Buscar contratos..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-64 rounded-xl border-none bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-700 focus:ring-2 focus:ring-brand/20"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="rounded-xl border-none bg-slate-50 py-2 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-brand/20"
                    >
                        <option value="">Todos los estados</option>
                        <option value="active">Activos</option>
                        <option value="draft">Borradores</option>
                        <option value="terminated">Terminados</option>
                    </select>
                </div>
                <button
                    onClick={() => setCreateModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand/20 hover:bg-brand-600"
                >
                    <i className="bi bi-plus-lg" />
                    Iniciar Contrato
                </button>
            </div>

            {/* Contracts List */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                        <tr>
                            <th className="px-6 py-4">Título</th>
                            <th className="px-6 py-4">Freelancer</th>
                            <th className="px-6 py-4">Tipo</th>
                            <th className="px-6 py-4">Estado</th>
                            <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {contracts.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                                    No hay contratos encontrados.
                                </td>
                            </tr>
                        ) : (
                            contracts.map(c => (
                                <tr key={c.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-slate-900">{c.title}</div>
                                        <div className="text-xs text-slate-500">{c.reference || c.id}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {c.freelancer_name || '—'}
                                    </td>
                                    <td className="px-6 py-4 capitalize">{c.type}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                            c.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                                            c.status === 'terminated' ? 'bg-slate-100 text-slate-800' :
                                            'bg-amber-100 text-amber-800'
                                        }`}>
                                            {c.status}
                                        </span>
                                        {c.envelope_status && (
                                            <div className="mt-1 text-[10px] text-slate-500">
                                                Firma: {c.envelope_status}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button 
                                                onClick={() => handleViewDetails(c)}
                                                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                                                title="Ver Detalles / Historial"
                                            >
                                                <i className="bi bi-eye" />
                                            </button>
                                            {c.status === 'draft' && (
                                                <button 
                                                    onClick={() => handleSign(c)}
                                                    className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                                                    title="Enviar a Firma"
                                                >
                                                    <i className="bi bi-pen" />
                                                </button>
                                            )}
                                            {c.status === 'active' && (
                                                <>
                                                    <button 
                                                        onClick={() => {
                                                            setRenewingContract(c);
                                                            setRenewModalOpen(true);
                                                        }}
                                                        className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"
                                                        title="Solicitar Renovación"
                                                    >
                                                        <i className="bi bi-arrow-repeat" />
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            setTerminatingContract(c);
                                                            setTerminateModalOpen(true);
                                                        }}
                                                        className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                                                        title="Terminar"
                                                    >
                                                        <i className="bi bi-x-circle" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create Modal */}
            {createModalOpen && (
                <Modal open={true} title="Iniciar Nuevo Contrato" onClose={() => setCreateModalOpen(false)}>
                    <form onSubmit={handleCreateSubmit} className="space-y-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Seleccionar Plantilla (Opcional)</label>
                            <select 
                                className="w-full rounded-xl border-slate-200"
                                value={formData.template_id}
                                onChange={handleTemplateSelect}
                            >
                                <option value="">-- Sin plantilla --</option>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>{t.title} ({t.country_id})</option>
                                ))}
                            </select>
                            <p className="mt-1 text-xs text-slate-500">Seleccionar una plantilla autocompletará el título y tipo.</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Título</label>
                                <input 
                                    required 
                                    className="w-full rounded-xl border-slate-200"
                                    value={formData.title}
                                    onChange={e => setFormData({...formData, title: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
                                <select 
                                    className="w-full rounded-xl border-slate-200"
                                    value={formData.type}
                                    onChange={e => setFormData({...formData, type: e.target.value})}
                                >
                                    <option value="fixed">Fixed</option>
                                    <option value="hourly">Hourly</option>
                                    <option value="retainer">Retainer</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Freelancer</label>
                            <div className="relative">
                                {selectedFreelancer ? (
                                    <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                                        <span className="text-sm font-medium text-emerald-900">{selectedFreelancer.name}</span>
                                        <button type="button" onClick={() => setSelectedFreelancer(null)} className="text-emerald-500 hover:text-emerald-700">
                                            <i className="bi bi-x" />
                                        </button>
                                    </div>
                                ) : (
                                    <input 
                                        placeholder="Buscar por nombre..."
                                        className="w-full rounded-xl border-slate-200"
                                        value={freelancerSearch}
                                        onChange={e => setFreelancerSearch(e.target.value)}
                                    />
                                )}
                                {freelancerResults.length > 0 && !selectedFreelancer && (
                                    <div className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-slate-100 bg-white shadow-lg">
                                        {freelancerResults.map(f => (
                                            <div 
                                                key={f.id}
                                                onClick={() => {
                                                    setSelectedFreelancer(f);
                                                    setFreelancerResults([]);
                                                    setFreelancerSearch('');
                                                }}
                                                className="cursor-pointer px-4 py-2 hover:bg-slate-50 text-sm"
                                            >
                                                {f.name} <span className="text-xs text-slate-400">({f.email})</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Tarifa</label>
                                <input 
                                    type="number"
                                    className="w-full rounded-xl border-slate-200"
                                    value={formData.rate}
                                    onChange={e => setFormData({...formData, rate: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Moneda ID</label>
                                <input 
                                    type="number"
                                    className="w-full rounded-xl border-slate-200"
                                    value={formData.currency_id}
                                    onChange={e => setFormData({...formData, currency_id: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Fecha Inicio</label>
                                <input 
                                    type="date"
                                    required
                                    className="w-full rounded-xl border-slate-200"
                                    value={formData.start_date}
                                    onChange={e => setFormData({...formData, start_date: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Fecha Fin (Opcional)</label>
                                <input 
                                    type="date"
                                    className="w-full rounded-xl border-slate-200"
                                    value={formData.end_date}
                                    onChange={e => setFormData({...formData, end_date: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <button type="button" onClick={() => setCreateModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
                            <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">Crear Contrato</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Terminate Modal */}
            {terminateModalOpen && (
                <Modal open={true} title="Terminar Contrato" onClose={() => setTerminateModalOpen(false)}>
                    <form onSubmit={handleTerminate} className="space-y-4">
                        <p className="text-sm text-slate-600">
                            Estás a punto de terminar el contrato <strong>{terminatingContract?.title}</strong>. 
                            Esta acción es irreversible y notificará al freelancer.
                        </p>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Fecha de Finalización</label>
                            <input 
                                type="date"
                                required
                                name="end_date"
                                className="w-full rounded-xl border-slate-200"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Motivo</label>
                            <textarea 
                                required
                                name="reason"
                                rows="3"
                                className="w-full rounded-xl border-slate-200"
                                placeholder="Indica el motivo de la terminación..."
                            />
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <button type="button" onClick={() => setTerminateModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
                            <button type="submit" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Terminar Contrato</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Renew Modal */}
            {renewModalOpen && (
                <Modal open={true} title="Solicitar Renovación" onClose={() => setRenewModalOpen(false)}>
                    <form onSubmit={handleRenew} className="space-y-4">
                        <p className="text-sm text-slate-600">
                            Estás solicitando renovar el contrato <strong>{renewingContract?.title}</strong>. 
                        </p>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Nueva Fecha de Finalización</label>
                            <input 
                                type="date"
                                required
                                name="new_end_date"
                                className="w-full rounded-xl border-slate-200"
                                defaultValue={renewingContract?.end_date}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Notas / Condiciones</label>
                            <textarea 
                                name="notes"
                                rows="3"
                                className="w-full rounded-xl border-slate-200"
                                placeholder="Detalles de la renovación (cambio de tarifa, alcance, etc.)..."
                            />
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <button type="button" onClick={() => setRenewModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
                            <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Enviar Solicitud</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Details Modal */}
            {detailsModalOpen && selectedContract && (
                <Modal open={true} title="Detalles del Contrato" onClose={() => setDetailsModalOpen(false)}>
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <label className="block text-xs text-slate-500">Título</label>
                                <div className="font-medium text-slate-900">{selectedContract.title}</div>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500">Estado</label>
                                <div className="font-medium capitalize text-slate-900">{selectedContract.status}</div>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500">Freelancer</label>
                                <div className="font-medium text-slate-900">{selectedContract.freelancer_name || 'N/A'}</div>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500">Tipo</label>
                                <div className="font-medium capitalize text-slate-900">{selectedContract.type}</div>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500">Fecha Inicio</label>
                                <div className="font-medium text-slate-900">{selectedContract.start_date || 'N/A'}</div>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500">Fecha Fin</label>
                                <div className="font-medium text-slate-900">{selectedContract.end_date || 'Indefinido'}</div>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500">Tarifa</label>
                                <div className="font-medium text-slate-900">
                                    {selectedContract.rate ? `$${selectedContract.rate}` : 'N/A'}
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-slate-100 pt-4">
                            <h4 className="mb-3 text-sm font-semibold text-slate-900">Historial / Versiones</h4>
                            {selectedContract.versions && selectedContract.versions.length > 0 ? (
                                <ul className="space-y-3">
                                    {selectedContract.versions.map((v, i) => (
                                        <li key={i} className="flex items-center justify-between text-xs">
                                            <div>
                                                <span className="font-medium text-slate-700">v{v.version || i + 1}</span>
                                                <span className="mx-2 text-slate-300">|</span>
                                                <span className="text-slate-500">{v.created_at || 'Fecha desc.'}</span>
                                            </div>
                                            <div className="text-slate-500">{v.action || 'Modificación'}</div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500">
                                    No hay historial de versiones disponible.
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end pt-4">
                            <button onClick={() => setDetailsModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cerrar</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
