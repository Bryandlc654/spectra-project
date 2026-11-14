import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmModal from '../../components/ConfirmModal';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../context/AuthContext';
import { createApi, downloadFile } from '../../lib/api';

// Spectra revisa y aprueba; las empresas envían sus proveedores.
const REVIEWER_ROLES = ['super_admin', 'admin', 'finance'];

const STATUS = {
  pending: { label: 'Pendiente de revisión', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  approved: { label: 'Aprobado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rechazado', cls: 'bg-red-50 text-red-700 border-red-200' },
};

const EMPTY_FORM = { name: '', tax_id: '', category: '', contact_name: '', email: '', phone: '', country_iso2: '', website: '', address: '' };

const FIELDS = [
  { key: 'name', label: 'Razón social', required: true, col: 2 },
  { key: 'tax_id', label: 'RUC / Tax ID' },
  { key: 'category', label: 'Categoría', placeholder: 'Ej. Tecnología, Limpieza…' },
  { key: 'contact_name', label: 'Persona de contacto' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'website', label: 'Sitio web', placeholder: 'www.empresa.com' },
  { key: 'address', label: 'Dirección', col: 2 },
];

function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status || '—', cls: 'bg-slate-50 text-slate-600 border-slate-200' };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

export default function VendorsPage({ apiUrl }) {
  const { token, user } = useAuth();
  const toast = useToast();
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const role = user?.platform_role || user?.role || '';
  const isReviewer = REVIEWER_ROLES.includes(role);

  const tabs = isReviewer
    ? [{ id: 'review', label: 'Por revisar' }, { id: 'catalog', label: 'Catálogo aprobado' }, { id: 'all', label: 'Todos' }]
    : [{ id: 'catalog', label: 'Catálogo aprobado' }, { id: 'mine', label: 'Mis proveedores' }];

  const [tab, setTab] = useState(tabs[0].id);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [countries, setCountries] = useState([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [reviewTarget, setReviewTarget] = useState(null); // { vendor, decision }
  const [reviewReason, setReviewReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);
  const loadSeq = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => { setPage(1); }, [tab, debouncedQ]);

  useEffect(() => {
    api.get('/api/countries?per_page=200')
      .then((res) => setCountries(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {});
  }, [api]);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams({ scope: tab, page: String(page), limit: '25' });
      if (debouncedQ) params.set('q', debouncedQ);
      const res = await api.get(`/api/procurement/vendors?${params.toString()}`);
      if (seq !== loadSeq.current) return;
      setRows(Array.isArray(res?.data) ? res.data : []);
      setTotal(res?.pagination?.total ?? 0);
      setTotalPages(res?.pagination?.total_pages ?? 1);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setErr(e.message || 'Error cargando proveedores');
      setRows([]);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [api, tab, page, debouncedQ]);

  useEffect(() => { load(); }, [load, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const countryName = (iso) => countries.find((c) => c.iso2 === iso)?.name || iso || '—';

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(v) {
    setEditing(v);
    setForm({ ...EMPTY_FORM, ...Object.fromEntries(Object.keys(EMPTY_FORM).map((k) => [k, v[k] ?? ''])) });
    setFormOpen(true);
  }

  async function saveForm(e) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('La razón social es obligatoria'); return; }
    setSaving(true);
    try {
      const res = editing
        ? await api.put(`/api/procurement/vendors/${editing.id}`, form)
        : await api.post('/api/procurement/vendors', form);
      toast.success(res?.message || 'Proveedor guardado');
      setFormOpen(false);
      if (!isReviewer && !editing) setTab('mine');
      reload();
    } catch (e2) {
      toast.error(e2.message || 'No se pudo guardar el proveedor');
    } finally {
      setSaving(false);
    }
  }

  async function confirmReview() {
    if (!reviewTarget) return;
    if (reviewTarget.decision === 'reject' && !reviewReason.trim()) { toast.error('Indica el motivo del rechazo'); return; }
    setReviewing(true);
    try {
      const res = await api.post(`/api/procurement/vendors/${reviewTarget.vendor.id}/review`, {
        decision: reviewTarget.decision,
        reason: reviewReason.trim(),
      });
      toast.success(res?.message || 'Revisión guardada');
      setReviewTarget(null);
      reload();
    } catch (e) {
      toast.error(e.message || 'No se pudo guardar la revisión');
    } finally {
      setReviewing(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/procurement/vendors/${deleteTarget.id}`);
      toast.success('Proveedor eliminado');
      setDeleteTarget(null);
      reload();
    } catch (e) {
      toast.error(e.message || 'No se pudo eliminar');
    } finally {
      setDeleting(false);
    }
  }

  async function downloadTemplate() {
    try {
      await downloadFile(apiUrl, '/api/procurement/vendors/template', 'plantilla_proveedores_spectra.xlsx');
    } catch (e) {
      toast.error(e.message || 'No se pudo descargar la plantilla');
    }
  }

  async function runImport() {
    if (!importFile) { toast.error('Selecciona el archivo Excel'); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const res = await api.post('/api/procurement/vendors/import', fd);
      setImportResult(res);
      toast.success(res?.message || 'Importación completada');
      if (!isReviewer) setTab('mine');
      reload();
    } catch (e) {
      const data = e.data || {};
      if (Array.isArray(data.errors)) setImportResult({ created: data.created || 0, errors: data.errors, message: data.message });
      toast.error(data.message || e.message || 'No se pudo importar el archivo');
    } finally {
      setImporting(false);
    }
  }

  // Las empresas pueden editar sus propios proveedores (si estaba aprobado, vuelve a revisión)
  const canEdit = (v) => isReviewer || tab === 'mine';
  const canDelete = (v) => isReviewer || (tab === 'mine' && v.approval_status !== 'approved');
  const showOwnerCols = isReviewer && tab !== 'catalog';
  const showStatus = tab !== 'catalog';

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proveedores</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isReviewer
              ? 'Revisa los proveedores enviados por las empresas. Los aprobados aparecen en el catálogo de todas las empresas.'
              : 'Registra a tus proveedores: Spectra los revisa y, una vez aprobados, quedan disponibles en el catálogo para todas las empresas.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <i className="bi bi-file-earmark-spreadsheet" aria-hidden="true" /> Descargar plantilla Excel
          </button>
          <button type="button" onClick={() => { setImportFile(null); setImportResult(null); setImportOpen(true); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <i className="bi bi-upload" aria-hidden="true" /> Importar Excel
          </button>
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
            <i className="bi bi-plus-lg" aria-hidden="true" /> Nuevo proveedor
          </button>
        </div>
      </div>

      {/* Pestañas + búsqueda */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div role="tablist" aria-label="Vistas de proveedores" className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar proveedores"
            placeholder="Buscar por nombre, RUC, categoría o email…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white md:w-80"
          />
        </div>

        {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Proveedor</th>
                <th className="px-3 py-3 font-semibold">Categoría</th>
                <th className="px-3 py-3 font-semibold">Contacto</th>
                <th className="px-3 py-3 font-semibold">País</th>
                {showOwnerCols && <th className="px-3 py-3 font-semibold">Enviado por</th>}
                {showStatus && <th className="px-3 py-3 font-semibold">Estado</th>}
                <th className="px-3 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500" role="status">Cargando…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                    {tab === 'review' ? 'No hay proveedores pendientes de revisión.'
                      : tab === 'mine' ? 'Aún no has registrado proveedores. Usa "Nuevo proveedor" o importa la plantilla Excel.'
                      : 'No hay proveedores en esta vista.'}
                  </td>
                </tr>
              )}
              {!loading && rows.map((v) => (
                <tr key={v.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-900">{v.name}</div>
                    <div className="text-xs text-slate-500">{v.tax_id ? `RUC ${v.tax_id}` : 'Sin RUC'}</div>
                    {v.website && <a href={v.website} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline">{v.website.replace(/^https?:\/\//, '')}</a>}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{v.category || '—'}</td>
                  <td className="px-3 py-3 text-slate-700">
                    <div>{v.contact_name || '—'}</div>
                    <div className="text-xs text-slate-500">{[v.email, v.phone].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{countryName(v.country_iso2)}</td>
                  {showOwnerCols && (
                    <td className="px-3 py-3 text-slate-700">
                      <div>{v.company_name || '—'}</div>
                      <div className="text-xs text-slate-500">{v.submitted_by_name || ''}{v.created_at ? ` · ${new Date(v.created_at).toLocaleDateString()}` : ''}</div>
                    </td>
                  )}
                  {showStatus && (
                    <td className="px-3 py-3">
                      <StatusBadge status={v.approval_status} />
                      {v.approval_status === 'rejected' && v.rejection_reason && (
                        <div className="mt-1 max-w-[220px] text-xs text-red-700">Motivo: {v.rejection_reason}</div>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {isReviewer && v.approval_status === 'pending' && (
                        <>
                          <button type="button" onClick={() => { setReviewReason(''); setReviewTarget({ vendor: v, decision: 'approve' }); }} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Aprobar</button>
                          <button type="button" onClick={() => { setReviewReason(''); setReviewTarget({ vendor: v, decision: 'reject' }); }} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Rechazar</button>
                        </>
                      )}
                      {(isReviewer || tab === 'mine') && canEdit(v) && (
                        <button type="button" onClick={() => openEdit(v)} aria-label={`Editar ${v.name}`} title="Editar" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"><i className="bi bi-pencil" aria-hidden="true" /></button>
                      )}
                      {(isReviewer || tab === 'mine') && canDelete(v) && (
                        <button type="button" onClick={() => setDeleteTarget(v)} aria-label={`Eliminar ${v.name}`} title="Eliminar" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"><i className="bi bi-trash" aria-hidden="true" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
          <span>{loading ? 'Cargando…' : `${total} proveedor(es)`}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Anterior</button>
            <span>Página {page} de {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      </div>

      {/* Alta / edición */}
      <Modal open={formOpen} onClose={() => !saving && setFormOpen(false)} title={editing ? 'Editar proveedor' : 'Nuevo proveedor'} size="lg">
        <form onSubmit={saveForm} className="space-y-4">
          {!isReviewer && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {editing && editing.approval_status === 'approved'
                ? 'Este proveedor ya está aprobado: al guardar cambios volverá a revisión de Spectra.'
                : 'El proveedor quedará pendiente hasta que Spectra lo revise y apruebe.'}
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.col === 2 ? 'md:col-span-2' : ''}>
                <label htmlFor={`vendor-${f.key}`} className="mb-1 block text-sm font-semibold text-slate-700">
                  {f.label} {f.required && <span className="text-red-500">*</span>}
                </label>
                <input
                  id={`vendor-${f.key}`}
                  type={f.type || 'text'}
                  value={form[f.key]}
                  required={!!f.required}
                  placeholder={f.placeholder || ''}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
                />
              </div>
            ))}
            <div>
              <label htmlFor="vendor-country" className="mb-1 block text-sm font-semibold text-slate-700">País</label>
              <select
                id="vendor-country"
                value={form.country_iso2}
                onChange={(e) => setForm((p) => ({ ...p, country_iso2: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
              >
                <option value="">Seleccionar…</option>
                {countries.map((c) => <option key={c.iso2} value={c.iso2}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : (isReviewer ? 'Crear y aprobar' : 'Enviar a revisión')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Importación Excel */}
      <Modal open={importOpen} onClose={() => !importing && setImportOpen(false)} title="Importar proveedores desde Excel" size="lg">
        <div className="space-y-4 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-slate-600">
            <li>Descarga la <button type="button" onClick={downloadTemplate} className="font-semibold text-brand hover:underline">plantilla Excel</button> y complétala (una fila por proveedor).</li>
            <li>La columna “Razón social” es obligatoria. El país va con su código ISO2 (por ejemplo PE).</li>
            <li>Sube el archivo (.xlsx o .csv, máximo 500 filas y 2 MB).</li>
          </ol>
          <div>
            <label htmlFor="vendor-import-file" className="mb-1 block font-semibold text-slate-700">Archivo</label>
            <input
              id="vendor-import-file"
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand/10 file:px-4 file:py-2 file:font-semibold file:text-brand hover:file:bg-brand/20"
            />
          </div>

          {importResult && (
            <div className="rounded-xl border border-slate-200 p-3" role="status" aria-live="polite">
              <div className="font-semibold text-slate-800">
                {importResult.created || 0} proveedor(es) importado(s){importResult.errors?.length ? ` · ${importResult.errors.length} fila(s) con observaciones` : ''}
              </div>
              {importResult.errors?.length > 0 && (
                <div className="mt-2 max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-slate-500"><tr><th className="py-1 pr-2">Fila</th><th className="py-1 pr-2">Proveedor</th><th className="py-1">Observación</th></tr></thead>
                    <tbody>
                      {importResult.errors.map((er, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-1 pr-2 text-slate-500">{er.row}</td>
                          <td className="py-1 pr-2 text-slate-700">{er.name || '—'}</td>
                          <td className="py-1 text-red-700">{er.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setImportOpen(false)} disabled={importing} className="rounded-xl border border-slate-200 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Cerrar</button>
            <button type="button" onClick={runImport} disabled={importing || !importFile} className="rounded-xl bg-brand px-5 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {importing ? 'Importando…' : 'Importar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Revisión */}
      <ConfirmModal
        open={!!reviewTarget}
        title={reviewTarget?.decision === 'approve' ? 'Aprobar proveedor' : 'Rechazar proveedor'}
        message={reviewTarget?.decision === 'approve'
          ? `${reviewTarget?.vendor?.name} pasará al catálogo y será visible para todas las empresas.`
          : `Se notificará a ${reviewTarget?.vendor?.company_name || 'la empresa'} el motivo del rechazo.`}
        confirmText={reviewTarget?.decision === 'approve' ? 'Aprobar' : 'Rechazar'}
        danger={reviewTarget?.decision !== 'approve'}
        loading={reviewing}
        onConfirm={confirmReview}
        onClose={() => !reviewing && setReviewTarget(null)}
      >
        {reviewTarget?.decision === 'reject' && (
          <div className="mt-3">
            <label htmlFor="vendor-reject-reason" className="mb-1 block text-sm font-medium text-slate-700">Motivo del rechazo <span className="text-red-500">*</span></label>
            <textarea id="vendor-reject-reason" rows={3} value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} className="w-full rounded-xl border border-slate-300 p-2.5 text-sm" placeholder="Ej. RUC no coincide con la razón social" />
          </div>
        )}
      </ConfirmModal>

      {/* Eliminación */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Eliminar proveedor"
        message={`¿Eliminar a ${deleteTarget?.name || 'este proveedor'}? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
