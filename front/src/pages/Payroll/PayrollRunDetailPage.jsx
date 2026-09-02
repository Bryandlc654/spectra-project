import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';

export default function PayrollRunDetailPage({ apiUrl, token }) {
    const { id } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    
    const [run, setRun] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newItem, setNewItem] = useState({ description: '', amount: '', type: 'earning' });
    const [selectedUser, setSelectedUser] = useState(null);

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
            },
            put: async (path, body) => {
                const res = await fetch(`${apiUrl}${path}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(body)
                });
                if (!res.ok) throw new Error('Error updating data');
                return res.json();
            }
        };
    }, [apiUrl, token]);

    useEffect(() => {
        loadRun();
    }, [id]);

    const loadRun = async () => {
        setLoading(true);
        try {
            const data = await api.get(`/api/payroll/runs/${id}`);
            setRun(data);
            
            // Fetch Items
            const itemsRes = await api.get(`/api/payroll/items?payroll_run_id=${id}&limit=1000`);
            setItems(itemsRes.data || []);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddItem = async (userId) => {
        if (!newItem.description || !newItem.amount) return;
        try {
            await api.post('/api/payroll/items', {
                payroll_run_id: id,
                user_id: userId,
                type: newItem.type,
                description: newItem.description,
                amount: newItem.amount,
                currency_id: 1 // Default
            });
            toast.success('Ítem agregado');
            setNewItem({ description: '', amount: '', type: 'earning' });
            setSelectedUser(null);
            loadRun(); // Reload to calc totals
        } catch (e) {
            toast.error(e.message);
        }
    };

    const handleStatusChange = async (newStatus) => {
        try {
            await api.put(`/api/payroll/runs/${id}`, { status: newStatus });
            toast.success(`Estado actualizado a ${newStatus}`);
            loadRun();
        } catch (e) {
            toast.error(e.message);
        }
    };

    const handleExport = async () => {
        try {
            const res = await fetch(`${apiUrl}/api/payroll/items?payroll_run_id=${id}&export=csv`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Error exportando');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `payroll_items_${id}.csv`;
            a.click();
        } catch (e) {
            toast.error(e.message);
        }
    };

    const handleCalculate = async () => {
        try {
            await api.post(`/api/payroll/runs/${id}/calculate`, {});
            toast.success('Nómina calculada');
            loadRun();
        } catch (e) {
            toast.error(e.message);
        }
    };

    if (loading) return <div className="p-8 text-center">Cargando detalles...</div>;
    if (!run) return <div className="p-8 text-center text-red-600">Nómina no encontrada</div>;

    // Group items by user
    const itemsByUser = items.reduce((acc, item) => {
        if (!acc[item.user_id]) acc[item.user_id] = {
            name: item.first_name ? `${item.first_name} ${item.last_name}` : `User ${item.user_id.substring(0,8)}`,
            email: item.email,
            items: []
        };
        acc[item.user_id].items.push(item);
        return acc;
    }, {});

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800">
                    &larr; Volver
                </button>
                <h1 className="text-2xl font-bold text-slate-900">
                    Detalle de Nómina <span className="text-slate-400 text-lg">#{run.id.substring(0,8)}</span>
                </h1>
                <div className="ml-auto flex gap-3">
                    <button 
                        onClick={handleExport}
                        className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Exportar CSV
                    </button>
                    {run.status === 'draft' && (
                        <button 
                            onClick={() => handleStatusChange('approved')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium"
                        >
                            Aprobar Pagos
                        </button>
                    )}
                    {run.status === 'approved' && (
                        <span className="bg-emerald-100 text-emerald-800 px-4 py-2 rounded-lg font-medium">
                            Aprobado (Listo para Pago)
                        </span>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total a Pagar</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">
                        {run.currency_code || 'USD'} {Number(run.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Periodo</p>
                    <p className="text-lg font-medium text-slate-700 mt-2">
                        {run.period_start} <span className="text-slate-400 mx-2">➔</span> {run.period_end}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tipo de Ejecución</p>
                    <p className="text-lg font-medium text-slate-700 mt-2 capitalize">
                        {run.type === 'off_cycle' ? 'Off-Cycle (Extraordinaria)' : 'Regular (Ciclo Normal)'}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Estado</p>
                    <div className={`mt-2 inline-block px-3 py-1 rounded-full font-semibold capitalize ${
                        run.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 
                        run.status === 'paid' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                        {run.status.replace('_', ' ')}
                    </div>
                </div>
            </div>

            {/* Items List */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h2 className="font-bold text-lg text-slate-800">Detalle por Empleado</h2>
                    <button 
                        onClick={() => setNewItem({ ...newItem, amount: '' })} // Reset
                        className="text-sm text-brand font-semibold hover:underline"
                    >
                        + Agregar Item Manual
                    </button>
                </div>

                {/* Add Item Form (Simplified) */}
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex gap-2">
                     <input 
                        type="text" 
                        placeholder="User ID (UUID)" 
                        value={selectedUser || ''}
                        onChange={e => setSelectedUser(e.target.value)}
                        className="border rounded px-2 py-1 text-sm w-1/4"
                     />
                     <select 
                        value={newItem.type}
                        onChange={e => setNewItem({...newItem, type: e.target.value})}
                        className="border rounded px-2 py-1 text-sm"
                     >
                        <option value="earning">Ingreso</option>
                        <option value="deduction">Deducción</option>
                        <option value="reimbursement">Reembolso</option>
                     </select>
                     <input 
                        type="text" 
                        placeholder="Descripción" 
                        value={newItem.description}
                        onChange={e => setNewItem({...newItem, description: e.target.value})}
                        className="border rounded px-2 py-1 text-sm flex-1"
                     />
                     <input 
                        type="number" 
                        placeholder="Monto" 
                        value={newItem.amount}
                        onChange={e => setNewItem({...newItem, amount: e.target.value})}
                        className="border rounded px-2 py-1 text-sm w-24"
                     />
                     <button 
                        onClick={() => handleAddItem(selectedUser)}
                        className="bg-brand text-white px-3 py-1 rounded text-sm font-medium"
                     >
                        Agregar
                     </button>
                </div>

                <div className="divide-y divide-slate-100">
                    {Object.keys(itemsByUser).length === 0 ? (
                        <div className="p-8 text-center text-slate-400">No hay items en esta nómina.</div>
                    ) : (
                        Object.entries(itemsByUser).map(([userId, userData]) => (
                            <div key={userId} className="p-4 hover:bg-slate-50 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="font-bold text-slate-800">{userData.name}</p>
                                        <p className="text-xs text-slate-500">{userData.email || userId}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-slate-900">
                                            {run.currency_code} {userData.items.reduce((sum, i) => sum + (i.type === 'deduction' ? -Number(i.amount) : Number(i.amount)), 0).toFixed(2)}
                                        </p>
                                        <p className="text-xs text-slate-500">Neto a Pagar</p>
                                    </div>
                                </div>
                                
                                {/* Sub-items */}
                                <div className="pl-4 border-l-2 border-slate-200 space-y-1">
                                    {userData.items.map(item => (
                                        <div key={item.id} className="flex justify-between text-sm">
                                            <span className={`flex items-center gap-2 ${item.type === 'deduction' ? 'text-red-600' : 'text-slate-600'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${item.type === 'deduction' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                                {item.description}
                                            </span>
                                            <span className={item.type === 'deduction' ? 'text-red-600' : 'text-slate-700'}>
                                                {item.type === 'deduction' ? '-' : ''}{Number(item.amount).toFixed(2)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
