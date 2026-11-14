import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createApi } from '../../lib/api';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../i18n/I18nContext';

const today = () => new Date().toISOString().slice(0, 10);

const makeItem = () => ({
  codigo: '',
  descripcion: '',
  cantidad: 1,
  precio_unitario: 0,
  unidad_medida: 'ZZ',
  tipo_igv: '10',
});

const makeForm = () => ({
  tipo: '01',
  serie: 'F001',
  numero: '',
  fecha_emision: today(),
  fecha_vencimiento: '',
  condicion_pago_tipo: '01',
  cliente_tipo: '6',
  cliente_documento: '',
  cliente_nombre: '',
  cliente_direccion: '',
  cliente_email: '',
  cliente_telefono: '',
  moneda: 'PEN',
  observaciones: '',
  items: [makeItem()],
});

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function formatMoney(amount, currency) {
  const value = Number(amount || 0);
  try {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency || 'PEN',
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || 'PEN'} ${value.toFixed(2)}`;
  }
}

export default function ElectronicInvoicingPage({ apiUrl, token }) {
  const { t } = useI18n();
  const toast = useToast();
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState(makeForm);

  const [kfConfigured, setKfConfigured] = useState(null);
  const [kfForm, setKfForm] = useState({ tipo: '01', serie: 'F001', numero: '' });
  const [kfSearching, setKfSearching] = useState(false);
  const [kfResult, setKfResult] = useState(null);
  const [kfError, setKfError] = useState('');

  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const res = await api.get('/api/finance/keyfacil/invoices');
      setInvoices(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      setListError(e?.message || t('invoices.keyfacilForm.listError'));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/finance/keyfacil/status')
      .then((res) => {
        if (!cancelled) setKfConfigured(!!res?.configured);
      })
      .catch(() => {
        if (!cancelled) setKfConfigured(false);
      });
    return () => { cancelled = true; };
  }, [api]);

  const nextNumber = useMemo(() => {
    const max = invoices
      .filter((inv) => inv.tipo === form.tipo && inv.serie === form.serie)
      .reduce((acc, inv) => Math.max(acc, Number(inv.numero) || 0), 0);
    return max + 1;
  }, [invoices, form.tipo, form.serie]);

  useEffect(() => {
    if (!createOpen) return;
    setForm((prev) => ({ ...prev, numero: String(nextNumber) }));
  }, [createOpen, nextNumber]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let igv = 0;
    for (const item of form.items) {
      const base = round2(Number(item.cantidad || 0) * Number(item.precio_unitario || 0));
      const lineIgv = item.tipo_igv === '10' ? round2(base * 0.18) : 0;
      subtotal += base;
      igv += lineIgv;
    }
    subtotal = round2(subtotal);
    igv = round2(igv);
    return { subtotal, igv, total: round2(subtotal + igv) };
  }, [form.items]);

  const openCreate = () => {
    setFormError('');
    setForm(makeForm());
    setCreateOpen(true);
  };

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleTipoChange = (tipo) => {
    setForm((prev) => ({
      ...prev,
      tipo,
      serie: tipo === '03' ? 'B001' : 'F001',
    }));
  };

  const updateItem = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));
  };

  const addItem = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, makeItem()] }));
  };

  const removeItem = (index) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((_, i) => i !== index) : prev.items,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const cleanDoc = String(form.cliente_documento || '').replace(/\s+/g, '');
    if (!form.cliente_nombre.trim() || (!cleanDoc && !['-', '0'].includes(form.cliente_tipo))) {
      setFormError(t('invoices.keyfacilForm.required'));
      return;
    }
    if (form.tipo === '01' && (form.cliente_tipo !== '6' || cleanDoc.length !== 11)) {
      setFormError(t('invoices.keyfacilForm.rucRequired'));
      return;
    }
    if (!form.items.length || form.items.some((item) => !item.descripcion.trim() || Number(item.cantidad) <= 0)) {
      setFormError(t('invoices.keyfacilForm.itemsRequired'));
      return;
    }
    if (form.condicion_pago_tipo === '02' && !form.fecha_vencimiento) {
      setFormError(t('invoices.keyfacilForm.required'));
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/finance/keyfacil/invoices', {
        ...form,
        numero: Number(form.numero),
        fecha_vencimiento: form.condicion_pago_tipo === '02' ? form.fecha_vencimiento : '',
        items: form.items.map((item) => ({
          ...item,
          cantidad: Number(item.cantidad),
          precio_unitario: Number(item.precio_unitario),
        })),
      });
      toast.success(t('invoices.keyfacilForm.created'));
      setCreateOpen(false);
      await loadInvoices();
    } catch (err) {
      setFormError(err?.message || t('invoices.keyfacilForm.createError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (invoice) => {
    if (!window.confirm(t('invoices.keyfacilForm.deleteConfirm'))) return;
    try {
      await api.del(`/api/finance/keyfacil/invoices/${invoice.id}`);
      toast.success(t('invoices.keyfacilForm.deleteSuccess'));
      await loadInvoices();
    } catch (err) {
      toast.error(err?.message || t('invoices.keyfacilForm.deleteError'));
    }
  };

  const handleVoid = async (invoice) => {
    const reason = window.prompt(t('invoices.keyfacilForm.voidPrompt'));
    if (!reason || !reason.trim()) return;
    try {
      await api.post(`/api/finance/keyfacil/invoices/${invoice.id}/void`, { motivo: reason.trim() });
      toast.success(t('invoices.keyfacilForm.voidSuccess'));
      await loadInvoices();
    } catch (err) {
      toast.error(err?.message || t('invoices.keyfacilForm.voidError'));
    }
  };

  const handleDownload = async (invoice, type) => {
    try {
      const res = await fetch(`${apiUrl}/api/finance/keyfacil/invoices/${invoice.id}/${type}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(t('tenants.finance.invoices.fileDownloadError'));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice.serie || 'comprobante'}-${invoice.numero || ''}.${type}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err?.message || t('invoices.keyfacilForm.deleteError'));
    }
  };

  const handleKfTypeChange = (tipo) => {
    setKfForm((prev) => ({
      ...prev,
      tipo,
      serie: prev.serie === 'F001' || prev.serie === 'B001'
        ? (tipo === '03' ? 'B001' : 'F001')
        : prev.serie,
    }));
  };

  const handleKfSearch = async (e) => {
    e.preventDefault();
    setKfSearching(true);
    setKfError('');
    setKfResult(null);
    try {
      const res = await api.post('/api/finance/keyfacil/search', {
        tipo: kfForm.tipo,
        serie: kfForm.serie.trim().toUpperCase(),
        numero: Number(kfForm.numero),
      });
      setKfResult(res);
      if (!res?.ok) setKfError(res?.error || t('invoices.electronicKeyfacilError'));
    } catch (err) {
      setKfError(err?.message || t('invoices.electronicKeyfacilError'));
    } finally {
      setKfSearching(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    setLogsError('');
    try {
      const res = await api.get('/api/finance/keyfacil/logs?limit=100');
      setLogs(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setLogsError(err?.message || t('invoices.electronicKeyfacilLogsError'));
    } finally {
      setLogsLoading(false);
    }
  };

  const openLogs = () => {
    setLogsOpen(true);
    loadLogs();
  };

  const statusMeta = (status) => {
    if (status === 'issued') return { label: t('invoices.keyfacilForm.statusIssued'), cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (status === 'voided') return { label: t('invoices.keyfacilForm.statusVoided'), cls: 'bg-red-50 text-red-700 border-red-200' };
    if (status === 'error') return { label: t('invoices.keyfacilForm.statusError'), cls: 'bg-amber-50 text-amber-800 border-amber-200' };
    return { label: t('invoices.keyfacilForm.statusDraft'), cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {t('invoices.electronicEyebrow')}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t('invoices.electronicTitle')}</h1>
          <p className="text-sm text-slate-600">{t('invoices.electronicSubtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openLogs}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <i className="bi bi-journal-text" />
            {t('invoices.electronicKeyfacilLogs')}
          </button>
          <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
            kfConfigured
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}>
            <i className={`bi ${kfConfigured ? 'bi-shield-check' : 'bi-exclamation-triangle'}`} />
            {kfConfigured ? t('invoices.electronicKeyfacilBadge') : t('invoices.electronicKeyfacilNotConfigured')}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-bold text-slate-900">{t('invoices.electronicKeyfacilSearchTitle')}</h2>
          <p className="text-xs text-slate-500">{t('invoices.keyfacilForm.searchHint')}</p>
        </div>
        <form onSubmit={handleKfSearch} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
          <div>
            <label className="text-xs font-semibold text-slate-600">{t('invoices.electronicKeyfacilType')}</label>
            <select
              value={kfForm.tipo}
              onChange={(e) => handleKfTypeChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
            >
              <option value="01">{t('invoices.electronicKeyfacilInvoice')}</option>
              <option value="03">{t('invoices.electronicKeyfacilReceipt')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">{t('invoices.electronicKeyfacilSerie')}</label>
            <input
              value={kfForm.serie}
              onChange={(e) => setKfForm((prev) => ({ ...prev, serie: e.target.value.toUpperCase() }))}
              placeholder="F001"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm uppercase outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">{t('invoices.electronicKeyfacilNumber')}</label>
            <input
              type="number"
              min="1"
              value={kfForm.numero}
              onChange={(e) => setKfForm((prev) => ({ ...prev, numero: e.target.value }))}
              placeholder="1"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
            />
          </div>
          <button
            type="submit"
            disabled={kfSearching || !kfForm.numero || !kfForm.serie}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
          >
            {kfSearching ? t('invoices.electronicKeyfacilSearching') : t('invoices.electronicKeyfacilSearchButton')}
          </button>
        </form>

        {kfError && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {kfError}
          </div>
        )}

        {kfResult?.ok && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t('invoices.electronicKeyfacilResult')}
              </span>
              <span className="text-xs font-semibold text-emerald-700">HTTP {kfResult.status}</span>
            </div>
            <pre className="max-h-80 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-700">
              {JSON.stringify(kfResult.data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">{t('invoices.keyfacilForm.listTitle')}</h2>
            <p className="text-xs text-slate-500">{t('invoices.keyfacilForm.listSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand/90"
          >
            <i className="bi bi-plus-lg" />
            {t('invoices.keyfacilForm.newInvoice')}
          </button>
        </div>

        {listError && (
          <div className="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {listError}
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">{t('tenants.common.loading')}</div>
        ) : invoices.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand">
              <i className="bi bi-receipt-cutoff text-2xl" />
            </div>
            <p className="text-sm text-slate-500">{t('invoices.keyfacilForm.listEmpty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">{t('invoices.keyfacilForm.colDate')}</th>
                  <th className="px-4 py-3 text-left">{t('invoices.keyfacilForm.colDocument')}</th>
                  <th className="px-4 py-3 text-left">{t('invoices.keyfacilForm.colCustomer')}</th>
                  <th className="px-4 py-3 text-right">{t('invoices.keyfacilForm.colAmount')}</th>
                  <th className="px-4 py-3 text-left">{t('invoices.keyfacilForm.colStatus')}</th>
                  <th className="px-4 py-3 text-right">{t('invoices.keyfacilForm.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => {
                  const meta = statusMeta(invoice.status);
                  return (
                    <tr key={invoice.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-slate-600">{invoice.fecha_emision}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">
                          {invoice.tipo === '03' ? 'Boleta' : 'Factura'} {invoice.serie}-{invoice.numero}
                        </div>
                        {invoice.keyfacil_id && (
                          <div className="text-[11px] text-slate-400">ID: {invoice.keyfacil_id}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{invoice.cliente_nombre}</div>
                        <div className="text-xs text-slate-500">{invoice.cliente_documento}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div className="font-semibold text-slate-900">{formatMoney(invoice.total, invoice.moneda)}</div>
                        <div className="text-[11px] text-slate-400">
                          Subtotal {formatMoney(invoice.subtotal, invoice.moneda)} · IGV {formatMoney(invoice.igv, invoice.moneda)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {invoice.has_pdf && (
                            <button type="button" onClick={() => handleDownload(invoice, 'pdf')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                              {t('invoices.keyfacilForm.downloadPdf')}
                            </button>
                          )}
                          {invoice.has_xml && (
                            <button type="button" onClick={() => handleDownload(invoice, 'xml')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                              {t('invoices.keyfacilForm.downloadXml')}
                            </button>
                          )}
                          {invoice.keyfacil_id && invoice.status !== 'voided' && (
                            <button type="button" onClick={() => handleVoid(invoice)} className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">
                              {t('invoices.keyfacilForm.voidAction')}
                            </button>
                          )}
                          <button type="button" onClick={() => handleDelete(invoice)} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">
                            {t('invoices.keyfacilForm.deleteAction')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={createOpen} title={t('invoices.keyfacilForm.title')} onClose={() => !saving && setCreateOpen(false)} size="5xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <p className="text-sm text-slate-500">{t('invoices.keyfacilForm.subtitle')}</p>
          </div>

          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.type')}</label>
              <select value={form.tipo} onChange={(e) => handleTipoChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15">
                <option value="01">{t('invoices.keyfacilForm.invoice')}</option>
                <option value="03">{t('invoices.keyfacilForm.receipt')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.series')}</label>
              <input value={form.serie} onChange={(e) => updateForm('serie', e.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm uppercase outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.number')}</label>
              <input type="number" min="1" value={form.numero} onChange={(e) => updateForm('numero', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15" />
              <p className="mt-1 text-[11px] text-slate-400">{t('invoices.keyfacilForm.nextNumberHint')}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.currency')}</label>
              <select value={form.moneda} onChange={(e) => updateForm('moneda', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15">
                <option value="PEN">{t('invoices.keyfacilForm.currencyPEN')}</option>
                <option value="USD">{t('invoices.keyfacilForm.currencyUSD')}</option>
                <option value="EUR">{t('invoices.keyfacilForm.currencyEUR')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.issueDate')}</label>
              <input type="date" value={form.fecha_emision} onChange={(e) => updateForm('fecha_emision', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.paymentCondition')}</label>
              <select value={form.condicion_pago_tipo} onChange={(e) => updateForm('condicion_pago_tipo', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15">
                <option value="01">{t('invoices.keyfacilForm.cash')}</option>
                <option value="02">{t('invoices.keyfacilForm.credit')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.dueDate')}</label>
              <input type="date" value={form.fecha_vencimiento} onChange={(e) => updateForm('fecha_vencimiento', e.target.value)} disabled={form.condicion_pago_tipo !== '02'} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15 disabled:opacity-50" />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-900">{t('invoices.keyfacilForm.customer')}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.docType')}</label>
                <select value={form.cliente_tipo} onChange={(e) => updateForm('cliente_tipo', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15">
                  <option value="6">RUC</option>
                  <option value="1">DNI</option>
                  <option value="4">Carné de extranjería</option>
                  <option value="7">Pasaporte</option>
                  <option value="-">Varios</option>
                  <option value="0">No domiciliado</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.docNumber')}</label>
                <input value={form.cliente_documento} onChange={(e) => updateForm('cliente_documento', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.name')}</label>
                <input value={form.cliente_nombre} onChange={(e) => updateForm('cliente_nombre', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.address')}</label>
                <input value={form.cliente_direccion} onChange={(e) => updateForm('cliente_direccion', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.email')}</label>
                <input type="email" value={form.cliente_email} onChange={(e) => updateForm('cliente_email', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.phone')}</label>
                <input value={form.cliente_telefono} onChange={(e) => updateForm('cliente_telefono', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15" />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">{t('invoices.keyfacilForm.product')}</h3>
              <button type="button" onClick={addItem} className="text-xs font-semibold text-brand hover:underline">
                {t('invoices.keyfacilForm.addItem')}
              </button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, index) => {
                const base = round2(Number(item.cantidad || 0) * Number(item.precio_unitario || 0));
                const lineIgv = item.tipo_igv === '10' ? round2(base * 0.18) : 0;
                return (
                  <div key={index} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-12">
                    <div className="sm:col-span-4">
                      <label className="text-[11px] font-semibold text-slate-500">{t('invoices.keyfacilForm.description')}</label>
                      <input value={item.descripcion} onChange={(e) => updateItem(index, 'descripcion', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="text-[11px] font-semibold text-slate-500">{t('invoices.keyfacilForm.quantity')}</label>
                      <input type="number" min="0.01" step="0.01" value={item.cantidad} onChange={(e) => updateItem(index, 'cantidad', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold text-slate-500">{t('invoices.keyfacilForm.unitPrice')}</label>
                      <input type="number" min="0" step="0.01" value={item.precio_unitario} onChange={(e) => updateItem(index, 'precio_unitario', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="text-[11px] font-semibold text-slate-500">{t('invoices.keyfacilForm.unit')}</label>
                      <select value={item.unidad_medida} onChange={(e) => updateItem(index, 'unidad_medida', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15">
                        <option value="ZZ">ZZ</option>
                        <option value="NIU">NIU</option>
                        <option value="KGM">KGM</option>
                        <option value="LTR">LTR</option>
                        <option value="BX">BX</option>
                        <option value="MTR">MTR</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold text-slate-500">{t('invoices.keyfacilForm.igvType')}</label>
                      <select value={item.tipo_igv} onChange={(e) => updateItem(index, 'tipo_igv', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15">
                        <option value="10">{t('invoices.keyfacilForm.igvGravado')}</option>
                        <option value="20">{t('invoices.keyfacilForm.igvExonerado')}</option>
                        <option value="30">{t('invoices.keyfacilForm.igvInafecto')}</option>
                        <option value="40">{t('invoices.keyfacilForm.igvExportacion')}</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2 flex items-end justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-semibold text-slate-500">{t('invoices.keyfacilForm.lineTotal')}</div>
                        <div className="text-sm font-bold text-slate-900">{formatMoney(round2(base + lineIgv), form.moneda)}</div>
                      </div>
                      <button type="button" onClick={() => removeItem(index)} className="text-xs font-semibold text-red-600 hover:underline" disabled={form.items.length === 1}>
                        {t('invoices.keyfacilForm.remove')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">{t('invoices.keyfacilForm.observations')}</label>
              <textarea value={form.observaciones} onChange={(e) => updateForm('observaciones', e.target.value)} rows={3} placeholder={t('invoices.keyfacilForm.observationsPlaceholder')} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>{t('invoices.keyfacilForm.subtotal')}</span>
                  <span className="font-semibold">{formatMoney(totals.subtotal, form.moneda)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{t('invoices.keyfacilForm.igv')}</span>
                  <span className="font-semibold">{formatMoney(totals.igv, form.moneda)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold text-slate-900">
                  <span>{t('invoices.keyfacilForm.total')}</span>
                  <span>{formatMoney(totals.total, form.moneda)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-xs text-amber-700">{t('invoices.keyfacilForm.emitWarning')}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreateOpen(false)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {t('invoices.keyfacilForm.cancel')}
              </button>
              <button type="submit" disabled={saving} className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60">
                {saving ? t('invoices.keyfacilForm.emitting') : t('invoices.keyfacilForm.emit')}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal open={logsOpen} title={t('invoices.electronicKeyfacilLogsTitle')} onClose={() => setLogsOpen(false)} size="5xl">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">{t('invoices.electronicKeyfacilLogsSubtitle')}</p>
            <button
              type="button"
              onClick={loadLogs}
              disabled={logsLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <i className={`bi bi-arrow-repeat ${logsLoading ? 'animate-spin' : ''}`} />
              {t('invoices.electronicKeyfacilLogsRefresh')}
            </button>
          </div>

          {logsError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {logsError}
            </div>
          )}

          {logsLoading ? (
            <div className="p-8 text-center text-sm text-slate-500">{t('tenants.common.loading')}</div>
          ) : logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {t('invoices.electronicKeyfacilLogsEmpty')}
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log, index) => {
                const action = log?.context?.action || log?.context?.type || '—';
                const ok = !!log?.ok;
                return (
                  <div key={log?.request_id || index} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                          {log?.http_status || 0}
                        </span>
                        <span className="font-semibold text-slate-700">{action}</span>
                        <span className="text-slate-500">{log?.method} {log?.path}</span>
                        {log?.duration_ms != null && <span className="text-slate-400">{log.duration_ms} ms</span>}
                        {log?.error && <span className="text-red-600">{log.error}</span>}
                      </div>
                      <span className="text-[11px] text-slate-400">{log?.timestamp}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                      <details className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-600">{t('invoices.electronicKeyfacilLogsRequest')}</summary>
                        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-700">
                          {JSON.stringify(log?.request ?? null, null, 2)}
                        </pre>
                      </details>
                      <details className="rounded-lg border border-slate-100 bg-slate-50 p-2" open={!ok}>
                        <summary className="cursor-pointer text-xs font-semibold text-slate-600">{t('invoices.electronicKeyfacilLogsResponse')}</summary>
                        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-700">
                          {JSON.stringify(log?.response ?? null, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
