import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../components/ToastProvider';
import { useI18n } from '../../../i18n/I18nContext';

export default function TenantContractTemplatesTab({ companyId, api, countries = [] }) {
    const toast = useToast();
    const { t } = useI18n();
    const safeApi = useMemo(() => api, [api]);

    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        title: '',
        type: 'hourly',
        country_id: '',
        language_code: 'es',
        body: '',
        status: 'active'
    });

    useEffect(() => {
        if (!safeApi?.get || !companyId) return;
        load();
    }, [safeApi, companyId, page, statusFilter, search, t]);

    async function load() {
        setLoading(true);
        setErr('');
        try {
            const params = new URLSearchParams();
            params.set('page', String(page));
            if (statusFilter) params.set('status', statusFilter);
            if (search) params.set('q', search.trim());

            const res = await safeApi.get(`/api/tenants/${companyId}/contract-templates?${params.toString()}`);
            let items = [];
            let pages = 1;

            if (Array.isArray(res)) {
                items = res;
            } else if (Array.isArray(res.items)) {
                items = res.items;
                pages = res.pages || res.meta?.total_pages || 1;
            } else if (Array.isArray(res.data)) {
                items = res.data;
                pages = res.meta?.total_pages || res.pages || 1;
            }

            setTemplates(items);
            setTotalPages(Math.max(1, Number(pages) || 1));
        } catch (e) {
            setErr(e?.message || t('tenants.contracts.templates.loadError'));
        } finally {
            setLoading(false);
        }
    }

    const handleReload = () => {
        setPage(1);
        load();
    };

    const handleNew = () => {
        setEditingItem(null);
        setFormData({
            title: '',
            type: 'hourly',
            country_id: '', // User should select
            language_code: 'es',
            body: '',
            status: 'active'
        });
        setShowModal(true);
    };

    const handleEdit = (item) => {
        setEditingItem(item);
        setFormData({
            title: item.title,
            type: item.type,
            country_id: item.country_id,
            language_code: item.language_code,
            body: item.body,
            status: item.status
        });
        setShowModal(true);
    };

    const handleDuplicate = (item) => {
        setEditingItem(null);
        setFormData({
            title: t('tenants.contracts.templates.copyTitle', { title: item.title }),
            type: item.type,
            country_id: item.country_id,
            language_code: item.language_code,
            body: item.body,
            status: 'active'
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm(t('tenants.contracts.templates.deleteConfirm'))) return;
        try {
            await safeApi.delete(`/api/tenants/${companyId}/contract-templates/${id}`);
            toast.success(t('tenants.contracts.templates.deleted'));
            load();
        } catch (e) {
            toast.error(e.message || t('tenants.contracts.templates.deleteError'));
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editingItem) {
                await safeApi.put(`/api/tenants/${companyId}/contract-templates/${editingItem.id}`, formData);
                toast.success(t('tenants.contracts.templates.updated'));
            } else {
                await safeApi.post(`/api/tenants/${companyId}/contract-templates`, formData);
                toast.success(t('tenants.contracts.templates.created'));
            }
            setShowModal(false);
            load();
        } catch (e) {
            toast.error(e.message || t('tenants.contracts.templates.saveError'));
        } finally {
            setSaving(false);
        }
    };

    const renderType = (typeRaw) => {
        const type = String(typeRaw || '').toLowerCase();
        const typeLabels = {
            hourly: t('tenants.contracts.templates.types.hourly'),
            retainer: t('tenants.contracts.templates.types.retainer'),
            fixed: t('tenants.contracts.templates.types.fixed'),
            project: t('tenants.contracts.templates.types.project'),
        };
        return typeLabels[type] || typeRaw;
    };

    const renderStatusBadge = (statusRaw) => {
        const status = String(statusRaw).toLowerCase();
        let cls = 'bg-slate-100 text-slate-700';
        if (status === 'active') cls = 'bg-emerald-50 text-emerald-700';
        else if (status === 'archived') cls = 'bg-gray-200 text-gray-700';

        return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
                {status === 'active' ? t('tenants.common.active') : t('tenants.contracts.templates.archived')}
            </span>
        );
    };

    if (!safeApi?.get) {
        return (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                {t('tenants.contracts.templates.apiNotInitialized')}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">{t('tenants.contracts.templates.title')}</h3>
                    <p className="text-xs text-slate-500">
                        {t('tenants.contracts.templates.subtitle')}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <select
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                        <option value="">{t('tenants.common.all')}</option>
                        <option value="active">{t('tenants.contracts.templates.activePlural')}</option>
                        <option value="archived">{t('tenants.contracts.templates.archivedPlural')}</option>
                    </select>

                    <input
                        type="search"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        placeholder={t('tenants.contracts.templates.searchPlaceholder')}
                        className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                    />

                    <button
                        type="button"
                        onClick={handleReload}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <i className="bi bi-arrow-repeat" />
                    </button>

                    <button
                        type="button"
                        onClick={handleNew}
                        className="inline-flex items-center gap-1 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-600"
                    >
                        <i className="bi bi-plus-lg" />
                        {t('tenants.contracts.templates.newTemplate')}
                    </button>
                </div>
            </div>

            {err && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                    {err}
                </div>
            )}

            {!templates.length && !loading && !err && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    {t('tenants.contracts.templates.empty')}
                </div>
            )}

            {templates.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-4 py-3 text-left">{t('tenants.contracts.templates.tableTitle')}</th>
                                <th className="px-4 py-3 text-left">{t('tenants.common.type')}</th>
                                <th className="px-4 py-3 text-left">{t('tenants.contracts.templates.countryLanguage')}</th>
                                <th className="px-4 py-3 text-left">{t('tenants.common.status')}</th>
                                <th className="px-4 py-3 text-right">{t('tenants.common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {templates.map((template) => (
                                <tr key={template.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-semibold text-slate-900">
                                        {template.title}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 capitalize">
                                        {renderType(template.type)}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                        {countries.find(c => c.id == template.country_id)?.name || template.country_id} / {template.language_code}
                                    </td>
                                    <td className="px-4 py-3">
                                        {renderStatusBadge(template.status)}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleDuplicate(template)}
                                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-emerald-600"
                                                title={t('tenants.contracts.templates.duplicate')}
                                            >
                                                <i className="bi bi-files" />
                                            </button>
                                            <button
                                                onClick={() => handleEdit(template)}
                                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-brand"
                                                title={t('tenants.common.edit')}
                                            >
                                                <i className="bi bi-pencil" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(template.id)}
                                                className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                                title={t('tenants.common.delete')}
                                            >
                                                <i className="bi bi-trash" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                            <button
                                disabled={page <= 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="disabled:opacity-50"
                            >
                                {t('tenants.common.previous')}
                            </button>
                            <span>{t('tenants.common.pageOf', { page, total: totalPages })}</span>
                            <button
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => p + 1)}
                                className="disabled:opacity-50"
                            >
                                {t('tenants.common.next')}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
                        <h3 className="mb-4 text-lg font-bold text-slate-900">
                            {editingItem ? t('tenants.contracts.templates.editTemplate') : t('tenants.contracts.templates.newTemplate')}
                        </h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-700">{t('tenants.contracts.templates.tableTitle')}</label>
                                    <input
                                        required
                                        type="text"
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-700">{t('tenants.common.type')}</label>
                                    <select
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                                    >
                                        <option value="hourly">{t('tenants.contracts.templates.types.hourly')}</option>
                                        <option value="retainer">{t('tenants.contracts.templates.types.retainer')}</option>
                                        <option value="fixed">{t('tenants.contracts.templates.types.fixed')}</option>
                                        <option value="project">{t('tenants.contracts.templates.types.project')}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-700">{t('tenants.contracts.templates.country')}</label>
                                    <select
                                        required
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={formData.country_id}
                                        onChange={e => setFormData({ ...formData, country_id: e.target.value })}
                                    >
                                        <option value="">{t('tenants.contracts.templates.selectCountry')}</option>
                                        {countries.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-700">{t('tenants.contracts.templates.language')}</label>
                                    <input
                                        type="text"
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={formData.language_code}
                                        onChange={e => setFormData({ ...formData, language_code: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-700">{t('tenants.common.status')}</label>
                                    <select
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={formData.status}
                                        onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    >
                                        <option value="active">{t('tenants.common.active')}</option>
                                        <option value="archived">{t('tenants.contracts.templates.archived')}</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-700">{t('tenants.contracts.templates.content')}</label>
                                <textarea
                                    required
                                    rows={10}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-xs"
                                    value={formData.body}
                                    onChange={e => setFormData({ ...formData, body: e.target.value })}
                                />
                                <div className="mt-1 text-[11px] text-slate-500">
                                    {t('tenants.contracts.templates.plainTextHelp')}{' '}
                                    <span className="font-mono">{'{{company_name}}'}</span>,{' '}
                                    <span className="font-mono">{'{{employee_name}}'}</span>,{' '}
                                    <span className="font-mono">{'{{start_date}}'}</span>,{' '}
                                    <span className="font-mono">{'{{salary}}'}</span>,{' '}
                                    <span className="font-mono">{'{{currency}}'}</span>, etc.
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                                >
                                    {t('tenants.common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                                >
                                    {saving ? t('tenants.common.saving') : t('tenants.common.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
