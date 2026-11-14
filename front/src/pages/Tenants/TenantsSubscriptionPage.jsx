import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createApi } from '../../lib/api';
import { normalizePageResponse } from '../../lib/pagination';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../i18n/I18nContext';

export default function TenantsSubscriptionPage({ apiUrl, token }) {
    const { t, language } = useI18n();
    const locale = language === 'en' ? 'en-US' : 'es-ES';
    const amountFormatter = useMemo(
        () => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        [locale]
    );
    const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
    const navigate = useNavigate();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState([]);
    const [meta, setMeta] = useState(null);
    const [q, setQ] = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [page, setPage] = useState(1);
    const [period, setPeriod] = useState('current_month');
    const [startModalOpen, setStartModalOpen] = useState(false);
    const [companySearch, setCompanySearch] = useState('');
    const [companyResults, setCompanyResults] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [freelancerSearch, setFreelancerSearch] = useState('');
    const [freelancerResults, setFreelancerResults] = useState([]);
    const [selectedFreelancer, setSelectedFreelancer] = useState(null);
    const [createStep, setCreateStep] = useState(1);
    const [currencies, setCurrencies] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [formTemplateId, setFormTemplateId] = useState('');
    const [formTitle, setFormTitle] = useState('');
    const [formType, setFormType] = useState('fixed');
    const [formRate, setFormRate] = useState('');
    const [formCurrencyId, setFormCurrencyId] = useState('');
    const [formStart, setFormStart] = useState('');
    const [formEnd, setFormEnd] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchData();
    }, [page, debouncedQ, period]);

    async function fetchData() {
        setLoading(true);
        try {
            const res = await api.get(`/api/analytics/contracts-subscriptions?page=${page}&q=${encodeURIComponent(debouncedQ)}&period=${encodeURIComponent(period)}`);
            const { items, meta: m } = normalizePageResponse(res);
            setData(items || []);
            setMeta(m);
        } catch (e) {
            setData([]);
            setMeta(null);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const t = setTimeout(() => setDebouncedQ(q.trim()), 400);
        return () => clearTimeout(t);
    }, [q]);

    useEffect(() => {
        if (!startModalOpen) return;
        if (!companySearch || companySearch.length < 2) {
            setCompanyResults([]);
            return;
        }
        const t = setTimeout(async () => {
            try {
                const res = await api.get(`/api/tenants?q=${encodeURIComponent(companySearch)}&per_page=10&page=1`);
                const out = normalizePageResponse(res);
                setCompanyResults(out.items || []);
            } catch {
                setCompanyResults([]);
            }
        }, 400);
        return () => clearTimeout(t);
    }, [companySearch, startModalOpen, api]);

    useEffect(() => {
        if (!startModalOpen) return;
        if (!freelancerSearch || freelancerSearch.length < 2) {
            setFreelancerResults([]);
            return;
        }
        const t = setTimeout(async () => {
            try {
                const res = await api.get(`/api/freelancers?q=${encodeURIComponent(freelancerSearch)}&per_page=10&page=1`);
                const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
                setFreelancerResults(items || []);
            } catch {
                setFreelancerResults([]);
            }
        }, 400);
        return () => clearTimeout(t);
    }, [freelancerSearch, startModalOpen, api]);

    function handleGoManage() {
        if (!selectedCompany || !selectedFreelancer) return;
        setCreateStep(2);
    }

    useEffect(() => {
        if (!(startModalOpen && createStep === 2 && selectedCompany)) return;
        api.get('/api/currencies?per_page=200')
            .then(res => {
                const items = Array.isArray(res) ? res : (res.data || []);
                setCurrencies(items);
                if (!formCurrencyId && items.length > 0) {
                    setFormCurrencyId(String(items[0].id));
                }
            })
            .catch(() => {});

        api.get(`/api/tenants/${selectedCompany.id}/contract-templates?status=active`)
            .then(res => {
                const items = Array.isArray(res) ? res : (res.data || []);
                setTemplates(items);
                if (!formTemplateId && items.length > 0) {
                    const first = items[0];
                    const firstId = String(first.id);
                    setFormTemplateId(firstId);
                    if (!formTitle && first.title) {
                        setFormTitle(first.title);
                    }
                    if (first.type) {
                        setFormType(first.type);
                    }
                }
            })
            .catch(() => {});
    }, [startModalOpen, createStep, api, selectedCompany, formCurrencyId, formTemplateId, formTitle]);

    async function handleCreateContract(e) {
        e.preventDefault();
        if (!selectedCompany || !selectedFreelancer) return;
        setSubmitting(true);
        try {
            const payload = {
                title: formTitle,
                type: formType,
                freelancer_id: selectedFreelancer.id,
                template_id: formTemplateId || undefined,
                currency_id: formCurrencyId ? Number(formCurrencyId) : undefined,
                rate: formRate,
                start_date: formStart,
                end_date: formEnd || null
            };
            await api.post(`/api/tenants/${selectedCompany.id}/contracts`, payload);
            toast.success(t('tenants.detail.subscription.created'));
            setStartModalOpen(false);
            setCreateStep(1);
            setSelectedCompany(null);
            setSelectedFreelancer(null);
            setTemplates([]);
            setFormTitle('');
            setFormType('fixed');
            setFormRate('');
            setFormCurrencyId('');
            setFormTemplateId('');
            setFormStart('');
            setFormEnd('');
        } catch (err) {
            toast.error(err.message || t('tenants.detail.subscription.createError'));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">{t('tenants.detail.subscription.title')}</h1>
                    <p className="text-slate-600">
                        {t('tenants.detail.subscription.subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <label htmlFor="subscription-period" className="text-sm text-slate-600">{t('tenants.detail.subscription.periodLabel')}</label>
                    <select
                        id="subscription-period"
                        value={period}
                        onChange={e => {
                            setPage(1);
                            setPeriod(e.target.value);
                        }}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
                    >
                        <option value="current_month">{t('tenants.detail.subscription.periodCurrentMonth')}</option>
                        <option value="last_month">{t('tenants.detail.subscription.periodLastMonth')}</option>
                    </select>
                    <button
                        onClick={() => setStartModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand/20 hover:bg-brand-600"
                    >
                        <i className="bi bi-plus-lg" />
                        {t('tenants.detail.subscription.start')}
                    </button>
                </div>
            </div>

            <div className="flex gap-4">
                <input 
                    type="text" 
                    placeholder={t('tenants.detail.subscription.searchCompanyPlaceholder')} 
                    aria-label={t('tenants.detail.subscription.searchCompanyPlaceholder')}
                    className="w-full max-w-sm rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-brand"
                    value={q}
                    onChange={e => {
                        setPage(1);
                        setQ(e.target.value);
                    }}
                />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4">{t('tenants.detail.company')}</th>
                                <th className="px-6 py-4 text-right">{t('tenants.detail.subscription.tableContracts')}</th>
                                <th className="px-6 py-4 text-right">{t('tenants.detail.subscription.tableTotal')}</th>
                                <th className="px-6 py-4 text-right">{t('tenants.common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && data.length === 0 ? (
                                <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-500">{t('tenants.common.loading')}</td></tr>
                            ) : data.length === 0 ? (
                                <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-500">{t('tenants.common.noResults')}</td></tr>
                            ) : (
                                data.map(item => (
                                    <tr key={item.company_id} className="hover:bg-slate-50/50">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900">{item.legal_name}</div>
                                            <div className="text-xs text-slate-500">{item.trade_name}</div>
                                        </td>
                                        <td className="px-6 py-4 text-right tabular-nums text-slate-800">
                                            {item.active_contracts}
                                        </td>
                                        <td className="px-6 py-4 text-right tabular-nums font-semibold text-slate-900">
                                            {item.total_amount > 0
                                                ? `${amountFormatter.format(item.total_amount)} ${item.currency_code || ''}`
                                                : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/dashboard/tenants/${item.company_id}/contracts`)}
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                            >
                                                <i className="bi bi-gear" />
                                                {t('tenants.detail.subscription.manageContracts')}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {meta && meta.last_page > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
                        <button 
                            disabled={page <= 1}
                            onClick={() => setPage(p => p - 1)}
                            className="text-sm font-semibold text-slate-600 disabled:opacity-50"
                        >
                            {t('tenants.common.previous')}
                        </button>
                        <span className="text-sm text-slate-500">
                            {t('tenants.common.pageOf', { page: meta.page, total: meta.last_page })}
                        </span>
                        <button 
                            disabled={page >= meta.last_page}
                            onClick={() => setPage(p => p + 1)}
                            className="text-sm font-semibold text-slate-600 disabled:opacity-50"
                        >
                            {t('tenants.common.next')}
                        </button>
                    </div>
                )}
            </div>

            {startModalOpen && (
                <Modal open={true} title={t('tenants.detail.subscription.start')} onClose={() => setStartModalOpen(false)}>
                    <div className="space-y-4">
                        {createStep === 1 && (
                        <>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">{t('tenants.detail.company')}</label>
                            {selectedCompany ? (
                                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                                    <span className="text-sm font-medium text-emerald-900">{selectedCompany.legal_name}</span>
                                    <button type="button" onClick={() => setSelectedCompany(null)} className="text-emerald-600 hover:text-emerald-800">
                                        <i className="bi bi-x-lg" />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        placeholder={t('tenants.detail.subscription.searchLegalNamePlaceholder')}
                                        className="w-full rounded-xl border-slate-200 pl-9"
                                        value={companySearch}
                                        onChange={e => setCompanySearch(e.target.value)}
                                    />
                                    {companyResults.length > 0 && (
                                        <div className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-slate-100 bg-white shadow-lg">
                                            {companyResults.map(c => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    className="w-full px-4 py-2 text-left hover:bg-slate-50 text-sm"
                                                    onClick={() => {
                                                        setSelectedCompany(c);
                                                        setCompanyResults([]);
                                                        setCompanySearch('');
                                                    }}
                                                >
                                                    <div className="font-medium text-slate-900">{c.legal_name}</div>
                                                    <div className="text-xs text-slate-500">{c.trade_name || ''}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">{t('tenants.detail.subscription.freelancerLabel')}</label>
                            {selectedFreelancer ? (
                                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                                    <span className="text-sm font-medium text-emerald-900">
                                        {selectedFreelancer.full_name} <span className="text-xs text-emerald-700">({selectedFreelancer.email})</span>
                                    </span>
                                    <button type="button" onClick={() => setSelectedFreelancer(null)} className="text-emerald-600 hover:text-emerald-800">
                                        <i className="bi bi-x-lg" />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        placeholder={t('tenants.detail.subscription.searchFreelancerPlaceholder')}
                                        className="w-full rounded-xl border-slate-200 pl-9"
                                        value={freelancerSearch}
                                        onChange={e => setFreelancerSearch(e.target.value)}
                                    />
                                    {freelancerResults.length > 0 && (
                                        <div className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-slate-100 bg-white shadow-lg">
                                            {freelancerResults.map(f => (
                                                <button
                                                    key={f.id}
                                                    type="button"
                                                    className="w-full px-4 py-2 text-left hover:bg-slate-50 text-sm"
                                                    onClick={() => {
                                                        setSelectedFreelancer(f);
                                                        setFreelancerResults([]);
                                                        setFreelancerSearch('');
                                                    }}
                                                >
                                                    <div className="font-medium text-slate-900">{f.full_name}</div>
                                                    <div className="text-xs text-slate-500">{f.email}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setStartModalOpen(false)}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                            >
                                {t('tenants.common.cancel')}
                            </button>
                            <button
                                type="button"
                                disabled={!selectedCompany || !selectedFreelancer}
                                onClick={handleGoManage}
                                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                            >
                                {t('tenants.detail.subscription.continue')}
                            </button>
                        </div>
                        </>
                        )}

                        {createStep === 2 && (
                        <form onSubmit={handleCreateContract} className="space-y-4">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-medium">{selectedCompany?.legal_name}</div>
                                        <div className="text-xs text-slate-500">{selectedFreelancer?.full_name} ({selectedFreelancer?.email})</div>
                                    </div>
                                    <button type="button" onClick={() => setCreateStep(1)} className="text-slate-600 hover:text-slate-800">{t('tenants.detail.subscription.change')}</button>
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">{t('tenants.detail.subscription.templateLabel')}</label>
                                <select
                                    className="w-full rounded-xl border-slate-200"
                                    value={formTemplateId}
                                    onChange={e => {
                                        const tplId = e.target.value;
                                        setFormTemplateId(tplId);
                                        const tpl = templates.find(t => String(t.id) === String(tplId));
                                        if (tpl) {
                                            if (!formTitle && tpl.title) {
                                                setFormTitle(tpl.title);
                                            }
                                            if (tpl.type) {
                                                setFormType(tpl.type);
                                            }
                                        }
                                    }}
                                >
                                    <option value="">{t('tenants.detail.subscription.selectTemplate')}</option>
                                    {templates.map(t => (
                                        <option key={t.id} value={t.id}>{t.title}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">{t('tenants.detail.subscription.contractTitleLabel')}</label>
                                    <input className="w-full rounded-xl border-slate-200" required value={formTitle} onChange={e => setFormTitle(e.target.value)} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">{t('tenants.common.type')}</label>
                                    <select className="w-full rounded-xl border-slate-200" value={formType} onChange={e => setFormType(e.target.value)}>
                                        <option value="fixed">{t('tenants.detail.subscription.contractTypes.fixed')}</option>
                                        <option value="hourly">{t('tenants.detail.subscription.contractTypes.hourly')}</option>
                                        <option value="retainer">{t('tenants.detail.subscription.contractTypes.retainer')}</option>
                                        <option value="milestone">{t('tenants.detail.subscription.contractTypes.milestone')}</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">{t('tenants.detail.subscription.rateLabel')}</label>
                                    <input type="number" className="w-full rounded-xl border-slate-200" value={formRate} onChange={e => setFormRate(e.target.value)} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">{t('tenants.common.currency')}</label>
                                    <select className="w-full rounded-xl border-slate-200" value={formCurrencyId} onChange={e => setFormCurrencyId(e.target.value)}>
                                        <option value="">{t('tenants.common.select')}</option>
                                        {currencies.map(c => (
                                            <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">{t('tenants.detail.subscription.startDateLabel')}</label>
                                    <input type="date" required className="w-full rounded-xl border-slate-200" value={formStart} onChange={e => setFormStart(e.target.value)} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">{t('tenants.detail.subscription.endDateLabel')}</label>
                                    <input type="date" className="w-full rounded-xl border-slate-200" value={formEnd} onChange={e => setFormEnd(e.target.value)} />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setCreateStep(1)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">{t('tenants.common.back')}</button>
                                <button type="submit" disabled={submitting} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
                                    {t('tenants.detail.subscription.createContract')}
                                </button>
                            </div>
                        </form>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
}
