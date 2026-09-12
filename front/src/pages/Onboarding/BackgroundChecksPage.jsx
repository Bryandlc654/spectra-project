import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../components/ToastProvider';

export default function BackgroundChecksPage({ apiUrl, token }) {
    const toast = useToast();
    const [checks, setChecks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    
    // For creating new check
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');
    const [selectedPackage, setSelectedPackage] = useState('standard');
    const [creating, setCreating] = useState(false);

    const api = useMemo(() => {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        return {
            get: async (path) => {
                const res = await fetch(`${apiUrl}${path}`, { headers });
                if (!res.ok) throw new Error('Error fetching data');
                return res.json();
            },
            post: async (path, body) => {
                const res = await fetch(`${apiUrl}${path}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                });
                if (!res.ok) throw new Error('Error posting data');
                return res.json();
            }
        };
    }, [apiUrl, token]);

    useEffect(() => {
        loadChecks();
        loadUsers();
    }, []);

    const loadChecks = async () => {
        setLoading(true);
        try {
            const data = await api.get('/api/background-checks');
            setChecks(data);
        } catch (e) {
            toast.error('Error al cargar verificaciones');
        } finally {
            setLoading(false);
        }
    };

    const loadUsers = async () => {
        try {
            const res = await api.get('/api/background-checks/candidates');
            if (Array.isArray(res)) setUsers(res);
            else if (res.data) setUsers(res.data);
        } catch (e) {
            console.error('Could not load users for dropdown');
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!selectedUser) return toast.error('Selecciona un usuario');
        
        setCreating(true);
        try {
            await api.post('/api/background-checks', {
                user_id: selectedUser,
                package: selectedPackage
            });
            toast.success('Verificación solicitada correctamente');
            setCreateModalOpen(false);
            loadChecks();
        } catch (err) {
            toast.error('Error al solicitar verificación');
        } finally {
            setCreating(false);
        }
    };

    const handleSimulateWebhook = async (checkId, status) => {
        try {
            await api.post('/api/background-checks/simulate-webhook', {
                check_id: checkId,
                status: status
            });
            toast.success(`Simulación: Estado actualizado a ${status}`);
            loadChecks();
        } catch (e) {
            toast.error('Error en simulación');
        }
    };

    const renderStatusBadge = (status) => {
        const styles = {
            pending: 'bg-amber-100 text-amber-800',
            processing: 'bg-blue-100 text-blue-800',
            clear: 'bg-emerald-100 text-emerald-800',
            consider: 'bg-rose-100 text-rose-800',
            canceled: 'bg-slate-100 text-slate-800',
        };
        return (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.canceled}`}>
                {status.toUpperCase()}
            </span>
        );
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Verificación de Antecedentes</h1>
                    <p className="text-sm text-slate-500">Gestión de background checks (Checkr Integration)</p>
                </div>
                <button 
                    onClick={() => setCreateModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                    <i className="bi bi-shield-check"></i>
                    Nueva Verificación
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12">Cargando...</div>
            ) : checks.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className="bi bi-shield text-3xl text-slate-400"></i>
                    </div>
                    <h3 className="text-lg font-medium text-slate-900">No hay verificaciones</h3>
                    <p className="text-slate-500 mt-1">Solicita una nueva verificación para comenzar.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                            <tr>
                                <th className="px-6 py-4">Candidato</th>
                                <th className="px-6 py-4">Paquete</th>
                                <th className="px-6 py-4">Proveedor</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4">ETA</th>
                                <th className="px-6 py-4 text-right">Acciones (Demo)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {checks.map(check => (
                                <tr key={check.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-900">{check.candidate_name || 'Usuario Desconocido'}</div>
                                        <div className="text-xs text-slate-500">{check.candidate_email}</div>
                                    </td>
                                    <td className="px-6 py-4 capitalize">{check.package}</td>
                                    <td className="px-6 py-4 text-slate-500">{check.provider}</td>
                                    <td className="px-6 py-4">
                                        {renderStatusBadge(check.status)}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500">
                                        {check.eta ? new Date(check.eta).toLocaleDateString() : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {check.status === 'pending' || check.status === 'processing' ? (
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={() => handleSimulateWebhook(check.id, 'clear')}
                                                    className="text-xs bg-emerald-50 text-emerald-600 px-2 py-1 rounded hover:bg-emerald-100 border border-emerald-200"
                                                    title="Simular resultado exitoso"
                                                >
                                                    Simular Clear
                                                </button>
                                                <button 
                                                    onClick={() => handleSimulateWebhook(check.id, 'consider')}
                                                    className="text-xs bg-rose-50 text-rose-600 px-2 py-1 rounded hover:bg-rose-100 border border-rose-200"
                                                    title="Simular resultado con alertas"
                                                >
                                                    Simular Alert
                                                </button>
                                            </div>
                                        ) : (
                                            <a 
                                                href={check.report_url || '#'} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="text-blue-600 hover:underline font-medium"
                                            >
                                                Ver Reporte
                                            </a>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Create Modal */}
            {createModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        <h2 className="text-xl font-bold mb-4">Nueva Verificación</h2>
                        <form onSubmit={handleCreate}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Candidato</label>
                                    <select 
                                        className="w-full rounded-lg border-slate-300 focus:ring-blue-500 focus:border-blue-500"
                                        value={selectedUser}
                                        onChange={e => setSelectedUser(e.target.value)}
                                        required
                                    >
                                        <option value="">Seleccionar usuario...</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Paquete de Verificación</label>
                                    <select 
                                        className="w-full rounded-lg border-slate-300 focus:ring-blue-500 focus:border-blue-500"
                                        value={selectedPackage}
                                        onChange={e => setSelectedPackage(e.target.value)}
                                    >
                                        <option value="standard">Standard Criminal ($30)</option>
                                        <option value="standard_education">Standard + Education ($45)</option>
                                        <option value="comprehensive">Comprehensive (Criminal + Employment) ($60)</option>
                                    </select>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Los precios son simulados. El proveedor es Checkr.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <button 
                                    type="button"
                                    onClick={() => setCreateModalOpen(false)}
                                    className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg font-medium"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit"
                                    disabled={creating}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {creating ? 'Solicitando...' : 'Solicitar Verificación'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
