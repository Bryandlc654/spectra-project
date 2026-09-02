import React, { useState, useEffect } from 'react';

// --- Sub-components ---

function PayrollSettingsView({ companyId, api }) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        cycle_type: 'monthly',
        cutoff_day_1: 30,
        cutoff_day_2: 15,
        payment_day_1: 5,
        payment_day_2: 20
    });

    useEffect(() => {
        loadSettings();
    }, [companyId]);

    async function loadSettings() {
        setLoading(true);
        try {
            const res = await api.get(`/api/companies/${companyId}/payroll-settings`);
            if (res) {
                setSettings(prev => ({ ...prev, ...res }));
            }
        } catch (e) {
            console.error('Error loading payroll settings', e);
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post(`/api/companies/${companyId}/payroll-settings`, settings);
            alert('Configuración guardada correctamente');
        } catch (e) {
            alert(e.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    }

    const handleChange = (f, v) => setSettings(p => ({ ...p, [f]: v }));

    if (loading) return <div className="p-10 text-center text-slate-500">Cargando configuración de nómina...</div>;

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-slate-900">Configuración de ciclo de nómina</h3>
                <p className="mt-1 text-sm text-slate-500">
                    Define cada cuánto se ejecuta la nómina y en qué días se realizan los cortes y pagos.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700">Tipo de Ciclo</label>
                    <select 
                        value={settings.cycle_type}
                        onChange={e => handleChange('cycle_type', e.target.value)}
                        className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                        <option value="monthly">Mensual</option>
                        <option value="biweekly">Quincenal</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700">
                        {settings.cycle_type === 'monthly' ? 'Día de Corte' : 'Día de Corte (2da Quincena)'}
                    </label>
                    <input 
                        type="number" 
                        min="1" max="31"
                        value={settings.cutoff_day_1}
                        onChange={e => handleChange('cutoff_day_1', parseInt(e.target.value))}
                        className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">
                        {settings.cycle_type === 'monthly' ? 'Día de Pago' : 'Día de Pago (2da Quincena)'}
                    </label>
                    <input 
                        type="number" 
                        min="1" max="31"
                        value={settings.payment_day_1}
                        onChange={e => handleChange('payment_day_1', parseInt(e.target.value))}
                        className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                </div>
            </div>

            {settings.cycle_type === 'biweekly' && (
                <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Día de Corte (1ra Quincena)</label>
                        <input 
                            type="number" 
                            min="1" max="31"
                            value={settings.cutoff_day_2 || 15}
                            onChange={e => handleChange('cutoff_day_2', parseInt(e.target.value))}
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Día de Pago (1ra Quincena)</label>
                        <input 
                            type="number" 
                            min="1" max="31"
                            value={settings.payment_day_2 || 20}
                            onChange={e => handleChange('payment_day_2', parseInt(e.target.value))}
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                    </div>
                </div>
            )}

            <div className="pt-4 flex justify-end">
                <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                >
                    {saving ? 'Guardando...' : 'Guardar Configuración'}
                </button>
            </div>
        </form>
    );
}

function RunDetailsModal({ run, onClose, api, onUpdate }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        loadItems();
    }, [run.id]);

    async function loadItems() {
        try {
            const res = await api.get(`/api/payroll/items?payroll_run_id=${run.id}`);
            setItems(res.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    async function handleCalculate() {
        if (!confirm('¿Recalcular nómina? Esto sobrescribirá los cálculos actuales.')) return;
        setProcessing(true);
        try {
            await api.post(`/api/payroll/runs/${run.id}/calculate`);
            await loadItems();
            onUpdate(); // Refresh parent list
            alert('Cálculo completado');
        } catch (e) {
            alert(e.message || 'Error al calcular');
        } finally {
            setProcessing(false);
        }
    }

    async function handleApprove() {
        if (!confirm('¿Aprobar nómina? Pasará a estado de procesamiento.')) return;
        setProcessing(true);
        try {
            await api.put(`/api/payroll/runs/${run.id}`, { status: 'processing' });
            onUpdate();
            onClose();
        } catch (e) {
            alert(e.message);
        } finally {
            setProcessing(false);
        }
    }

    async function handlePay() {
        if (!confirm('¿Pagar nómina ahora? Se generarán facturas y se descontará de la billetera.')) return;
        setProcessing(true);
        try {
            await api.put(`/api/payroll/runs/${run.id}`, { status: 'paid' });
            onUpdate();
            onClose();
        } catch (e) {
            alert(e.message);
        } finally {
            setProcessing(false);
        }
    }

    async function handleExport() {
        window.open(`${api.baseUrl}/api/payroll/items?export=csv&payroll_run_id=${run.id}`, '_blank');
    }

    // Group items by user
    const itemsByUser = items.reduce((acc, item) => {
        const uid = item.user_id;
        if (!acc[uid]) acc[uid] = { name: `${item.first_name} ${item.last_name}`, email: item.email, earnings: 0, deductions: 0, net: 0, items: [] };
        acc[uid].items.push(item);
        
        const amt = parseFloat(item.amount);
        if (item.type === 'earning' || item.type === 'reimbursement') acc[uid].earnings += amt;
        if (item.type === 'deduction' || item.type === 'tax') acc[uid].deductions += amt;
        
        return acc;
    }, {});

    Object.values(itemsByUser).forEach(u => {
        u.net = u.earnings - u.deductions;
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Detalle de Nómina</h3>
                        <p className="text-sm text-slate-500">
                            Periodo: {run.period_start} - {run.period_end} | Estado: <span className="font-semibold uppercase">{run.status}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <span className="sr-only">Cerrar</span>
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1">
                    {loading ? (
                        <div className="text-center py-10">Cargando detalles...</div>
                    ) : (
                        <div className="space-y-6">
                            {/* Actions Toolbar */}
                            <div className="flex flex-wrap gap-3">
                                {run.status === 'draft' && (
                                    <>
                                        <button 
                                            onClick={handleCalculate}
                                            disabled={processing}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            {processing ? 'Calculando...' : 'Calcular Nómina'}
                                        </button>
                                        <button 
                                            onClick={handleApprove}
                                            disabled={processing}
                                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            Aprobar para Pago
                                        </button>
                                    </>
                                )}
                                {run.status === 'processing' && (
                                    <button 
                                        onClick={handlePay}
                                        disabled={processing}
                                        className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                                    >
                                        Ejecutar Pagos
                                    </button>
                                )}
                                <button 
                                    onClick={handleExport}
                                    className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
                                >
                                    Exportar CSV
                                </button>
                            </div>

                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                    <div className="text-sm text-slate-500">Total Devengado</div>
                                    <div className="text-2xl font-bold text-slate-900">
                                        ${Object.values(itemsByUser).reduce((s, u) => s + u.earnings, 0).toFixed(2)}
                                    </div>
                                </div>
                                <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                                    <div className="text-sm text-red-600">Total Retenciones</div>
                                    <div className="text-2xl font-bold text-red-700">
                                        ${Object.values(itemsByUser).reduce((s, u) => s + u.deductions, 0).toFixed(2)}
                                    </div>
                                </div>
                                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                                    <div className="text-sm text-emerald-600">Total a Pagar (Neto)</div>
                                    <div className="text-2xl font-bold text-emerald-700">
                                        ${Object.values(itemsByUser).reduce((s, u) => s + u.net, 0).toFixed(2)}
                                    </div>
                                </div>
                            </div>

                            {/* Employees List */}
                            <div className="border rounded-lg overflow-hidden">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Empleado</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Devengado</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Retenciones</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Neto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-200">
                                        {Object.values(itemsByUser).map((u, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-slate-900">{u.name}</div>
                                                    <div className="text-sm text-slate-500">{u.email}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900 font-medium">
                                                    {u.earnings.toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-red-600">
                                                    -{u.deductions.toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-emerald-600">
                                                    {u.net.toFixed(2)}
                                                </td>
                                            </tr>
                                        ))}
                                        {Object.keys(itemsByUser).length === 0 && (
                                            <tr>
                                                <td colSpan="4" className="px-6 py-10 text-center text-slate-500">
                                                    No hay items calculados. Haz clic en "Calcular Nómina".
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function PayrollRunsView({ companyId, api }) {
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [selectedRun, setSelectedRun] = useState(null);
    const [statusFilter, setStatusFilter] = useState('');

    // Create Form State
    const [newRun, setNewRun] = useState({
        period_start: '',
        period_end: '',
        payment_date: '',
        type: 'regular'
    });

    useEffect(() => {
        loadRuns();
    }, [companyId]);

    async function loadRuns() {
        setLoading(true);
        try {
            const res = await api.get(`/api/payroll/runs?company_id=${companyId}`);
            setRuns(res.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreate(e) {
        e.preventDefault();
        try {
            await api.post('/api/payroll/runs', { ...newRun, company_id: companyId });
            setShowCreate(false);
            loadRuns();
            // Reset form
            setNewRun({ period_start: '', period_end: '', payment_date: '', type: 'regular' });
        } catch (e) {
            alert(e.message || 'Error al crear ejecución');
        }
    }

    const stats = runs.reduce(
        (acc, run) => {
            const status = String(run.status || 'draft').toLowerCase();
            acc.total += 1;
            if (status === 'draft') acc.draft += 1;
            else if (status === 'processing') acc.processing += 1;
            else if (status === 'paid') acc.paid += 1;
            return acc;
        },
        { total: 0, draft: 0, processing: 0, paid: 0 }
    );

    const filteredRuns = statusFilter
        ? runs.filter(r => String(r.status || 'draft').toLowerCase() === statusFilter)
        : runs;

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">Ejecuciones de nómina</h3>
                    <p className="mt-1 text-sm text-slate-500">
                        Crea y gestiona las ejecuciones de nómina desde el cálculo hasta el pago.
                    </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                        <option value="">Todos los estados</option>
                        <option value="draft">Borrador</option>
                        <option value="processing">Procesando</option>
                        <option value="paid">Pagado</option>
                    </select>
                    <button 
                        onClick={() => setShowCreate(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                    >
                        <span className="text-lg leading-none">+</span> Nueva nómina
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-slate-500" />
                    Total: {stats.total}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    Borrador: {stats.draft}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-blue-700">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    Procesando: {stats.processing}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Pagado: {stats.paid}
                </span>
            </div>

            {showCreate && (
                <form onSubmit={handleCreate} className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Inicio Periodo</label>
                        <input 
                            type="date" required
                            value={newRun.period_start}
                            onChange={e => setNewRun({...newRun, period_start: e.target.value})}
                            className="block w-full rounded-md border-slate-300 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Fin Periodo</label>
                        <input 
                            type="date" required
                            value={newRun.period_end}
                            onChange={e => setNewRun({...newRun, period_end: e.target.value})}
                            className="block w-full rounded-md border-slate-300 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Fecha Pago</label>
                        <input 
                            type="date" required
                            value={newRun.payment_date}
                            onChange={e => setNewRun({...newRun, payment_date: e.target.value})}
                            className="block w-full rounded-md border-slate-300 text-sm"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="flex-1 bg-emerald-600 text-white px-3 py-2 rounded-md text-sm hover:bg-emerald-700">Crear</button>
                        <button type="button" onClick={() => setShowCreate(false)} className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-md text-sm hover:bg-slate-50">Cancelar</button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="text-center py-10 text-slate-500">Cargando...</div>
            ) : runs.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-lg border border-dashed border-slate-300 text-slate-500">
                    No hay ejecuciones de nómina registradas.
                </div>
            ) : filteredRuns.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-lg border border-dashed border-slate-300 text-slate-500">
                    No hay ejecuciones con el estado seleccionado.
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Periodo</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fecha Pago</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Total</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {filteredRuns.map(run => (
                                <tr key={run.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelectedRun(run)}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">
                                        {run.period_start} al {run.period_end}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                        {run.payment_date || '—'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                            ${run.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 
                                              run.status === 'processing' ? 'bg-blue-100 text-blue-800' : 
                                              'bg-slate-100 text-slate-800'}`}>
                                            {run.status === 'paid' ? 'Pagado' : 
                                             run.status === 'processing' ? 'Procesando' : 
                                             'Borrador'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-slate-900">
                                        {run.total_amount ? `$${Number(run.total_amount).toFixed(2)}` : '—'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            type="button"
                                            onClick={e => {
                                                e.stopPropagation();
                                                setSelectedRun(run);
                                            }}
                                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-900"
                                        >
                                            <span>Ver detalles</span>
                                            <i className="bi bi-arrow-right-short" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {selectedRun && (
                <RunDetailsModal 
                    run={selectedRun} 
                    api={api} 
                    onClose={() => setSelectedRun(null)} 
                    onUpdate={() => { loadRuns(); setSelectedRun(null); }}
                />
            )}
        </div>
    );
}

// --- Main Component ---

export default function TenantPayrollTab({ companyId, api }) {
    const [activeTab, setActiveTab] = useState('runs');

    const tabs = [
        { id: 'runs', label: 'Ejecuciones' },
        { id: 'settings', label: 'Configuración' }
    ];

    return (
        <div className="space-y-6">
            {/* Tabs Header */}
            <div className="border-b border-slate-200">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                                ${activeTab === tab.id
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
                            `}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
                {activeTab === 'runs' && <PayrollRunsView companyId={companyId} api={api} />}
                {activeTab === 'settings' && <PayrollSettingsView companyId={companyId} api={api} />}
            </div>
        </div>
    );
}
