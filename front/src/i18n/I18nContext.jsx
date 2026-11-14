import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translations } from './translations';

const I18nContext = createContext(null);
const STORAGE_KEY = 'spectra_language';
const SUPPORTED_LANGUAGES = ['es', 'en'];

function getValue(dictionary, key) {
  return key.split('.').reduce((value, part) => (
    value && typeof value === 'object' ? value[part] : undefined
  ), dictionary);
}

function detectLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED_LANGUAGES.includes(stored)) return stored;
    const browserLanguage = (navigator.language || 'es').slice(0, 2).toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(browserLanguage)) return browserLanguage;
  } catch {
    // Ignore storage or navigator access errors
  }
  return 'es';
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(detectLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Ignore storage write errors
    }
  }, [language]);

  const setLanguage = useCallback((nextLanguage) => {
    if (SUPPORTED_LANGUAGES.includes(nextLanguage)) {
      setLanguageState(nextLanguage);
    }
  }, []);

  const t = useCallback((key, variables = {}) => {
    const current = getValue(translations[language], key);
    const fallback = getValue(translations.es, key);
    const value = typeof current === 'string' ? current : fallback;

    if (typeof value !== 'string') return key;

    return value.replace(/\{(\w+)\}/g, (_, name) => (
      variables[name] !== undefined ? String(variables[name]) : `{${name}}`
    ));
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext) || {
    language: 'es',
    setLanguage: () => {},
    t: (key) => key,
  };
}
