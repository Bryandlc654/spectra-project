import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';

export default function PayrollRunsPage({ apiUrl, token, companyId }) {
    const navigate = useNavigate();
    const { toast } = useToast();
    
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    
    // New Run Form
    const [formData, setFormData] = useState({
        period_start: '',
        period_end: '',
        pay_date: '',
        auto_generate: true
    });

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
        if (companyId) loadRuns();
    }, [companyId]);

    const loadRuns = async () => {
        setLoading(true);
        try {
            const data = await api.get(`/api/payroll/runs?company_id=${companyId}`);
            setRuns(data);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post('/api/payroll/runs', {
                ...formData,
                company_id: companyId
            });
            toast.success('Nómina creada exitosamente');
            setShowCreateModal(false);
            loadRuns();
            navigate(`/payroll/runs/${res.id}`);
        } catch (e) {
            toast.error(e.message);
        }
    };

    const statusBadge = (status) => {
        const colors = {
            draft: 'bg-slate-100 text-slate-700',
            pending_approval: 'bg-amber-100 text-amber-800',
            approved: 'bg-blue-100 text-blue-800',
            processing: 'bg-purple-100 text-purple-800',
            paid: 'bg-emerald-100 text-emerald-800'
        };
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors[status] || colors.draft}`}>
                {status.replace('_', ' ').toUpperCase()}
            </span>
        );
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Nómina (Payroll)</h1>
                    <p className="text-slate-500">Gestiona los ciclos de pago y ejecuciones de nómina.</p>
                </div>
                <button 
                    onClick={() => setShowCreateModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                    + Nueva Nómina
                </button>
            </div>

            {loading ? (
                <div className="text-center py-10">Cargando...</div>
            ) : runs.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center">
                    <p className="text-slate-500 mb-4">No hay ejecuciones de nómina registradas.</p>
                    <button 
                        onClick={() => setShowCreateModal(true)}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                        Crear la primera ejecución
                    </button>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4">Periodo</th>
                                <th className="px-6 py-4">Fecha de Pago</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 text-right">Total Estimado</th>
                                <th className="px-6 py-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {runs.map(run => (
                                <tr key={run.id} className="hover:bg-slate-50 group">
                                    <td className="px-6 py-4 font-medium text-slate-900">
                                        {run.period_start} - {run.period_end}
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">
                                        {run.pay_date || 'No definida'}
                                    </td>
                                    <td className="px-6 py-4">
                                        {statusBadge(run.status)}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-slate-700">
                                        {run.currency_code} {Number(run.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => navigate(`/payroll/runs/${run.id}`)}
                                            className="text-blue-600 hover:text-blue-800 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Ver Detalles &rarr;
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal Create */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
                        <h2 className="text-xl font-bold mb-4">Iniciar Ciclo de Nómina</h2>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Ejecución</label>
                                <select
                                    className="w-full rounded-lg border-slate-300 focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.type}
                                    onChange={e => setFormData({...formData, type: e.target.value})}
                                >
                                    <option value="regular">Regular (Ciclo Normal)</option>
                                    <option value="off_cycle">Off-Cycle (Fuera de Ciclo)</option>
                                </select>
                                <p className="text-xs text-slate-500 mt-1">
                                    {formData.type === 'regular' 
                                        ? 'Nómina estándar periódica.' 
                                        : 'Para bonos spot, correcciones o pagos extraordinarios.'}
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Inicio del Periodo</label>
                                <input 
                                    type="date" 
                                    required
                                    className="w-full rounded-lg border-slate-300 focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.period_start}
                                    onChange={e => setFormData({...formData, period_start: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Fin del Periodo</label>
                                <input 
                                    type="date" 
                                    required
                                    className="w-full rounded-lg border-slate-300 focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.period_end}
                                    onChange={e => setFormData({...formData, period_end: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Pago (Estimada)</label>
                                <input 
                                    type="date" 
                                    required
                                    className="w-full rounded-lg border-slate-300 focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.pay_date}
                                    onChange={e => setFormData({...formData, pay_date: e.target.value})}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="checkbox" 
                                    id="auto_gen"
                                    checked={formData.auto_generate}
                                    onChange={e => setFormData({...formData, auto_generate: e.target.checked})}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor="auto_gen" className="text-sm text-slate-700">Generar ítems automáticamente (Salarios Base)</label>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button 
                                    type="button" 
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                                >
                                    Crear Nómina
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
