import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch, resolveApiUrl } from '../lib/api';
import CountryCalculatorSwitch from '../components/CountryCalculatorSwitch';

const TERMINATION_OPTIONS = [
  { value: 'RENUNCIA', label: 'Renuncia' },
  { value: 'DESPIDO_INJUSTIFICADO', label: 'Despido injustificado' },
  { value: 'DESPIDO_JUSTIFICADO', label: 'Despido justificado' },
  { value: 'FIN_CONTRATO', label: 'Fin de contrato' },
  { value: 'MUTUO', label: 'Mutuo acuerdo' },
];

export default function MexicoNetSalaryCalculator({ onCountryChange }) {
  const { token } = useAuth();
  const apiUrl = resolveApiUrl();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [terminationReasonPreset, setTerminationReasonPreset] = useState('DESPIDO_INJUSTIFICADO');
  const [salaryBase, setSalaryBase] = useState('');
  const [workedDaysLastPeriod, setWorkedDaysLastPeriod] = useState('0');
  const [pendingVacationDays, setPendingVacationDays] = useState('0');
  const [otherBenefits, setOtherBenefits] = useState('0');

  const [aguinaldoDays, setAguinaldoDays] = useState('15');
  const [vacationDays, setVacationDays] = useState('12');
  const [vacationPremiumPct, setVacationPremiumPct] = useState('25');
  const [seniorityDaysPerYear, setSeniorityDaysPerYear] = useState('12');
  const [twentyDaysPerYear, setTwentyDaysPerYear] = useState('20');
  const [includeSeniority, setIncludeSeniority] = useState(true);
  const [applyTwentyDays, setApplyTwentyDays] = useState(false);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const currencySymbol = '$';
  const fmt = (value) => `${currencySymbol} ${Number(value || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const terminationReason = useMemo(() => (
    TERMINATION_OPTIONS.find((option) => option.value === terminationReasonPreset)?.label
      || terminationReasonPreset
  ), [terminationReasonPreset]);

  const dateError = useMemo(() => {
    if (!startDate || !endDate) return '';
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Fechas inválidas';
    if (start.getTime() > end.getTime()) return 'La fecha de ingreso no puede ser mayor que la fecha de baja';
    return '';
  }, [endDate, startDate]);

  const canSubmit = useMemo(() => (
    !submitting
    && Boolean(startDate && endDate && salaryBase)
    && !dateError
    && Number(salaryBase) > 0
  ), [dateError, endDate, salaryBase, startDate, submitting]);

  const handleReasonChange = (value) => {
    setTerminationReasonPreset(value);
    if (value === 'DESPIDO_INJUSTIFICADO') {
      setIncludeSeniority(true);
    } else {
      setIncludeSeniority(false);
      setApplyTwentyDays(false);
    }
  };

  const handleCountryChange = (nextCountry) => {
    if (nextCountry !== 'MX') {
      onCountryChange(nextCountry);
    }
  };

  const resetAll = () => {
    setStartDate('');
    setEndDate('');
    setTerminationReasonPreset('DESPIDO_INJUSTIFICADO');
    setSalaryBase('');
    setWorkedDaysLastPeriod('0');
    setPendingVacationDays('0');
    setOtherBenefits('0');
    setAguinaldoDays('15');
    setVacationDays('12');
    setVacationPremiumPct('25');
    setSeniorityDaysPerYear('12');
    setTwentyDaysPerYear('20');
    setIncludeSeniority(true);
    setApplyTwentyDays(false);
    setError('');
    setResult(null);
    setShowAdvanced(false);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    setResult(null);

    try {
      const body = {
        country: 'MX',
        currency_code: 'MXN',
        start_date: startDate,
        end_date: endDate,
        termination_reason: terminationReason,
        salary_base: Number(salaryBase || 0),
        worked_days_last_period: Number(workedDaysLastPeriod || 0),
        pending_vacation_days: Number(pendingVacationDays || 0),
        other_benefits: Number(otherBenefits || 0),
        config: {
          days_per_month: 30,
          aguinaldo_days: Number(aguinaldoDays || 15),
          vacation_days: Number(vacationDays || 12),
          vacation_premium_rate: Number(vacationPremiumPct || 0) / 100,
          seniority_days_per_year: Number(seniorityDaysPerYear || 12),
          twenty_days_per_year: Number(twentyDaysPerYear || 20),
          include_seniority_premium: includeSeniority,
          apply_twenty_days: applyTwentyDays,
        },
      };

      const response = await apiFetch(apiUrl, '/api/payroll/salary-calculator', {
        method: 'POST',
        body,
        token,
      });
      setResult(response);
    } catch (err) {
      setError(err?.message || 'Error al calcular');
    } finally {
      setSubmitting(false);
    }
  };

  const finiquitoItems = useMemo(
    () => (Array.isArray(result?.items) ? result.items.filter((item) => item.section === 'finiquito' && Number(item.amount) !== 0) : []),
    [result?.items],
  );
  const indemnizationItems = useMemo(
    () => (Array.isArray(result?.items) ? result.items.filter((item) => item.section === 'indemnizacion' && Number(item.amount) !== 0) : []),
    [result?.items],
  );

  return (
    <div className="p-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Calculadora de Finiquito y Liquidación (México)</h1>
            <div className="mt-1 text-sm text-slate-500">
              Calcula finiquito, indemnización constitucional, prima de antigüedad y 20 días por año cuando legalmente corresponda.
            </div>
          </div>
          <CountryCalculatorSwitch country="MX" onChange={handleCountryChange} />
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          La indemnización de 3 meses aplica para despido injustificado. Los 20 días por año solo se incluyen si activas la opción correspondiente, ya que proceden únicamente en los supuestos previstos por la LFT.
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Datos para el cálculo</div>
              <div className="mt-1 text-xs text-slate-500">Moneda: Pesos mexicanos (MXN)</div>
            </div>
          </div>

          {dateError && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {dateError}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-900">Datos del trabajador</div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Fecha de ingreso</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Fecha de baja</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                      required
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700">Motivo de terminación</label>
                  <select
                    value={terminationReasonPreset}
                    onChange={(e) => handleReasonChange(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                  >
                    {TERMINATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-900">Datos remunerativos</div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Sueldo mensual</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{currencySymbol}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={salaryBase}
                        onChange={(e) => setSalaryBase(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pl-8 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Días trabajados del último periodo</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={workedDaysLastPeriod}
                      onChange={(e) => setWorkedDaysLastPeriod(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Días de vacaciones pendientes</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={pendingVacationDays}
                      onChange={(e) => setPendingVacationDays(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Otras prestaciones pendientes</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{currencySymbol}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={otherBenefits}
                        onChange={(e) => setOtherBenefits(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pl-8 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-900">Prestaciones legales</div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500">Días de aguinaldo</label>
                    <input
                      type="number"
                      min="0"
                      value={aguinaldoDays}
                      onChange={(e) => setAguinaldoDays(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500">Días de vacaciones anuales</label>
                    <input
                      type="number"
                      min="0"
                      value={vacationDays}
                      onChange={(e) => setVacationDays(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500">Prima vacacional (%)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={vacationPremiumPct}
                      onChange={(e) => setVacationPremiumPct(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500">Días de prima de antigüedad por año</label>
                    <input
                      type="number"
                      min="0"
                      value={seniorityDaysPerYear}
                      onChange={(e) => setSeniorityDaysPerYear(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={includeSeniority}
                      onChange={(e) => setIncludeSeniority(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-brand focus:ring-brand"
                    />
                    <span>Incluir prima de antigüedad (12 días por año cuando corresponda)</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={applyTwentyDays}
                      onChange={(e) => setApplyTwentyDays(e.target.checked)}
                      disabled={terminationReasonPreset !== 'DESPIDO_INJUSTIFICADO'}
                      className="mt-0.5 rounded border-slate-300 text-brand focus:ring-brand disabled:opacity-50"
                    />
                    <span>Incluir 20 días por año (solo si legalmente corresponde)</span>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Opciones avanzadas</div>
                    <div className="mt-1 text-xs text-slate-500">Ajusta el tope de días para el cálculo de 20 días por año.</div>
                  </div>
                  <span className="text-sm font-semibold text-slate-600">{showAdvanced ? '−' : '+'}</span>
                </button>
                {showAdvanced && (
                  <div className="mt-4 max-w-xs">
                    <label className="block text-xs font-semibold text-slate-500">Días por año para indemnización de 20 días</label>
                    <input
                      type="number"
                      min="0"
                      value={twentyDaysPerYear}
                      onChange={(e) => setTwentyDaysPerYear(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={resetAll}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Limpiar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {submitting ? 'Calculando...' : 'Calcular finiquito y liquidación'}
            </button>
          </div>
        </form>

        {result && (
          <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Total a pagar</div>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">{fmt(result.total_pagar)}</div>
              </div>
              <div className="text-xs text-slate-500">
                Antigüedad: {result?.service_time?.years}a {result?.service_time?.months}m {result?.service_time?.days}d
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Finiquito</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{fmt(result?.total_finiquito)}</div>
                <div className="mt-2 text-xs text-slate-500">Prestaciones devengadas</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Indemnización</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{fmt(result?.total_indemnizacion)}</div>
                <div className="mt-2 text-xs text-slate-500">Solo cuando corresponde</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Salario diario integrado</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{fmt(result?.salary?.integrated_daily)}</div>
                <div className="mt-2 text-xs text-slate-500">Factor: {Number(result?.salary?.integration_factor || 0).toFixed(4)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Aguinaldo proporcional</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{fmt(result?.finiquito?.aguinaldo?.amount)}</div>
                <div className="mt-2 text-xs text-slate-500">{result?.finiquito?.aguinaldo?.days_worked} días trabajados</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">Finiquito</div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {finiquitoItems.map((item) => (
                      <tr key={item.code}>
                        <td className="px-4 py-2 text-slate-700">{item.name}</td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-900">{fmt(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">Indemnización</div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {indemnizationItems.length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-slate-500">No aplica indemnización para este motivo.</td>
                      </tr>
                    ) : (
                      indemnizationItems.map((item) => (
                        <tr key={item.code}>
                          <td className="px-4 py-2 text-slate-700">{item.name}</td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-900">{fmt(item.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 p-4 md:grid-cols-3">
              <div>
                <div className="text-xs font-semibold text-slate-500">Salario diario</div>
                <div className="mt-1 font-bold text-slate-900">{fmt(result?.salary?.daily)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Salario diario integrado</div>
                <div className="mt-1 font-bold text-slate-900">{fmt(result?.salary?.integrated_daily)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Días trabajados en el año</div>
                <div className="mt-1 font-bold text-slate-900">{result?.finiquito?.aguinaldo?.days_worked}</div>
              </div>
            </div>

            {result?.indemnizacion?.unjustified_dismissal && !result?.indemnizacion?.twenty_days?.applied && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                Los 20 días por año no se incluyeron. Actívalos únicamente si el caso cumple los supuestos legales previstos por la LFT.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
