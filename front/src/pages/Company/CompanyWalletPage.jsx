import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createApi, resolveApiUrl } from '../../lib/api';
import TenantWalletTab from '../Tenants/tabs/TenantWalletTab';

export default function CompanyWalletPage() {
    const { user, token } = useAuth();
    const apiUrl = resolveApiUrl();
    const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
    
    const [tenant, setTenant] = useState(null);
    const [loading, setLoading] = useState(true);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [payouts, setPayouts] = useState([]);
    const [creatingAccount, setCreatingAccount] = useState(false);
    const [requestingPayout, setRequestingPayout] = useState(false);
    const [newAccount, setNewAccount] = useState({ bank_name: '', account_number: '', account_holder: '', currency: 'USD' });
    const [payoutForm, setPayoutForm] = useState({ amount: '', currency: 'USD', bank_account_id: '' });
    const [err, setErr] = useState('');

    useEffect(() => {
        if (user?.company_id) {
            loadTenant();
        }
    }, [user?.company_id]);

    const loadTenant = async () => {
        try {
            const res = await api.get(`/api/tenants/${user.company_id}`);
            setTenant(res.data || res);
        } catch (e) {
            console.error('Error loading tenant info', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!user?.company_id || !api) return;
        loadBankAccounts();
        loadPayouts();
    }, [user?.company_id, api]);

    const loadBankAccounts = async () => {
        try {
            const res = await api.get(`/api/tenants/${user.company_id}/bank-accounts`);
            const data = res.data || res;
            setBankAccounts(Array.isArray(data) ? data : data.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    const loadPayouts = async () => {
        try {
            const res = await api.get(`/api/tenants/${user.company_id}/payouts`);
            const data = res.data || res;
            setPayouts(Array.isArray(data) ? data : data.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    const createBankAccount = async (e) => {
        e.preventDefault();
        setErr('');
        setCreatingAccount(true);
        try {
            await api.post(`/api/tenants/${user.company_id}/bank-accounts`, newAccount);
            setNewAccount({ bank_name: '', account_number: '', account_holder: '', currency: 'USD' });
            await loadBankAccounts();
        } catch (e) {
            setErr(e.message || 'Error creando cuenta');
        } finally {
            setCreatingAccount(false);
        }
    };

    const requestPayout = async (e) => {
        e.preventDefault();
        setErr('');
        setRequestingPayout(true);
        try {
            await api.post(`/api/tenants/${user.company_id}/payouts`, {
                amount: Number(payoutForm.amount || 0),
                currency: payoutForm.currency,
                bank_account_id: payoutForm.bank_account_id
            });
            setPayoutForm({ amount: '', currency: 'USD', bank_account_id: '' });
            await loadPayouts();
        } catch (e) {
            setErr(e.message || 'Error solicitando payout');
        } finally {
            setRequestingPayout(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Cargando billetera...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 text-slate-900">Billetera y Pagos</h1>
            <TenantWalletTab 
                api={api} 
                companyId={user.company_id} 
                tenantId={user.company_id} 
                tenant={tenant} 
            />

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Cuentas bancarias</h2>
                            <p className="text-sm text-slate-500">Cuentas destino para retiros y pagos.</p>
                        </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Banco</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Cuenta</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Titular</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Moneda</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {bankAccounts.map((acc, idx) => (
                                    <tr key={acc.id || idx}>
                                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{acc.bank_name}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{acc.account_number}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{acc.account_holder}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{acc.currency || 'USD'}</td>
                                    </tr>
                                ))}
                                {bankAccounts.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-4 py-4 text-center text-sm text-slate-500">Sin cuentas registradas.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <form onSubmit={createBankAccount} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                            className="rounded-xl border-slate-300 text-sm"
                            placeholder="Banco"
                            value={newAccount.bank_name}
                            onChange={e => setNewAccount({ ...newAccount, bank_name: e.target.value })}
                            required
                        />
                        <input
                            className="rounded-xl border-slate-300 text-sm"
                            placeholder="Número de cuenta"
                            value={newAccount.account_number}
                            onChange={e => setNewAccount({ ...newAccount, account_number: e.target.value })}
                            required
                        />
                        <input
                            className="rounded-xl border-slate-300 text-sm"
                            placeholder="Titular"
                            value={newAccount.account_holder}
                            onChange={e => setNewAccount({ ...newAccount, account_holder: e.target.value })}
                            required
                        />
                        <select
                            className="rounded-xl border-slate-300 text-sm"
                            value={newAccount.currency}
                            onChange={e => setNewAccount({ ...newAccount, currency: e.target.value })}
                        >
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="COP">COP</option>
                            <option value="MXN">MXN</option>
                        </select>
                        <div className="sm:col-span-2 flex justify-end">
                            <button
                                type="submit"
                                disabled={creatingAccount}
                                className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                                {creatingAccount ? 'Guardando...' : 'Agregar cuenta'}
                            </button>
                        </div>
                    </form>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Retiros / Payouts</h2>
                            <p className="text-sm text-slate-500">Historial y solicitud de retiros.</p>
                        </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Fecha</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Monto</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Moneda</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Cuenta</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {payouts.map((p, idx) => (
                                    <tr key={p.id || idx}>
                                        <td className="px-4 py-3 text-sm text-slate-600">{p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</td>
                                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{p.amount}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{p.currency || 'USD'}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{p.bank_account_id || '—'}</td>
                                        <td className="px-4 py-3 text-sm">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                p.status === 'processed' ? 'bg-emerald-50 text-emerald-700' :
                                                p.status === 'failed' ? 'bg-red-50 text-red-700' :
                                                'bg-yellow-50 text-yellow-700'
                                            }`}>
                                                {p.status || 'pending'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {payouts.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="px-4 py-4 text-center text-sm text-slate-500">Sin retiros registrados.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <form onSubmit={requestPayout} className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                            className="rounded-xl border-slate-300 text-sm"
                            placeholder="Monto"
                            type="number"
                            min="0"
                            step="0.01"
                            value={payoutForm.amount}
                            onChange={e => setPayoutForm({ ...payoutForm, amount: e.target.value })}
                            required
                        />
                        <select
                            className="rounded-xl border-slate-300 text-sm"
                            value={payoutForm.currency}
                            onChange={e => setPayoutForm({ ...payoutForm, currency: e.target.value })}
                        >
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="COP">COP</option>
                            <option value="MXN">MXN</option>
                        </select>
                        <select
                            className="rounded-xl border-slate-300 text-sm"
                            value={payoutForm.bank_account_id}
                            onChange={e => setPayoutForm({ ...payoutForm, bank_account_id: e.target.value })}
                            required
                        >
                            <option value="">Cuenta destino</option>
                            {bankAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                    {acc.bank_name} - {acc.account_number}
                                </option>
                            ))}
                        </select>
                        <div className="sm:col-span-3 flex justify-end">
                            <button
                                type="submit"
                                disabled={requestingPayout}
                                className="inline-flex items-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                            >
                                {requestingPayout ? 'Enviando...' : 'Solicitar payout'}
                            </button>
                        </div>
                    </form>
                    {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
                </section>
            </div>
        </div>
    );
}
