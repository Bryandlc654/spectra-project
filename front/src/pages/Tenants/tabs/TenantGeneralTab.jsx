// src/pages/tenants/tabs/TenantGeneralTab.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { normalizePageResponse } from '../../../lib/pagination';

export default function TenantGeneralTab({ companyId, api }) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');

    // Lookups
    const [countries, setCountries] = useState([]);
    const [currencies, setCurrencies] = useState([]);
    const [timezones, setTimezones] = useState([]);
    const [lookupsErr, setLookupsErr] = useState('');
    const [lookupsLoading, setLookupsLoading] = useState(false);

    // Load tenant
    useEffect(() => {
        (async () => {
            setErr('');
            try {
                const d = await api.get(`/api/tenants/${companyId}`);
                setData(d);
            } catch (e) {
                setErr(e?.message || 'No se pudo cargar el tenant');
            }
        })();
    }, [companyId, api]);

    // Load lookups
    useEffect(() => {
        (async () => {
            setLookupsErr('');
            setLookupsLoading(true);
            try {
                const [c1, c2, c3] = await Promise.all([
                    api.get('/api/countries?page=1&per_page=500'),
                    api.get('/api/currencies?page=1&per_page=500'),
                    api.get('/api/timezones?page=1&per_page=2000'),
                ]);

                const outCountries = normalizePageResponse(c1);
                const outCurrencies = normalizePageResponse(c2);
                const outTimezones = normalizePageResponse(c3);

                setCountries(outCountries.items || []);
                setCurrencies(outCurrencies.items || []);
                setTimezones(outTimezones.items || []);
            } catch (e) {
                setLookupsErr(e?.message || 'No se pudieron cargar los catálogos');
            } finally {
                setLookupsLoading(false);
            }
        })();
    }, [api]);

    // Normalize response shapes (backend can return {data:{company,wallet}} or {company,wallet})
    const company = data?.data?.company || data?.company || null;
    const wallet = data?.data?.wallet || data?.wallet || null;

    // Maps
    const countriesById = useMemo(() => {
        const m = new Map();
        for (const c of countries) m.set(Number(c.id), c);
        return m;
    }, [countries]);

    const currenciesById = useMemo(() => {
        const m = new Map();
        for (const c of currencies) m.set(Number(c.id), c);
        return m;
    }, [currencies]);

    const timezonesById = useMemo(() => {
        const m = new Map();
        for (const t of timezones) m.set(Number(t.id), t);
        return m;
    }, [timezones]);

    // Prefer objects if backend already includes them (JOIN), otherwise map by id
    const countryObj = company?.country
        || (company?.country_id ? countriesById.get(Number(company.country_id)) : null);

    const currencyObj = company?.currency
        || company?.default_currency
        || (company?.default_currency_id ? currenciesById.get(Number(company.default_currency_id)) : null);

    const tzObj = company?.timezone
        || (company?.timezone_id ? timezonesById.get(Number(company.timezone_id)) : null);


    const walletCurrencyObj =
        wallet?.currency ||
        (wallet?.currency_id ? currenciesById.get(String(wallet.currency_id)) : null);

    if (err) return <div className="text-sm text-red-700">{err}</div>;
    if (!company) return <div className="text-sm text-slate-600">Cargando...</div>;

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4 bg-white">
                <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Datos</div>

                {lookupsErr ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        No se pudieron cargar catálogos (Países/Monedas/Zonas horarias).
                        <div className="mt-1 text-xs text-amber-800">{lookupsErr}</div>
                    </div>
                ) : null}

                <div className="mt-3 space-y-2 text-sm">
                    <div>
                        <span className="text-slate-500">Razón social:</span>{' '}
                        <span className="font-semibold">{company.legal_name}</span>
                    </div>

                    <div>
                        <span className="text-slate-500">Comercial:</span>{' '}
                        <span className="font-semibold">{company.trade_name || '—'}</span>
                    </div>

                    <div>
                        <span className="text-slate-500">País:</span>{' '}
                        {countryObj ? (
                            <span className="font-semibold">
                                {countryObj.iso2} — {countryObj.name}
                            </span>
                        ) : (
                            <span className="text-slate-500">—</span>
                        )}

                    </div>

                    <div>
                        <span className="text-slate-500">Moneda base:</span>{' '}
                        {currencyObj ? (
                            <span className="font-semibold">
                                {currencyObj.code} — {currencyObj.name}
                                {currencyObj.symbol && <span className="text-slate-500"> ({currencyObj.symbol})</span>}
                            </span>
                        ) : (
                            <span className="text-slate-500">—</span>
                        )}

                    </div>

                    <div>
                        <span className="text-slate-500">Zona horaria:</span>{' '}
                        {tzObj ? (
                            <span className="font-semibold">{tzObj.name || tzObj.timezone || tzObj.value || '—'}</span>
                        ) : (
                            <span className="font-semibold">{company.timezone_id ?? '—'}</span>
                        )}
                    </div>

                    <div>
                        <span className="text-slate-500">Estado:</span>{' '}
                        <span className="font-semibold">{company.status || '—'}</span>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4 bg-white">
                <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Resumen</div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <div className="text-xs text-slate-500">Wallet</div>
                        <div className="text-lg font-bold text-slate-900">{wallet?.balance ?? '—'}</div>
                    </div>

                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <div className="text-xs text-slate-500">Wallet currency</div>
                        <div className="text-lg font-bold text-slate-900">
                            {walletCurrencyObj ? (
                                <>
                                    {walletCurrencyObj.code ? `${walletCurrencyObj.code}` : wallet?.currency_id}
                                    {walletCurrencyObj.symbol ? <span className="text-slate-500"> ({walletCurrencyObj.symbol})</span> : null}
                                </>
                            ) : (
                                wallet?.currency_id ?? '—'
                            )}
                        </div>
                    </div>

                    {/* Placeholders hasta tener endpoints reales */}
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <div className="text-xs text-slate-500">Invoices</div>
                        <div className="text-lg font-bold text-slate-900">—</div>
                    </div>

                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <div className="text-xs text-slate-500">Proyectos</div>
                        <div className="text-lg font-bold text-slate-900">—</div>
                    </div>
                </div>

                {lookupsLoading ? (
                    <div className="mt-3 text-xs text-slate-500">Cargando catálogos…</div>
                ) : null}
            </div>
        </div>
    );
}
