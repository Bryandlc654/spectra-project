import { downloadFile } from '../../../lib/api';
import React, { useState, useEffect } from 'react';
import { useI18n } from '../../../i18n/I18nContext';

// --- Sub-components ---

function PayrollSettingsView({ companyId, api }) {
    const { t } = useI18n();
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
            alert(t('tenants.finance.payroll.settingsSaved'));
        } catch (e) {
            alert(e.message || t('tenants.finance.payroll.saveError'));
        } finally {
            setSaving(false);
        }
    }

    const handleChange = (f, v) => setSettings(p => ({ ...p, [f]: v }));

    if (loading) return <div className="p-10 text-center text-slate-500">{t('tenants.finance.payroll.settingsLoading')}</div>;

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-slate-900">{t('tenants.finance.payroll.settingsTitle')}</h3>
                <p className="mt-1 text-sm text-slate-500">
                    {t('tenants.finance.payroll.settingsSubtitle')}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700">{t('tenants.finance.payroll.cycleType')}</label>
                    <select 
                        value={settings.cycle_type}
                        onChange={e => handleChange('cycle_type', e.target.value)}
                        className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                        <option value="monthly">{t('tenants.finance.payroll.monthly')}</option>
                        <option value="biweekly">{t('tenants.finance.payroll.biweekly')}</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700">
                        {settings.cycle_type === 'monthly' ? t('tenants.finance.payroll.cutoffDay') : t('tenants.finance.payroll.cutoffDaySecond')}
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
                        {settings.cycle_type === 'monthly' ? t('tenants.finance.payroll.paymentDay') : t('tenants.finance.payroll.paymentDaySecond')}
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
                        <label className="block text-sm font-medium text-slate-700">{t('tenants.finance.payroll.cutoffDayFirst')}</label>
                        <input 
                            type="number" 
                            min="1" max="31"
                            value={settings.cutoff_day_2 || 15}
                            onChange={e => handleChange('cutoff_day_2', parseInt(e.target.value))}
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">{t('tenants.finance.payroll.paymentDayFirst')}</label>
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
                    {saving ? t('tenants.common.saving') : t('tenants.finance.payroll.saveSettings')}
                </button>
            </div>
        </form>
    );
}

function RunDetailsModal({ run, onClose, api, onUpdate }) {
    const { t, language } = useI18n();
    const locale = language === 'en' ? 'en-US' : 'es-ES';
    const formatAmount = (value) => Number(value || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
        if (!confirm(t('tenants.finance.payroll.confirmCalculate'))) return;
        setProcessing(true);
        try {
            await api.post(`/api/payroll/runs/${run.id}/calculate`);
            await loadItems();
            onUpdate(); // Refresh parent list
            alert(t('tenants.finance.payroll.calculateDone'));
        } catch (e) {
            alert(e.message || t('tenants.finance.payroll.calculateError'));
        } finally {
            setProcessing(false);
        }
    }

    async function handleApprove() {
        if (!confirm(t('tenants.finance.payroll.confirmApprove'))) return;
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
        if (!confirm(t('tenants.finance.payroll.confirmPay'))) return;
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
        try {
            await downloadFile(null, `/api/payroll/items?export=csv&payroll_run_id=${encodeURIComponent(run.id)}`, `nomina-${run.id}.csv`);
        } catch (e) {
            alert(e.message);
        }
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
                        <h3 className="text-xl font-bold text-slate-900">{t('tenants.finance.payroll.runDetailTitle')}</h3>
                        <p className="text-sm text-slate-500">
                            {t('tenants.finance.payroll.runPeriodStatusPrefix', { start: run.period_start, end: run.period_end })} <span className="font-semibold uppercase">{run.status}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <span className="sr-only">{t('tenants.common.close')}</span>
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1">
                    {loading ? (
                        <div className="text-center py-10">{t('tenants.finance.payroll.detailLoading')}</div>
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
                                            {processing ? t('tenants.finance.payroll.calculating') : t('tenants.finance.payroll.calculate')}
                                        </button>
                                        <button 
                                            onClick={handleApprove}
                                            disabled={processing}
                                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            {t('tenants.finance.payroll.approve')}
                                        </button>
                                    </>
                                )}
                                {run.status === 'processing' && (
                                    <button 
                                        onClick={handlePay}
                                        disabled={processing}
                                        className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                                    >
                                        {t('tenants.finance.payroll.executePayments')}
                                    </button>
                                )}
                                <button 
                                    onClick={handleExport}
                                    className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
                                >
                                    {t('tenants.finance.payroll.exportCsv')}
                                </button>
                            </div>

                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                    <div className="text-sm text-slate-500">{t('tenants.finance.payroll.totalEarned')}</div>
                                    <div className="text-2xl font-bold text-slate-900">
                                        ${formatAmount(Object.values(itemsByUser).reduce((s, u) => s + u.earnings, 0))}
                                    </div>
                                </div>
                                <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                                    <div className="text-sm text-red-600">{t('tenants.finance.payroll.totalDeductions')}</div>
                                    <div className="text-2xl font-bold text-red-700">
                                        ${formatAmount(Object.values(itemsByUser).reduce((s, u) => s + u.deductions, 0))}
                                    </div>
                                </div>
                                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                                    <div className="text-sm text-emerald-600">{t('tenants.finance.payroll.totalNet')}</div>
                                    <div className="text-2xl font-bold text-emerald-700">
                                        ${formatAmount(Object.values(itemsByUser).reduce((s, u) => s + u.net, 0))}
                                    </div>
                                </div>
                            </div>

                            {/* Employees List */}
                            <div className="border rounded-lg overflow-hidden">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{t('tenants.finance.payroll.employee')}</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">{t('tenants.finance.payroll.earned')}</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">{t('tenants.finance.payroll.deductions')}</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">{t('tenants.finance.payroll.net')}</th>
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
                                                    {formatAmount(u.earnings)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-red-600">
                                                    -{formatAmount(u.deductions)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-emerald-600">
                                                    {formatAmount(u.net)}
                                                </td>
                                            </tr>
                                        ))}
                                        {Object.keys(itemsByUser).length === 0 && (
                                            <tr>
                                                <td colSpan="4" className="px-6 py-10 text-center text-slate-500">
                                                    {t('tenants.finance.payroll.noItems')}
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
    const { t, language } = useI18n();
    const locale = language === 'en' ? 'en-US' : 'es-ES';
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
            alert(e.message || t('tenants.finance.payroll.createError'));
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
                    <h3 className="text-lg font-semibold text-slate-900">{t('tenants.finance.payroll.runsTitle')}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                        {t('tenants.finance.payroll.runsSubtitle')}
                    </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                        <option value="">{t('tenants.finance.payroll.allStatuses')}</option>
                        <option value="draft">{t('tenants.finance.payroll.status.draft')}</option>
                        <option value="processing">{t('tenants.finance.payroll.status.processing')}</option>
                        <option value="paid">{t('tenants.finance.payroll.status.paid')}</option>
                    </select>
                    <button 
                        onClick={() => setShowCreate(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                    >
                        <span className="text-lg leading-none">+</span> {t('tenants.finance.payroll.newRun')}
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-slate-500" />
                    {t('tenants.finance.payroll.totalCount', { count: stats.total })}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    {t('tenants.finance.payroll.draftCount', { count: stats.draft })}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-blue-700">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    {t('tenants.finance.payroll.processingCount', { count: stats.processing })}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {t('tenants.finance.payroll.paidCount', { count: stats.paid })}
                </span>
            </div>

            {showCreate && (
                <form onSubmit={handleCreate} className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">{t('tenants.finance.payroll.periodStart')}</label>
                        <input 
                            type="date" required
                            value={newRun.period_start}
                            onChange={e => setNewRun({...newRun, period_start: e.target.value})}
                            className="block w-full rounded-md border-slate-300 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">{t('tenants.finance.payroll.periodEnd')}</label>
                        <input 
                            type="date" required
                            value={newRun.period_end}
                            onChange={e => setNewRun({...newRun, period_end: e.target.value})}
                            className="block w-full rounded-md border-slate-300 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">{t('tenants.finance.payroll.paymentDate')}</label>
                        <input 
                            type="date" required
                            value={newRun.payment_date}
                            onChange={e => setNewRun({...newRun, payment_date: e.target.value})}
                            className="block w-full rounded-md border-slate-300 text-sm"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="flex-1 bg-emerald-600 text-white px-3 py-2 rounded-md text-sm hover:bg-emerald-700">{t('tenants.common.create')}</button>
                        <button type="button" onClick={() => setShowCreate(false)} className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-md text-sm hover:bg-slate-50">{t('tenants.common.cancel')}</button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="text-center py-10 text-slate-500">{t('tenants.common.loading')}</div>
            ) : runs.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-lg border border-dashed border-slate-300 text-slate-500">
                    {t('tenants.finance.payroll.runsEmpty')}
                </div>
            ) : filteredRuns.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-lg border border-dashed border-slate-300 text-slate-500">
                    {t('tenants.finance.payroll.runsEmptyFilter')}
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{t('tenants.finance.payroll.period')}</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{t('tenants.finance.payroll.paymentDate')}</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{t('tenants.common.status')}</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">{t('tenants.finance.payroll.total')}</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">{t('tenants.common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {filteredRuns.map(run => (
                                <tr key={run.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelectedRun(run)}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">
                                        {t('tenants.finance.payroll.periodRange', { start: run.period_start, end: run.period_end })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                        {run.payment_date || t('tenants.common.notAvailable')}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                            ${run.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 
                                              run.status === 'processing' ? 'bg-blue-100 text-blue-800' : 
                                              'bg-slate-100 text-slate-800'}`}>
                                            {run.status === 'paid' ? t('tenants.finance.payroll.status.paid') : 
                                             run.status === 'processing' ? t('tenants.finance.payroll.status.processing') : 
                                             t('tenants.finance.payroll.status.draft')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-slate-900">
                                        {run.total_amount ? `$${Number(run.total_amount).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : t('tenants.common.notAvailable')}
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
                                            <span>{t('tenants.common.viewDetail')}</span>
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
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState('runs');

    const tabs = [
        { id: 'runs', label: t('tenants.finance.payroll.tabRuns') },
        { id: 'settings', label: t('tenants.finance.payroll.tabSettings') }
    ];

    return (
        <div className="space-y-6">
            {/* Tabs Header */}
            <div className="border-b border-slate-200">
                <nav className="-mb-px flex space-x-8" aria-label={t('tenants.finance.payroll.tabsLabel')}>
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
