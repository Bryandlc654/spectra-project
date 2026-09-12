import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import RichTextEditor from '../../components/RichTextEditor';

const TEMPLATE_VARIABLES = [
    { token: '{{company_name}}', label: 'Empresa' },
    { token: '{{company_tax_id}}', label: 'RUC / Tax ID' },
    { token: '{{company_address}}', label: 'Dirección empresa' },
    { token: '{{representative_name}}', label: 'Representante' },
    { token: '{{employee_name}}', label: 'Nombre trabajador' },
    { token: '{{employee_id_number}}', label: 'DNI trabajador' },
    { token: '{{employee_nationality}}', label: 'Nacionalidad' },
    { token: '{{employee_address}}', label: 'Dirección trabajador' },
    { token: '{{position}}', label: 'Cargo' },
    { token: '{{functions}}', label: 'Funciones' },
    { token: '{{work_modality}}', label: 'Modalidad' },
    { token: '{{start_date}}', label: 'Fecha inicio' },
    { token: '{{salary}}', label: 'Salario' },
    { token: '{{currency}}', label: 'Moneda' },
    { token: '{{notice_period}}', label: 'Preaviso (días)' }
];

export default function GlobalContractTemplatesPage({ apiUrl, token }) {
    // Basic API wrapper since we might not have the full `api` object passed as prop like in Tenant tabs
    const api = useMemo(() => {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        
        const request = async (method, path, body = null) => {
            const opts = { method, headers };
            if (body) opts.body = JSON.stringify(body);
            
            const res = await fetch(`${apiUrl}${path}`, opts);
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data?.message || data?.error || 'Error en la petición');
            }
            return data;
        };

        return {
            get: (path) => request('GET', path),
            post: (path, body) => request('POST', path, body),
            put: (path, body) => request('PUT', path, body),
            delete: (path) => request('DELETE', path)
        };
    }, [apiUrl, token]);

    const toast = useToast();
    
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [countries, setCountries] = useState([]);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Debounce search to avoid hitting the API on every keystroke
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 400);
        return () => clearTimeout(timer);
    }, [search]);

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

    // Fetch Countries
    useEffect(() => {
        api.get('/api/countries?per_page=200').then(res => {
            let items = [];
            if (Array.isArray(res)) items = res;
            else if (Array.isArray(res.data)) items = res.data;
            setCountries(items);
        }).catch(e => console.error("Failed to load countries", e));
    }, [api]);

    useEffect(() => {
        load();
    }, [api, page, statusFilter, debouncedSearch]);

    async function load() {
        setLoading(true);
        setErr('');
        try {
            const params = new URLSearchParams();
            params.set('page', String(page));
            if (statusFilter) params.set('status', statusFilter);
            if (debouncedSearch) params.set('q', debouncedSearch.trim());

            const res = await api.get(`/api/global-contract-templates?${params.toString()}`);
            let items = [];
            let pages = 1;

            if (Array.isArray(res)) {
                items = res;
            } else if (Array.isArray(res.items)) {
                items = res.items;
                pages = res.pages || res.meta?.total_pages || 1;
            } else if (Array.isArray(res.data)) {
                items = res.data;
                pages = res.meta?.total_pages || res.meta?.last_page || res.pages || 1;
            }

            setTemplates(items);
            setTotalPages(Math.max(1, Number(pages) || 1));
        } catch (e) {
            setErr(e?.message || 'No se pudieron cargar las plantillas globales');
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
            country_id: '',
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
            title: `${item.title} (copia)`,
            type: item.type,
            country_id: item.country_id,
            language_code: item.language_code,
            body: item.body,
            status: 'active'
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Estás seguro de eliminar esta plantilla global?')) return;
        try {
            await api.delete(`/api/global-contract-templates/${id}`);
            toast.success('Plantilla eliminada');
            load();
        } catch (e) {
            toast.error(e.message || 'Error al eliminar');
        }
    };

    const handlePreviewPdf = async (id) => {
        try {
            const res = await fetch(`${apiUrl}/api/global-contract-templates/${id}?action=pdf`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!res.ok) throw new Error('Error generando PDF');
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (e) {
            console.error(e);
            toast.error('Error al visualizar PDF');
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const body = (formData.body || '').replace(/<[^>]*>/g, '').trim();
        if (!body) {
            toast.error('Escribe el contenido de la plantilla');
            return;
        }
        setSaving(true);
        try {
            if (editingItem) {
                await api.put(`/api/global-contract-templates/${editingItem.id}`, formData);
                toast.success('Plantilla actualizada');
            } else {
                await api.post(`/api/global-contract-templates`, formData);
                toast.success('Plantilla creada');
            }
            setShowModal(false);
            load();
        } catch (e) {
            toast.error(e.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const renderStatusBadge = (statusRaw) => {
        const status = String(statusRaw).toLowerCase();
        let cls = 'bg-slate-100 text-slate-700';
        if (status === 'active') cls = 'bg-emerald-50 text-emerald-700';
        else if (status === 'archived') cls = 'bg-gray-200 text-gray-700';

        return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
                {status === 'active' ? 'Activo' : 'Archivado'}
            </span>
        );
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Plantillas Globales de Contratos</h3>
                    <p className="text-xs text-slate-500">
                        Gestiona las plantillas base disponibles para todos los tenants.
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
                        <option value="">Todos</option>
                        <option value="active">Activos</option>
                        <option value="archived">Archivados</option>
                    </select>

                    <input
                        type="search"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Buscar..."
                        className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand focus:ring-brand"
                    />

                    <button
                        type="button"
                        onClick={async () => {
                            if (!window.confirm('Esto limpiará el HTML de todas las plantillas conservando el formato (negritas, listas, párrafos). ¿Continuar?')) return;
                            try {
                                const res = await fetch(`${apiUrl}/api/global-contract-templates/sanitize`, {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${token}` }
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(data?.message || 'Error al sanear');
                                toast.success(`Plantillas saneadas: ${data.actualizadas ?? 'OK'}`);
                                handleReload();
                            } catch (e) {
                                console.error(e);
                                toast.error(e.message || 'Error al sanear');
                            }
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                        title="Eliminar HTML no permitido de todas las plantillas"
                    >
                        <i className="bi bi-broom" />
                        Limpiar HTML
                    </button>

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
                        Nueva Plantilla
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
                    No hay plantillas globales registradas.
                </div>
            )}

            {templates.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-4 py-3 text-left">Título</th>
                                <th className="px-4 py-3 text-left">Tipo</th>
                                <th className="px-4 py-3 text-left">País / Idioma</th>
                                <th className="px-4 py-3 text-left">Estado</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {templates.map((t) => (
                                <tr key={t.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-semibold text-slate-900">
                                        {t.title}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 capitalize">
                                        {t.type}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                        {countries.find(c => c.id == t.country_id)?.name || t.country_id} / {t.language_code}
                                    </td>
                                    <td className="px-4 py-3">
                                        {renderStatusBadge(t.status)}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handlePreviewPdf(t.id)}
                                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                                                title="Ver PDF"
                                            >
                                                <i className="bi bi-file-pdf" />
                                            </button>
                                            <button
                                                onClick={() => handleEdit(t)}
                                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-brand"
                                                title="Editar"
                                            >
                                                <i className="bi bi-pencil" />
                                            </button>
                                            <button
                                                onClick={() => handleDuplicate(t)}
                                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-emerald-600"
                                                title="Duplicar como nueva"
                                            >
                                                <i className="bi bi-files" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(t.id)}
                                                className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                                title="Eliminar"
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
                                Anterior
                            </button>
                            <span>Página {page} de {totalPages}</span>
                            <button
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => p + 1)}
                                className="disabled:opacity-50"
                            >
                                Siguiente
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
                            {editingItem ? 'Editar Plantilla Global' : 'Nueva Plantilla Global'}
                        </h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-700">Título</label>
                                    <input
                                        required
                                        type="text"
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-700">Tipo</label>
                                    <select
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                                    >
                                        <option value="hourly">Hourly</option>
                                        <option value="retainer">Retainer</option>
                                        <option value="fixed">Fixed</option>
                                        <option value="project">Project</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-700">País</label>
                                    <select
                                        required
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={formData.country_id}
                                        onChange={e => setFormData({ ...formData, country_id: e.target.value })}
                                    >
                                        <option value="">Seleccionar país...</option>
                                        {countries.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-700">Idioma</label>
                                    <input
                                        type="text"
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={formData.language_code}
                                        onChange={e => setFormData({ ...formData, language_code: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-700">Estado</label>
                                    <select
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={formData.status}
                                        onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    >
                                        <option value="active">Activo</option>
                                        <option value="archived">Archivado</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <div className="mb-1 flex items-center justify-between">
                                    <label className="text-xs font-semibold text-slate-700">Contenido del contrato</label>
                                    <span className="text-[11px] text-slate-400">Editor de texto enriquecido</span>
                                </div>
                                <RichTextEditor
                                    value={formData.body}
                                    onChange={(html) => setFormData({ ...formData, body: html })}
                                    variables={TEMPLATE_VARIABLES}
                                    placeholder="Escribe el contenido del contrato... Usa la barra de herramientas para formato: negritas, títulos, listas, citas y variables."
                                />
                                <div className="mt-1 text-[11px] text-slate-500">
                                    Puedes insertar variables del contrato con el selector{" "}
                                    <span className="font-semibold text-slate-600">"Insertar variable"</span>, o escribir
                                    tokens como <span className="font-mono">{'{{company_name}}'}</span>,{" "}
                                    <span className="font-mono">{'{{employee_name}}'}</span>,{" "}
                                    <span className="font-mono">{'{{start_date}}'}</span>,{" "}
                                    <span className="font-mono">{'{{salary}}'}</span>. Se reemplazan automáticamente al generar el
                                    contrato o el PDF.
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                                >
                                    {saving ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
