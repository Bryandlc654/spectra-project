import React, { useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../i18n/I18nContext';

export default function TenantImportModal({ open, onClose, api, countries, currencies, timezones, onSuccess }) {
  const toast = useToast();
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [defaults, setDefaults] = useState({
    country_id: '',
    default_currency_id: '',
    status: 'active',
    owner_mode: 'create', // Default to create new user for simplicity
    kyb_required: true
  });
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, failed: 0, errors: [] });

  const reset = () => {
    setStep(1);
    setFile(null);
    setParsedData([]);
    setDefaults({
      country_id: '',
      default_currency_id: '',
      status: 'active',
      owner_mode: 'create',
      kyb_required: true
    });
    setProgress({ current: 0, total: 0, success: 0, failed: 0, errors: [] });
  };

  const handleClose = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      parseCSV(f);
    }
  };

  const parseCSV = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = line.split(',').map(v => v.trim());
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx];
        });
        
        // Basic validation
        if (row.legal_name && row.owner_email) {
          data.push(row);
        }
      }
      setParsedData(data);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!parsedData.length) return;
    if (!defaults.country_id || !defaults.default_currency_id) {
        toast.error(t('tenants.list.defaultsRequired'));
        return;
    }

    setImporting(true);
    setProgress({ current: 0, total: parsedData.length, success: 0, failed: 0, errors: [] });

    const results = { success: 0, failed: 0, errors: [] };

    for (let i = 0; i < parsedData.length; i++) {
      const row = parsedData[i];
      try {
        const payload = {
          ...defaults,
          legal_name: row.legal_name,
          trade_name: row.trade_name || '',
          tax_id: row.tax_id || '',
          owner_email: row.owner_email,
          owner_name: row.owner_name || row.owner_email.split('@')[0],
          invoice_number_start: 1,
          country_id: Number(defaults.country_id),
          default_currency_id: Number(defaults.default_currency_id),
        };

        const formData = new FormData();
        Object.keys(payload).forEach(key => {
            formData.append(key, payload[key]);
        });

        await api.post('/api/tenants/wizard', formData);
        results.success++;
      } catch (err) {
        console.error(err);
        results.failed++;
        results.errors.push(t('tenants.list.rowError', {
          row: i + 2,
          name: row.legal_name,
          message: err.message || t('tenants.list.unknownError'),
        }));
      }

      setProgress({
        current: i + 1,
        total: parsedData.length,
        success: results.success,
        failed: results.failed,
        errors: results.errors
      });
    }

    setImporting(false);
    setStep(3); // Result step
    if (results.success > 0) {
        onSuccess?.();
    }
  };

  const downloadTemplate = () => {
    const headers = ['legal_name', 'trade_name', 'tax_id', 'owner_email', 'owner_name'];
    const sample = ['Acme Corp,Acme,12345678,admin@acme.com,Admin User'];
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...sample].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", t('tenants.list.templateFilename'));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal open={open} onClose={handleClose} title={t('tenants.list.importTitle')}>
      <div className="space-y-6">
        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-xl bg-blue-50 p-4 border border-blue-100">
                <div className="flex items-start gap-3">
                    <i className="bi bi-info-circle text-blue-600 text-xl"></i>
                    <div>
                        <h4 className="font-semibold text-blue-900 text-sm">{t('tenants.list.instructions')}</h4>
                        <p className="text-xs text-blue-700 mt-1">
                            {t('tenants.list.instructionsText')}
                        </p>
                        <button onClick={downloadTemplate} className="text-xs font-semibold text-blue-600 underline mt-2 hover:text-blue-800">
                            {t('tenants.list.downloadTemplateBtn')}
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">{t('tenants.list.defaultCountry')}</label>
                    <select
                        value={defaults.country_id}
                        onChange={(e) => setDefaults(p => ({ ...p, country_id: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                    >
                        <option value="">{t('tenants.common.select')}</option>
                        {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">{t('tenants.list.defaultCurrency')}</label>
                    <select
                        value={defaults.default_currency_id}
                        onChange={(e) => setDefaults(p => ({ ...p, default_currency_id: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                    >
                        <option value="">{t('tenants.common.select')}</option>
                        {currencies.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                    </select>
                </div>
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50">
                    <input
                        type="checkbox"
                        checked={defaults.kyb_required}
                        onChange={(e) => setDefaults(p => ({ ...p, kyb_required: e.target.checked }))}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                    />
                    <span>
                        <span className="block text-sm font-semibold text-slate-700">{t('tenants.list.kybRequiredLabel')}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">{t('tenants.list.kybRequiredHint')}</span>
                    </span>
                </label>
            </div>

            <div className="border-t border-slate-100 pt-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('tenants.list.csvFile')}</label>
                <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand hover:file:bg-brand-100"
                />
            </div>

            {parsedData.length > 0 && (
                <div className="text-sm text-emerald-600 font-medium">
                    <i className="bi bi-check-circle mr-2"></i>
                    {t('tenants.list.detected', { count: parsedData.length })}
                </div>
            )}

            <div className="flex justify-end pt-4">
                <button
                    onClick={() => setStep(2)}
                    disabled={!parsedData.length || !defaults.country_id || !defaults.default_currency_id}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                >
                    {t('tenants.list.continueBtn')}
                </button>
            </div>
          </div>
        )}

        {step === 2 && (
            <div className="space-y-4">
                <div className="text-center py-4">
                    {importing ? (
                        <>
                            <div className="animate-spin h-8 w-8 border-2 border-brand border-t-transparent rounded-full mx-auto mb-3"></div>
                            <h3 className="text-lg font-semibold text-slate-900">{t('tenants.list.importingTitle')}</h3>
                            <p className="text-sm text-slate-500">{t('tenants.list.processing', { current: progress.current, total: progress.total })}</p>
                        </>
                    ) : (
                        <>
                            <h3 className="text-lg font-semibold text-slate-900">{t('tenants.list.readyTitle')}</h3>
                            <p className="text-sm text-slate-500">{t('tenants.list.willCreate', { count: parsedData.length })}</p>
                        </>
                    )}
                </div>

                {!importing && (
                    <div className="flex justify-end gap-2 pt-4">
                        <button
                            onClick={() => setStep(1)}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            {t('tenants.common.back')}
                        </button>
                        <button
                            onClick={handleImport}
                            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                        >
                            {t('tenants.list.startImport')}
                        </button>
                    </div>
                )}
            </div>
        )}

        {step === 3 && (
            <div className="space-y-4">
                <div className="text-center py-4">
                    <div className={`h-12 w-12 rounded-full mx-auto flex items-center justify-center mb-3 ${progress.failed === 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                        <i className={`bi ${progress.failed === 0 ? 'bi-check-lg' : 'bi-exclamation-lg'} text-2xl`}></i>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{t('tenants.list.finishedTitle')}</h3>
                    <p className="text-sm text-slate-500">
                        {t('tenants.list.results', { success: progress.success, failed: progress.failed })}
                    </p>
                </div>

                {progress.errors.length > 0 && (
                    <div className="bg-red-50 rounded-lg p-3 max-h-40 overflow-y-auto border border-red-100">
                        <h4 className="text-xs font-bold text-red-800 mb-2 uppercase tracking-wide">{t('tenants.list.errorsTitle')}</h4>
                        <ul className="text-xs text-red-700 space-y-1">
                            {progress.errors.map((e, i) => (
                                <li key={i}>{e}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="flex justify-end pt-4">
                    <button
                        onClick={handleClose}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                        {t('tenants.common.close')}
                    </button>
                </div>
            </div>
        )}
      </div>
    </Modal>
  );
}
