import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { PLATFORM_ROLES } from '../../../lib/platformRoles';
import { useToast } from '../../../components/ToastProvider';
import Modal from '../../../components/Modal';
import { getStoredSession } from '../../../session';
import { useI18n } from '../../../i18n/I18nContext';

export default function TenantInvoicesTab({ companyId, api, currencies, currenciesById, type }) {
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'es-ES';
  const { user } = useAuth();
  const isSupport = user?.platform_role === PLATFORM_ROLES.SUPPORT;
  const toast = useToast();
  const safeApi = useMemo(() => api, [api]);

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [statusFilter, setStatusFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [search, setSearch] = useState('');

  const [contracts, setContracts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    invoice_number: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '',
    currency_id: '',
    contact_id: '',
    comprobante_tipo: '01',
    customer_document_type: '6',
    customer_document: '',
    customer_address: '',
    items: [{ description: '', quantity: 1, unit_price: 0 }]
  });
  const [creating, setCreating] = useState(false);
  const [sendingKeyfacil, setSendingKeyfacil] = useState(false);
  const [currenciesLocal, setCurrenciesLocal] = useState([]);
  const effectiveCurrencies = Array.isArray(currencies) && currencies.length > 0 ? currencies : currenciesLocal;
  const [selectedFile, setSelectedFile] = useState(null);
  
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [type, statusFilter, currencyFilter, search]);

  useEffect(() => {
    if (!safeApi?.get || !companyId) return;
    safeApi.get(`/api/tenants/${companyId}/contracts?per_page=100`)
      .then(res => {
        const items = Array.isArray(res) ? res : (res.data || []);
        setContracts(items);
      })
      .catch(console.error);
  }, [safeApi, companyId]);

  useEffect(() => {
    if (!safeApi?.get) return;
    safeApi.get(`/api/currencies?per_page=100`)
      .then(res => {
        const items = Array.isArray(res) ? res : (res.data || []);
        setCurrenciesLocal(items);
      })
      .catch(() => {});
  }, [safeApi]);

  useEffect(() => {
    if (!safeApi?.get || !companyId) return;
    safeApi.get(`/api/tenants/${companyId}/contacts`)
      .then(res => {
        const items = Array.isArray(res) ? res : (res.data || res.contacts || []);
        setContacts(items);
      })
      .catch(console.error);
  }, [safeApi, companyId]);

  useEffect(() => {
    if (!safeApi?.get || !companyId) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr('');
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        if (type) params.set('type', type);
        if (statusFilter) params.set('status', statusFilter);
        if (currencyFilter) params.set('currency_id', currencyFilter);
        if (search) params.set('q', search.trim());

        const res = await safeApi.get(`/api/tenants/${companyId}/invoices?${params.toString()}`);
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

        if (!cancelled) {
          setInvoices(items);
          setTotalPages(Math.max(1, Number(pages) || 1));
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e?.message || t('tenants.finance.invoices.loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [safeApi, companyId, page, statusFilter, currencyFilter, search, type]);

  const handleReload = () => {
    setPage(1);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.invoice_number || !formData.currency_id || !formData.due_date) {
      toast.error(t('tenants.finance.invoices.requiredFields'));
      return;
    }

    setCreating(true);
    try {
      let invoiceId = editingId;
      if (editingId) {
        await safeApi.put(`/api/tenants/${companyId}/invoices/${editingId}`, formData);
        toast.success(t('tenants.finance.invoices.updated'));
      } else {
        const res = await safeApi.post(`/api/tenants/${companyId}/invoices`, formData);
        invoiceId = res?.id || res?.data?.id || invoiceId;
        toast.success(t('tenants.finance.invoices.created'));
      }
      if (invoiceId && selectedFile) {
        const fd = new FormData();
        fd.append('file', selectedFile);
        await safeApi.post(`/api/tenants/${companyId}/invoices/${invoiceId}/attachment`, fd);
        toast.success(t('tenants.finance.invoices.attachmentUploaded'));
      }
      setCreateModalOpen(false);
      setEditingId(null);
      setFormData({
        invoice_number: '',
        contract_id: '',
        issue_date: new Date().toISOString().split('T')[0],
        due_date: '',
        currency_id: '',
        contact_id: '',
        comprobante_tipo: '01',
        customer_document_type: '6',
        customer_document: '',
        customer_address: '',
        items: [{ description: '', quantity: 1, unit_price: 0 }]
      });
      setSelectedFile(null);
      handleReload(); // Reload list
    } catch (error) {
      toast.error(error.message || t('tenants.finance.invoices.saveError'));
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = (invoice) => {
    setEditingId(invoice.id);
    setFormData({
      invoice_number: invoice.invoice_number,
      contract_id: invoice.contract_id || '',
      issue_date: invoice.issue_date ? invoice.issue_date.split('T')[0] : '',
      due_date: invoice.due_date ? invoice.due_date.split('T')[0] : '',
      currency_id: invoice.currency_id,
      contact_id: invoice.contact_id || '',
      notes: invoice.notes || '',
      comprobante_tipo: invoice.comprobante_tipo || '01',
      customer_document_type: invoice.customer_document_type || '6',
      customer_document: invoice.customer_document || '',
      customer_address: invoice.customer_address || '',
      items: invoice.items && invoice.items.length > 0 
        ? invoice.items.map(i => ({
            description: i.description,
            quantity: Number(i.quantity),
            unit_price: Number(i.unit_price)
          })) 
        : [{ description: '', quantity: 1, unit_price: 0 }]
    });
    setCreateModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('tenants.finance.invoices.confirmDelete'))) return;
    try {
      await safeApi.del(`/api/tenants/${companyId}/invoices/${id}`);
      toast.success(t('tenants.finance.invoices.deleted'));
      handleReload();
      if (selectedInvoice?.id === id) setViewModalOpen(false);
    } catch (error) {
      toast.error(error.message || t('tenants.finance.invoices.deleteError'));
    }
  };

  const handlePay = async (id) => {
    if (!window.confirm(t('tenants.finance.invoices.confirmPay'))) return;
    try {
      await safeApi.post(`/api/tenants/${companyId}/invoices/${id}/pay`);
      toast.success(t('tenants.finance.invoices.paidSuccess'));
      handleReload();
      if (selectedInvoice?.id === id) {
          // Update the view modal if open
          const updated = await safeApi.get(`/api/tenants/${companyId}/invoices/${id}`);
          setSelectedInvoice(updated);
      }
    } catch (error) {
      toast.error(error.message || t('tenants.finance.invoices.payError'));
    }
  };

  const handleSend = async (id) => {
    try {
      await safeApi.post(`/api/tenants/${companyId}/invoices/${id}/send`);
      toast.success(t('tenants.finance.invoices.sentEmail'));
      handleReload();
    } catch (error) {
      toast.error(error.message || t('tenants.finance.invoices.sendError'));
    }
  };

  const handlePdf = async (id) => {
    try {
      const token = getStoredSession()?.token;
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/api/tenants/${companyId}/invoices/${id}/pdf`, {
          headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/pdf'
          }
      });
      
      if (!res.ok) throw new Error(t('tenants.finance.invoices.pdfDownloadError'));
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      toast.error(t('tenants.finance.invoices.pdfError'));
    }
  };

  const handleIssueKeyfacil = async (id) => {
    if (!window.confirm(t('tenants.finance.invoices.confirmIssue'))) return;
    setSendingKeyfacil(true);
    try {
      const res = await safeApi.post(`/api/tenants/${companyId}/invoices/${id}/keyfacil`);
      toast.success(res?.message || t('tenants.finance.invoices.issued'));
      const updated = await safeApi.get(`/api/tenants/${companyId}/invoices/${id}`);
      setSelectedInvoice(updated);
      handleReload();
    } catch (error) {
      toast.error(error.message || t('tenants.finance.invoices.issueError'));
    } finally {
      setSendingKeyfacil(false);
    }
  };

  const handleVoidKeyfacil = async (id) => {
    const motivo = window.prompt(t('tenants.finance.invoices.voidReasonPrompt'));
    if (!motivo || !motivo.trim()) return;
    try {
      await safeApi.post(`/api/tenants/${companyId}/invoices/${id}/keyfacil-void`, { motivo: motivo.trim() });
      toast.success(t('tenants.finance.invoices.voided'));
      const updated = await safeApi.get(`/api/tenants/${companyId}/invoices/${id}`);
      setSelectedInvoice(updated);
      handleReload();
    } catch (error) {
      toast.error(error.message || t('tenants.finance.invoices.voidError'));
    }
  };

  const handleKeyfacilFile = async (invoice, type) => {
    const directUrl = type === 'pdf' ? invoice.keyfacil_pdf_url : invoice.keyfacil_xml_url;
    if (directUrl) {
      window.open(directUrl, '_blank', 'noopener');
      return;
    }

    try {
      const token = getStoredSession()?.token;
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/api/tenants/${companyId}/invoices/${invoice.id}/keyfacil-${type}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(t('tenants.finance.invoices.fileUnavailable'));
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `comprobante-${invoice.keyfacil_serie || invoice.invoice_number || invoice.id}.${type}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.message || t('tenants.finance.invoices.fileDownloadError'));
    }
  };

  const handleView = async (invoiceId) => {
      setLoadingInvoice(true);
      setSelectedInvoice(null);
      setViewModalOpen(true);
      try {
          const res = await safeApi.get(`/api/tenants/${companyId}/invoices/${invoiceId}`);
          setSelectedInvoice(res);
      } catch (e) {
          toast.error(t('tenants.finance.invoices.loadInvoiceError'));
          setViewModalOpen(false);
      } finally {
          setLoadingInvoice(false);
      }
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: 1, unit_price: 0 }]
    }));
  };

  const removeItem = (index) => {
    if (formData.items.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const updateItem = (index, field, value) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(locale);
  };

  const resolveCurrency = (row) => {
    const id = row.currency_id ?? row.currencyId;
    if (id && currenciesById instanceof Map) {
      const c = currenciesById.get(String(id));
      if (c) return c;
    }
    if (Array.isArray(currencies)) {
      const found = currencies.find((c) => String(c.id) === String(id));
      if (found) return found;
    }
    return null;
  };

  const formatAmount = (row) => {
    const currency = resolveCurrency(row);
    const amount = Number(row.total ?? row.amount ?? row.total_amount ?? 0);
    const symbol = currency?.symbol || '$';
    const code = currency?.code || '';
    return {
      text: `${symbol} ${amount.toLocaleString(locale, { minimumFractionDigits: 2 })}`,
      code,
    };
  };

  const renderStatusBadge = (statusRaw) => {
    if (!statusRaw) return <span className="text-xs text-slate-500">{t('tenants.finance.invoices.status.noStatus')}</span>;
    const status = String(statusRaw).toLowerCase();
    const translatedStatus = t(`tenants.finance.invoices.status.${status}`);
    const statusLabel = translatedStatus.startsWith('tenants.finance.invoices.status.') ? status : translatedStatus;
    let cls = 'bg-slate-100 text-slate-700';
    if (status === 'draft') cls = 'bg-slate-100 text-slate-700';
    else if (status === 'sent') cls = 'bg-blue-50 text-blue-700';
    else if (status === 'paid') cls = 'bg-emerald-50 text-emerald-700';
    else if (status === 'overdue') cls = 'bg-red-50 text-red-700';

    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
        {statusLabel}
      </span>
    );
  };

  const handleCopyId = (id) => {
    if (!id || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(String(id)).then(
      () => toast.success(t('tenants.common.idCopied')),
      () => {}
    );
  };

  if (!safeApi?.get) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {t('tenants.finance.invoices.apiNotInitialized')}
      </div>
    );
  }

  if (loading && !invoices.length && !err) {
    return <div className="py-8 text-center text-slate-500">{t('tenants.finance.invoices.loadingInvoices')}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{t('tenants.finance.invoices.title')}</h3>
          <p className="text-xs text-slate-500">
            {t('tenants.finance.invoices.subtitle')}
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
            <option value="">{t('tenants.finance.invoices.allStatuses')}</option>
            <option value="draft">{t('tenants.finance.invoices.status.draft')}</option>
            <option value="sent">{t('tenants.finance.invoices.status.sent')}</option>
            <option value="paid">{t('tenants.finance.invoices.status.paid')}</option>
            <option value="overdue">{t('tenants.finance.invoices.status.overdue')}</option>
          </select>

          <select
            value={currencyFilter}
            onChange={(e) => {
              setCurrencyFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            <option value="">{t('tenants.finance.invoices.allCurrencies')}</option>
            {effectiveCurrencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.symbol ? `(${c.symbol})` : ''}
              </option>
            ))}
          </select>

          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('tenants.finance.invoices.searchPlaceholder')}
            className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand focus:ring-brand"
          />

          <button
            type="button"
            onClick={handleReload}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <i className="bi bi-arrow-repeat" />
            {t('tenants.common.refresh')}
          </button>
          {!isSupport && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setFormData({
                  invoice_number: '',
                  issue_date: new Date().toISOString().split('T')[0],
                  due_date: '',
                  currency_id: '',
                  contact_id: '',
                  comprobante_tipo: '01',
                  customer_document_type: '6',
                  customer_document: '',
                  customer_address: '',
                  items: [{ description: '', quantity: 1, unit_price: 0 }]
                });
                setCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90"
            >
              <i className="bi bi-plus-lg" />
              {t('tenants.finance.invoices.newInvoice')}
            </button>
          )}
        </div>
      </div>

      {/* Create/Edit Invoice Modal */}
      <Modal 
        open={createModalOpen} 
        onClose={() => {
            setCreateModalOpen(false);
            setEditingId(null);
        }} 
        title={editingId ? t('tenants.finance.invoices.editInvoice') : t('tenants.finance.invoices.newInvoice')}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">{t('tenants.finance.invoices.invoiceNumberLabel')}</label>
              <input
                type="text"
                required
                className="mt-1 w-full rounded-lg border-slate-300 text-sm"
                value={formData.invoice_number}
                onChange={e => setFormData({ ...formData, invoice_number: e.target.value })}
                placeholder={t('tenants.finance.invoices.invoiceNumberPlaceholder')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">{t('tenants.finance.invoices.contractOptional')}</label>
              <select
                className="mt-1 w-full rounded-lg border-slate-300 text-sm"
                value={formData.contract_id}
                onChange={e => {
                  const cid = e.target.value;
                  const contract = contracts.find(c => String(c.id) === String(cid));
                  setFormData(prev => ({
                    ...prev,
                    contract_id: cid,
                    // Auto-fill currency if contract selected
                    currency_id: contract ? contract.currency_id : prev.currency_id
                  }));
                }}
              >
                <option value="">{t('tenants.common.none')}</option>
                {contracts.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">{t('tenants.finance.invoices.billingContact')}</label>
              <select
                className="mt-1 w-full rounded-lg border-slate-300 text-sm"
                value={formData.contact_id || ''}
                onChange={e => setFormData({ ...formData, contact_id: e.target.value || '' })}
              >
                <option value="">{t('tenants.common.select')}</option>
                {contacts.map(ct => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name} {ct.email ? `— ${ct.email}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">{t('tenants.common.currency')}</label>
              <select
                required
                className="mt-1 w-full rounded-lg border-slate-300 text-sm"
                value={formData.currency_id}
                onChange={e => setFormData({ ...formData, currency_id: e.target.value })}
              >
                <option value="">{t('tenants.common.select')}</option>
                {effectiveCurrencies.map(c => (
                  <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">{t('tenants.finance.invoices.issueDate')}</label>
              <input
                type="date"
                required
                className="mt-1 w-full rounded-lg border-slate-300 text-sm"
                value={formData.issue_date}
                onChange={e => setFormData({ ...formData, issue_date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">{t('tenants.finance.invoices.dueDate')}</label>
              <input
                type="date"
                required
                className="mt-1 w-full rounded-lg border-slate-300 text-sm"
                value={formData.due_date}
                onChange={e => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">{t('tenants.finance.invoices.keyfacilTitle')}</h4>
              <p className="mt-1 text-xs text-slate-500">
                {t('tenants.finance.invoices.keyfacilHelp')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">{t('tenants.finance.invoices.documentKind')}</label>
                <select
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm"
                  value={formData.comprobante_tipo || '01'}
                  onChange={e => setFormData({ ...formData, comprobante_tipo: e.target.value })}
                >
                  <option value="01">{t('tenants.finance.invoices.electronicInvoice')}</option>
                  <option value="03">{t('tenants.finance.invoices.electronicReceipt')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">{t('tenants.finance.invoices.documentType')}</label>
                <select
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm"
                  value={formData.customer_document_type || '6'}
                  onChange={e => setFormData({ ...formData, customer_document_type: e.target.value })}
                >
                  <option value="6">{t('tenants.finance.invoices.docRuc')}</option>
                  <option value="1">{t('tenants.finance.invoices.docDni')}</option>
                  <option value="4">{t('tenants.finance.invoices.docForeignId')}</option>
                  <option value="7">{t('tenants.finance.invoices.docPassport')}</option>
                  <option value="-">{t('tenants.finance.invoices.docOther')}</option>
                  <option value="0">{t('tenants.finance.invoices.docNonDomiciled')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">{t('tenants.finance.invoices.customerDocument')}</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm"
                  value={formData.customer_document || ''}
                  onChange={e => setFormData({ ...formData, customer_document: e.target.value })}
                  placeholder={t('tenants.finance.invoices.customerDocumentPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">{t('tenants.finance.invoices.customerAddress')}</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border-slate-300 text-sm"
                  value={formData.customer_address || ''}
                  onChange={e => setFormData({ ...formData, customer_address: e.target.value })}
                  placeholder={t('tenants.finance.invoices.customerAddressPlaceholder')}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">{t('tenants.common.notes')}</label>
            <textarea
              rows={2}
              className="mt-1 w-full rounded-lg border-slate-300 text-sm"
              value={formData.notes || ''}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder={t('tenants.finance.invoices.notesPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t('tenants.finance.invoices.attachFile')}</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="mt-1 block w-full text-sm"
              onChange={(e) => setSelectedFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
            />
            {selectedFile && (
              <div className="mt-1 text-xs text-slate-500">
                {t('tenants.finance.invoices.selectedFile', { name: selectedFile.name })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-900">{t('tenants.finance.invoices.items')}</h4>
              <button type="button" onClick={addItem} className="text-xs text-brand font-medium hover:underline">
                {t('tenants.finance.invoices.addItem')}
              </button>
            </div>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {formData.items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-start bg-slate-50 p-2 rounded-lg">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder={t('tenants.finance.invoices.descriptionPlaceholder')}
                      className="w-full rounded border-slate-200 text-xs mb-1"
                      value={item.description}
                      onChange={e => updateItem(idx, 'description', e.target.value)}
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder={t('tenants.finance.invoices.quantityShort')}
                        className="w-20 rounded border-slate-200 text-xs"
                        value={item.quantity}
                        onChange={e => updateItem(idx, 'quantity', e.target.value)}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={t('tenants.finance.invoices.unitPriceShort')}
                        className="flex-1 rounded border-slate-200 text-xs"
                        value={item.unit_price}
                        onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                      />
                    </div>
                  </div>
                  {formData.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <i className="bi bi-trash" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 text-right text-sm font-bold text-slate-900">
               {t('tenants.finance.invoices.totalAmount', { amount: (formData.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)).toFixed(2) })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                  setCreateModalOpen(false);
                  setEditingId(null);
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('tenants.common.cancel')}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
            >
              {creating ? t('tenants.common.saving') : (editingId ? t('tenants.common.update') : t('tenants.finance.invoices.createInvoice'))}
            </button>
          </div>
        </form>
      </Modal>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {err}
        </div>
      )}

      {!invoices.length && !loading && !err && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          {t('tenants.finance.invoices.empty')}
        </div>
      )}

      {invoices.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">{t('tenants.common.date')}</th>
                <th className="px-4 py-3 text-left">{t('tenants.finance.invoices.title')}</th>
                <th className="px-4 py-3 text-left">{t('tenants.finance.invoices.customer')}</th>
                {!isSupport && <th className="px-4 py-3 text-left">{t('tenants.common.amount')}</th>}
                <th className="px-4 py-3 text-left">{t('tenants.common.status')}</th>
                {!isSupport && <th className="px-4 py-3 text-right">{t('tenants.common.actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => {
                const amt = formatAmount(inv);
                const displayNumber = inv.invoice_number || inv.number || inv.id;
                const date = inv.issued_at || inv.date || inv.created_at;
                const customer =
                  inv.customer_name ||
                  inv.client_name ||
                  inv.contact_name ||
                  inv.customer ||
                  '—';

                return (
                  <tr key={inv.id || displayNumber} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {formatDate(date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {displayNumber || t('tenants.finance.invoices.noNumber')}
                        </span>
                        {inv.id && (
                          <button
                            type="button"
                            onClick={() => handleCopyId(inv.id)}
                            className="text-slate-400 hover:text-brand"
                            title={t('tenants.common.copyId')}
                          >
                            <i className="bi bi-clipboard" />
                          </button>
                        )}
                      </div>
                      {inv.reference && (
                        <div className="text-xs text-slate-500 truncate max-w-xs">
                          {t('tenants.finance.invoices.reference', { reference: inv.reference })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div className="text-sm font-medium text-slate-900">{customer}</div>
                      {inv.customer_tax_id && (
                        <div className="text-xs text-slate-500">
                          {t('tenants.finance.invoices.taxId', { value: inv.customer_tax_id })}
                        </div>
                      )}
                    </td>
                    {!isSupport && (
                      <td className="px-4 py-3 text-slate-900 font-mono whitespace-nowrap">
                        {amt.text}
                        {amt.code && (
                          <span className="ml-1 text-xs text-slate-400">{amt.code}</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {renderStatusBadge(inv.status)}
                    </td>
                    {!isSupport && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleView(inv.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title={t('tenants.common.viewDetail')}
                          >
                            <i className="bi bi-eye" />
                          </button>
                          {inv.status !== 'paid' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEdit(inv)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                                title={t('tenants.common.edit')}
                              >
                                <i className="bi bi-pencil" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(inv.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                                title={t('tenants.common.delete')}
                              >
                                <i className="bi bi-trash" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <i className="bi bi-chevron-left" />
                {t('tenants.common.previous')}
              </button>
              <span>
                {t('tenants.common.pageOf', { page, total: totalPages })}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {t('tenants.common.next')}
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </div>
      )}
      {/* View Invoice Modal */}
      <Modal open={viewModalOpen} onClose={() => setViewModalOpen(false)} title={t('tenants.finance.invoices.detailTitle')}>
        {loadingInvoice && !selectedInvoice ? (
             <div className="py-8 text-center text-slate-500">{t('tenants.finance.invoices.detailLoading')}</div>
        ) : selectedInvoice ? (
            <div className="space-y-6">
                <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                    <div>
                        <h4 className="text-lg font-bold text-slate-900">{selectedInvoice.invoice_number}</h4>
                        <div className="mt-1">
                            {renderStatusBadge(selectedInvoice.status)}
                        </div>
                    </div>
                    <div className="text-right text-xs text-slate-500 space-y-1">
                         <div>
                            <span className="font-medium text-slate-700 mr-2">{t('tenants.finance.invoices.issuedLabel')}</span>
                            {formatDate(selectedInvoice.issue_date)}
                        </div>
                         <div>
                            <span className="font-medium text-slate-700 mr-2">{t('tenants.finance.invoices.dueLabel')}</span>
                            {formatDate(selectedInvoice.due_date)}
                        </div>
                    </div>
                </div>

                <div>
                    <h5 className="text-sm font-semibold text-slate-900 mb-3">{t('tenants.finance.invoices.invoiceItems')}</h5>
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-3 py-2 text-left">{t('tenants.common.description')}</th>
                                    <th className="px-3 py-2 text-right">{t('tenants.finance.invoices.quantityShort')}</th>
                                    {!isSupport && <th className="px-3 py-2 text-right">{t('tenants.finance.invoices.price')}</th>}
                                    {!isSupport && <th className="px-3 py-2 text-right">{t('tenants.finance.invoices.total')}</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {selectedInvoice.items?.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="px-3 py-2 text-slate-700">{item.description}</td>
                                        <td className="px-3 py-2 text-right text-slate-600">{Number(item.quantity).toFixed(2)}</td>
                                        {!isSupport && <td className="px-3 py-2 text-right text-slate-600">{Number(item.unit_price).toFixed(2)}</td>}
                                        {!isSupport && <td className="px-3 py-2 text-right font-medium text-slate-900">{Number(item.amount).toFixed(2)}</td>}
                                    </tr>
                                ))}
                            </tbody>
                            {!isSupport && (
                            <tfoot className="bg-slate-50 font-semibold text-slate-900">
                                 <tr>
                                    <td colSpan="3" className="px-3 py-2 text-right">{t('tenants.finance.invoices.total')}</td>
                                    <td className="px-3 py-2 text-right">
                                        {selectedInvoice.currency_symbol} {Number(selectedInvoice.total_amount).toFixed(2)}
                                    </td>
                                </tr>
                            </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {selectedInvoice.notes && (
                    <div className="rounded-lg bg-yellow-50 p-3 text-xs text-yellow-800">
                        <span className="font-bold block mb-1">{t('tenants.finance.invoices.notesLabel')}</span>
                        {selectedInvoice.notes}
                    </div>
                )}
                
                {(selectedInvoice.attachment_path || selectedInvoice.attachment_name) && (
                    <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                        <span className="font-semibold mr-2">{t('tenants.finance.invoices.attachmentLabel')}</span>
                        {selectedInvoice.attachment_path ? (
                          <a href={selectedInvoice.attachment_path} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                            {selectedInvoice.attachment_name || t('tenants.finance.invoices.viewFile')}
                          </a>
                        ) : (
                          <span>{selectedInvoice.attachment_name}</span>
                        )}
                    </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h5 className="text-sm font-semibold text-slate-900">{t('tenants.finance.invoices.sunatTitle')}</h5>
                            <p className="mt-1 text-xs text-slate-500">
                                {selectedInvoice.keyfacil_id
                                    ? t('tenants.finance.invoices.emittedStatus', {
                                        serie: selectedInvoice.keyfacil_serie || '',
                                        number: selectedInvoice.keyfacil_number || '',
                                        status: selectedInvoice.keyfacil_status || 'emitido',
                                      })
                                    : t('tenants.finance.invoices.notIssued')}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {selectedInvoice.keyfacil_id ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => handleKeyfacilFile(selectedInvoice, 'pdf')}
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                        <i className="bi bi-file-earmark-pdf" />
                                        {t('tenants.finance.invoices.sunatPdf')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleKeyfacilFile(selectedInvoice, 'xml')}
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                        <i className="bi bi-file-earmark-code" />
                                        {t('tenants.finance.invoices.xml')}
                                    </button>
                                    {selectedInvoice.status !== 'voided' && (
                                        <button
                                            type="button"
                                            onClick={() => handleVoidKeyfacil(selectedInvoice.id)}
                                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                                        >
                                            <i className="bi bi-x-circle" />
                                            {t('tenants.finance.invoices.voidAction')}
                                        </button>
                                    )}
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => handleIssueKeyfacil(selectedInvoice.id)}
                                    disabled={sendingKeyfacil}
                                    className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand/90 disabled:opacity-50"
                                >
                                    <i className="bi bi-send" />
                                    {sendingKeyfacil ? t('tenants.finance.invoices.issuing') : t('tenants.finance.invoices.issueAction')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4 mt-4">
                    {!isSupport && (
                    <>
                    <button
                        type="button"
                        onClick={() => handlePdf(selectedInvoice.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        <i className="bi bi-file-earmark-pdf" />
                        {t('tenants.finance.invoices.pdf')}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSend(selectedInvoice.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        <i className="bi bi-envelope" />
                        {t('tenants.finance.invoices.send')}
                    </button>
                    </>
                    )}

                    <div className="flex-1" />

                    {!isSupport && selectedInvoice.status !== 'paid' && type !== 'platform' && (
                        <>
                             <button
                                type="button"
                                onClick={() => {
                                    setViewModalOpen(false);
                                    handleEdit(selectedInvoice);
                                }}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                <i className="bi bi-pencil" />
                                {t('tenants.common.edit')}
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePay(selectedInvoice.id)}
                                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                            >
                                <i className="bi bi-credit-card" />
                                {t('tenants.finance.invoices.pay')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        ) : null}
      </Modal>

    </div>
  );
}
