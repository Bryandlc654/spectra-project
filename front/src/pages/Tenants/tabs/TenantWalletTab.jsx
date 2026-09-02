import React, { useEffect, useState } from 'react';

export default function TenantWalletTab({ companyId, api, tenant }) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');

    const [modalOpen, setModalOpen] = useState(false);

    // Extract company info for currency display
    const company = tenant?.data?.company || tenant?.company || null;
    const currencyCode = company?.currency?.code || 'USD';
    const currencySymbol = company?.currency?.symbol || '$';

    const refreshData = async () => {
        setErr('');
        try {
            const res = await api.get(`/api/tenants/${companyId}/wallet`);
            const payload = res.data || res;
            setData(payload);
        } catch (e) { setErr(e.message); }
    };

    useEffect(() => {
        refreshData();
    }, [companyId, api]);

    if (err) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</div>;
    if (!data) return <div className="text-sm text-slate-600">Cargando wallet...</div>;

    const { wallet, transactions } = data;

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Balance Disponible</div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold text-slate-900">
                                {wallet?.balance ? Number(wallet.balance).toFixed(2) : '0.00'}
                            </span>
                            <span className="text-lg font-medium text-slate-500">{currencyCode}</span>
                        </div>
                        <div className="mt-1 text-sm text-slate-400">
                            Moneda ID: {wallet?.currency_id ?? '—'} ({currencySymbol})
                        </div>
                    </div>
                    <button
                        onClick={() => setModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Recargar
                    </button>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-semibold text-slate-800">Historial de Transacciones</h3>
                </div>
                
                {(!transactions || transactions.length === 0) ? (
                    <div className="p-10 text-center text-slate-500">
                        No hay transacciones registradas para este tenant.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3">Fecha</th>
                                    <th className="px-6 py-3">Descripción</th>
                                    <th className="px-6 py-3 text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {transactions.map((tx) => {
                                    const amount = Number(tx.amount || 0);
                                    const isPositive = amount >= 0;
                                    return (
                                        <tr key={tx.id} className="hover:bg-slate-50/50">
                                            <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                                                {tx.created_at ? new Date(tx.created_at).toLocaleDateString() + ' ' + new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '—'}
                                            </td>
                                            <td className="px-6 py-3 text-slate-900 font-medium">
                                                {tx.description || 'Sin descripción'}
                                            </td>
                                            <td className={`px-6 py-3 text-right font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {isPositive ? '+' : ''}{amount.toFixed(2)} {currencySymbol}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Deposit Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-semibold text-slate-900">Recargar Billetera</h3>
                            <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <DepositForm 
                            api={api} 
                            companyId={companyId} 
                            onSuccess={() => {
                                setModalOpen(false);
                                refreshData();
                            }}
                            onCancel={() => setModalOpen(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function DepositForm({ api, companyId, onSuccess, onCancel }) {
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!amount) return;
        
        setSubmitting(true);
        setError('');
        try {
            await api.post(`/api/tenants/${companyId}/wallet`, {
                amount: parseFloat(amount),
                description: description || 'Recarga manual'
            });
            onSuccess();
        } catch (err) {
            setError(err.message || 'Error al recargar');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-100">
                    {error}
                </div>
            )}
            
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto a recargar</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-500">$</span>
                    </div>
                    <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        className="block w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nota / Referencia</label>
                <textarea
                    rows={2}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Ej. Transferencia bancaria #1234"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>

            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {submitting ? 'Procesando...' : 'Confirmar Recarga'}
                </button>
            </div>
        </form>
    );
}
