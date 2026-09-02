import React, { useEffect, useState, useMemo } from 'react';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';
import { Link } from 'react-router-dom';

export default function CompanyFreelancersPage({ apiUrl, token }) {
    const { session } = useAuth();
    const companyId = session?.user?.company_id;
    const toast = useToast();

    // Tabs: 'my-freelancers' | 'search'
    const [activeTab, setActiveTab] = useState('my-freelancers');

    // API Helper
    const api = useMemo(() => {
        const getHeaders = () => ({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        });

        return {
            get: async (endpoint) => {
                const res = await fetch(`${apiUrl}${endpoint}`, { headers: getHeaders() });
                if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
                return res.json();
            },
            post: async (endpoint, body) => {
                const res = await fetch(`${apiUrl}${endpoint}`, {
                    method: 'POST',
                    headers: getHeaders(),
                    body: JSON.stringify(body),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.message || `Error ${res.status}`);
                }
                return res.json();
            },
            put: async (endpoint, body) => {
                const res = await fetch(`${apiUrl}${endpoint}`, {
                    method: 'PUT',
                    headers: getHeaders(),
                    body: JSON.stringify(body),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.message || `Error ${res.status}`);
                }
                return res.json();
            },
            del: async (endpoint) => {
                const res = await fetch(`${apiUrl}${endpoint}`, {
                    method: 'DELETE',
                    headers: getHeaders(),
                });
                if (!res.ok) throw new Error(`Error ${res.status}`);
                return res.json();
            }
        };
    }, [apiUrl, token]);

    // --- My Freelancers Logic ---
    const [contracts, setContracts] = useState([]);
    const [loadingContracts, setLoadingContracts] = useState(false);
    
    async function loadContracts() {
        if (!companyId) return;
        setLoadingContracts(true);
        try {
            // Reusing tenant contracts endpoint which returns contracts for this company
            const res = await api.get(`/api/tenants/${companyId}/contracts?status=active,pending,draft`);
            const items = Array.isArray(res) ? res : (res.data || res.items || []);
            setContracts(items);
        } catch (e) {
            console.error(e);
            toast.error('Error cargando contratos');
        } finally {
            setLoadingContracts(false);
        }
    }

    useEffect(() => {
        if (activeTab === 'my-freelancers') {
            loadContracts();
        }
    }, [activeTab, companyId]);

    // --- Search Logic ---
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    async function handleSearch(e) {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setSearching(true);
        try {
            const res = await api.get(`/api/freelancers?q=${encodeURIComponent(searchQuery)}`);
            setSearchResults(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            console.error(e);
            toast.error('Error buscando freelancers');
        } finally {
            setSearching(false);
        }
    }

    // --- Contract Actions ---
    const [terminateModalOpen, setTerminateModalOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState(null);
    const [terminating, setTerminating] = useState(false);

    const handleTerminate = (contract) => {
        setSelectedContract(contract);
        setTerminateModalOpen(true);
    };

    const confirmTerminate = async (e) => {
        e.preventDefault();
        if (!selectedContract) return;
        setTerminating(true);
        try {
            const formData = new FormData(e.target);
            const payload = {
                end_date: formData.get('end_date'),
                reason: formData.get('reason'),
            };
            await api.post(`/api/tenants/${companyId}/contracts/${selectedContract.id}/terminate`, payload);
            toast.success('Contrato terminado');
            setTerminateModalOpen(false);
            loadContracts();
        } catch (e) {
            console.error(e);
            toast.error(e.message || 'Error al terminar contrato');
        } finally {
            setTerminating(false);
        }
    };

    // --- Create Contract (Invite) Logic ---
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [selectedFreelancer, setSelectedFreelancer] = useState(null);
    const [creating, setCreating] = useState(false);

    const handleInvite = (freelancer) => {
        setSelectedFreelancer(freelancer);
        setCreateModalOpen(true);
    };

    const confirmCreate = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            const formData = new FormData(e.target);
            const payload = {
                title: formData.get('title'),
                type: formData.get('type'), // fixed, hourly
                freelancer_id: selectedFreelancer?.id,
                currency_id: formData.get('currency_id'),
                rate: formData.get('rate'),
                start_date: formData.get('start_date'),
                end_date: formData.get('end_date') || null,
            };

            await api.post(`/api/tenants/${companyId}/contracts`, payload);
            toast.success('Contrato creado / Invitación enviada');
            setCreateModalOpen(false);
            setActiveTab('my-freelancers'); // Switch to list
        } catch (e) {
            console.error(e);
            toast.error(e.message || 'Error creando contrato');
        } finally {
            setCreating(false);
        }
    };

    if (!companyId) {
        return <div className="p-8 text-center text-red-500">Error: No se identificó la empresa del usuario.</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Gestión de Talento</div>
                    <h1 className="text-2xl font-bold text-slate-900">Freelancers & Contratos</h1>
                    <p className="text-sm text-slate-600">
                        Administra tus freelancers contratados o busca nuevo talento.
                    </p>
                </div>
                <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
                    <button
                        onClick={() => setActiveTab('my-freelancers')}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                            activeTab === 'my-freelancers' 
                            ? 'bg-white text-brand shadow-sm' 
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        Mis Freelancers
                    </button>
                    <button
                        onClick={() => setActiveTab('search')}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                            activeTab === 'search' 
                            ? 'bg-white text-brand shadow-sm' 
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        Buscar Talento
                    </button>
                </div>
            </div>

            {/* Content */}
            {activeTab === 'my-freelancers' && (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    {loadingContracts ? (
                        <div className="p-10 text-center text-slate-500">Cargando contratos...</div>
                    ) : contracts.length === 0 ? (
                        <div className="p-10 text-center text-slate-500">
                            <p>No tienes freelancers contratados actualmente.</p>
                            <button 
                                onClick={() => setActiveTab('search')}
                                className="mt-2 text-brand font-semibold hover:underline"
                            >
                                Buscar talento
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Freelancer</th>
                                        <th className="px-4 py-3">Contrato</th>
                                        <th className="px-4 py-3">Tipo</th>
                                        <th className="px-4 py-3">Estado</th>
                                        <th className="px-4 py-3 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {contracts.map(c => (
                                        <tr key={c.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-slate-900">
                                                    {c.freelancer?.full_name || c.freelancer?.email || 'Sin asignar'}
                                                </div>
                                                <div className="text-xs text-slate-500">{c.freelancer?.email}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-slate-900">{c.title}</div>
                                                <div className="text-xs text-slate-500">Desde: {c.start_date}</div>
                                            </td>
                                            <td className="px-4 py-3 capitalize">{c.type}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    c.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                                                    c.status === 'terminated' ? 'bg-slate-100 text-slate-700' :
                                                    'bg-amber-100 text-amber-700'
                                                }`}>
                                                    {c.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {c.freelancer_id && (
                                                        <Link 
                                                            to={`/dashboard/freelancers/${c.freelancer_id}`}
                                                            className="text-slate-400 hover:text-brand"
                                                            title="Ver Perfil"
                                                        >
                                                            <i className="bi bi-person-badge"></i>
                                                        </Link>
                                                    )}
                                                    {c.status === 'active' && (
                                                        <button
                                                            onClick={() => handleTerminate(c)}
                                                            className="text-slate-400 hover:text-red-600"
                                                            title="Terminar Contrato"
                                                        >
                                                            <i className="bi bi-x-circle"></i>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'search' && (
                <div className="space-y-6">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Buscar por nombre, habilidades o rol..."
                            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                        />
                        <button 
                            type="submit"
                            disabled={searching}
                            className="rounded-xl bg-brand px-6 py-3 font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                            {searching ? 'Buscando...' : 'Buscar'}
                        </button>
                    </form>

                    {searchResults.length > 0 && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {searchResults.map(f => (
                                <div key={f.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
                                    <div className="flex items-start justify-between">
                                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-xl font-bold text-slate-500">
                                            {f.full_name?.charAt(0) || 'F'}
                                        </div>
                                        <Link 
                                            to={`/dashboard/freelancers/${f.id}`}
                                            className="text-sm font-semibold text-brand hover:underline"
                                        >
                                            Ver Perfil
                                        </Link>
                                    </div>
                                    <div className="mt-4">
                                        <h3 className="font-bold text-slate-900">{f.full_name}</h3>
                                        <p className="text-sm text-slate-500">{f.headline || 'Freelancer'}</p>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {f.skills?.slice(0, 3).map((skill, i) => (
                                            <span key={i} className="rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 border border-slate-100">
                                                {skill}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="mt-auto pt-4">
                                        <button
                                            onClick={() => handleInvite(f)}
                                            className="w-full rounded-xl bg-slate-900 py-2 text-sm font-bold text-white hover:bg-slate-800"
                                        >
                                            Contratar / Ofertar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {!searching && searchResults.length === 0 && searchQuery && (
                         <div className="p-10 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            No se encontraron freelancers con esos términos.
                        </div>
                    )}
                </div>
            )}

            {/* Modals */}
            <Modal open={terminateModalOpen} onClose={() => setTerminateModalOpen(false)} title="Terminar Contrato">
                <form onSubmit={confirmTerminate} className="space-y-4">
                    <div className="p-3 bg-red-50 text-red-800 text-sm rounded-lg border border-red-100">
                        Estás a punto de terminar el contrato con <strong>{selectedContract?.freelancer?.full_name}</strong>. 
                        Esta acción iniciará el proceso de offboarding.
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Fecha de finalización</label>
                        <input type="date" name="end_date" required className="mt-1 w-full rounded-lg border-slate-300" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Motivo</label>
                        <textarea name="reason" rows="3" className="mt-1 w-full rounded-lg border-slate-300" required placeholder="Explica el motivo..."></textarea>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setTerminateModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Cancelar</button>
                        <button type="submit" disabled={terminating} className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700">
                            {terminating ? 'Terminando...' : 'Terminar Contrato'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Nueva Contratación">
                <form onSubmit={confirmCreate} className="space-y-4">
                     <div className="p-3 bg-blue-50 text-blue-800 text-sm rounded-lg border border-blue-100">
                        Creando oferta para <strong>{selectedFreelancer?.full_name}</strong>.
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Título del Puesto / Proyecto</label>
                        <input name="title" required className="mt-1 w-full rounded-lg border-slate-300" placeholder="Ej. Desarrollador Senior React" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700">Tipo</label>
                            <select name="type" className="mt-1 w-full rounded-lg border-slate-300">
                                <option value="fixed">Fijo Mensual</option>
                                <option value="hourly">Por Hora</option>
                                <option value="milestone">Por Hito</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">Moneda</label>
                            <select name="currency_id" className="mt-1 w-full rounded-lg border-slate-300">
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="MXN">MXN</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Tarifa / Rate</label>
                        <input type="number" name="rate" step="0.01" required className="mt-1 w-full rounded-lg border-slate-300" placeholder="0.00" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700">Fecha Inicio</label>
                            <input type="date" name="start_date" required className="mt-1 w-full rounded-lg border-slate-300" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700">Fecha Fin (Opcional)</label>
                            <input type="date" name="end_date" className="mt-1 w-full rounded-lg border-slate-300" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setCreateModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Cancelar</button>
                        <button type="submit" disabled={creating} className="px-4 py-2 text-sm font-bold text-white bg-brand rounded-lg hover:bg-brand-700">
                            {creating ? 'Crear Oferta' : 'Crear Oferta'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
