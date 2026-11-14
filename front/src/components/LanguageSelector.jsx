import React from 'react';
import { useI18n } from '../i18n/I18nContext';

export default function LanguageSelector({ className = '' }) {
  const { language, setLanguage, t } = useI18n();

  return (
    <label
      className={`inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-2 text-slate-700 ${className}`}
      title={t('common.language')}
    >
      <i className="bi bi-translate text-slate-500" />
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        aria-label={t('common.language')}
        className="cursor-pointer bg-transparent text-xs font-semibold text-slate-700 outline-none"
      >
        <option value="es">{t('common.spanish')}</option>
        <option value="en">{t('common.english')}</option>
      </select>
    </label>
  );
}
