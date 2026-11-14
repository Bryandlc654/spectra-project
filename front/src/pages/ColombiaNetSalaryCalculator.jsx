import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch, resolveApiUrl } from '../lib/api';
import CountryCalculatorSwitch from '../components/CountryCalculatorSwitch';

const TERMINATION_OPTIONS = [
  { value: 'RENUNCIA', label: 'Renuncia' },
  { value: 'DESPIDO_SIN_JUSTA_CAUSA', label: 'Despido sin justa causa' },
  { value: 'DESPIDO_CON_JUSTA_CAUSA', label: 'Despido con justa causa' },
  { value: 'FIN_CONTRATO', label: 'Fin de contrato' },
  { value: 'MUTUO', label: 'Mutuo acuerdo' },
];

const CONTRACT_OPTIONS = [
  { value: 'INDEFINIDO', label: 'Término indefinido' },
  { value: 'TERMINO_FIJO', label: 'Término fijo' },
  { value: 'OBRA_LABOR', label: 'Obra o labor' },
];

export default function ColombiaNetSalaryCalculator({ onCountryChange }) {
  const { token } = useAuth();
  const apiUrl = resolveApiUrl();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [terminationReasonPreset, setTerminationReasonPreset] = useState('RENUNCIA');
  const [contractType, setContractType] = useState('INDEFINIDO');
  const [salaryBase, setSalaryBase] = useState('');
  const [primaAdvances, setPrimaAdvances] = useState('0');
  const [manualIndemnization, setManualIndemnization] = useState('0');
  const [smlmv, setSmlmv] = useState('1750905');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const currencySymbol = '$';
  const fmt = (value) => `${currencySymbol} ${Number(value || 0).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const terminationReason = useMemo(() => (
    TERMINATION_OPTIONS.find((option) => option.value === terminationReasonPreset)?.label
      || terminationReasonPreset
  ), [terminationReasonPreset]);

  const isUnjustified = terminationReasonPreset === 'DESPIDO_SIN_JUSTA_CAUSA';
  const isIndefinite = contractType === 'INDEFINIDO';

  const dateError = useMemo(() => {
    if (!startDate || !endDate) return '';
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Fechas inválidas';
    if (start.getTime() > end.getTime()) return 'La fecha de ingreso no puede ser mayor que la fecha de retiro';
    return '';
  }, [endDate, startDate]);

  const canSubmit = useMemo(() => (
    !submitting
    && Boolean(startDate && endDate && salaryBase)
    && !dateError
    && Number(salaryBase) > 0
  ), [dateError, endDate, salaryBase, startDate, submitting]);

  const handleCountryChange = (nextCountry) => {
    if (nextCountry !== 'CO') {
      onCountryChange(nextCountry);
    }
  };

  const resetAll = () => {
    setStartDate('');
    setEndDate('');
    setTerminationReasonPreset('RENUNCIA');
    setContractType('INDEFINIDO');
    setSalaryBase('');
    setPrimaAdvances('0');
    setManualIndemnization('0');
    setSmlmv('1750905');
    setShowAdvanced(false);
    setError('');
    setResult(null);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    setResult(null);

    try {
      const body = {
        country: 'CO',
        currency_code: 'COP',
        start_date: startDate,
        end_date: endDate,
        termination_reason: terminationReason,
        contract_type: contractType,
        salary_base: Number(salaryBase || 0),
        prima_advances: Number(primaAdvances || 0),
        manual_indemnization: Number(manualIndemnization || 0),
        config: {
          smlmv: Number(smlmv || 1750905),
          seniority_interest_rate: 0.12,
          days_per_year: 360,
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

  return (
    <div className="p-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Calculadora de Liquidación (Colombia)</h1>
            <div className="mt-1 text-sm text-slate-500">
              Calcula cesantías, intereses sobre cesantías, prima de servicios, vacaciones e indemnización cuando corresponda.
            </div>
          </div>
          <CountryCalculatorSwitch country="CO" onChange={handleCountryChange} />
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          La indemnización por despido sin justa causa se calcula para contrato indefinido según el artículo 64 del CST. Para contratos fijos u obra o labor puedes ingresar el valor manual de indemnización.
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Datos para el cálculo</div>
          <div className="mt-1 text-xs text-slate-500">Moneda: Pesos colombianos (COP)</div>

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
                    <label className="block text-sm font-medium text-slate-700">Fecha de retiro</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Motivo de retiro</label>
                    <select
                      value={terminationReasonPreset}
                      onChange={(e) => setTerminationReasonPreset(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                    >
                      {TERMINATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Tipo de contrato</label>
                    <select
                      value={contractType}
                      onChange={(e) => setContractType(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                    >
                      {CONTRACT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-900">Datos remunerativos</div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Salario mensual</label>
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
                    <label className="block text-sm font-medium text-slate-700">Anticipos de prima pagados</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{currencySymbol}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={primaAdvances}
                        onChange={(e) => setPrimaAdvances(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pl-8 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  Cesantías: salario × días / 360 · Vacaciones: salario × días / 720.
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-900">Indemnización</div>
                <div className="mt-2 text-xs text-slate-500">
                  {isUnjustified
                    ? (isIndefinite
                      ? 'Se calculará automáticamente según el salario frente a 10 SMLMV.'
                      : 'Para contrato fijo u obra o labor, ingresa el valor manual de indemnización en opciones avanzadas.')
                    : 'No aplica indemnización para el motivo seleccionado.'}
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-semibold text-slate-500">SMLMV mensual</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{currencySymbol}</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={smlmv}
                      onChange={(e) => setSmlmv(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pl-8 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                    />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Límite 10 SMLMV: {fmt(Number(smlmv || 0) * 10)}</div>
                </div>

                {isUnjustified && !isIndefinite && (
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-slate-500">Indemnización manual</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{currencySymbol}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={manualIndemnization}
                        onChange={(e) => setManualIndemnization(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pl-8 text-sm outline-none transition-all focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Opciones avanzadas</div>
                    <div className="mt-1 text-xs text-slate-500">Parámetros usados para la indemnización y los intereses.</div>
                  </div>
                  <span className="text-sm font-semibold text-slate-600">{showAdvanced ? '−' : '+'}</span>
                </button>
                {showAdvanced && (
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500">Días base del año</label>
                      <input value="360" readOnly className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500">Interés sobre cesantías</label>
                      <input value="12%" readOnly className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-500" />
                    </div>
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
              {submitting ? 'Calculando...' : 'Calcular liquidación'}
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
                Tiempo trabajado: {result?.service_time?.total_days} días ({result?.service_time?.years}a {result?.service_time?.months}m {result?.service_time?.days}d)
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Cesantías</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{fmt(result?.cesantias?.amount)}</div>
                <div className="mt-2 text-xs text-slate-500">{result?.cesantias?.days} días</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Intereses cesantías</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{fmt(result?.intereses_cesantias?.amount)}</div>
                <div className="mt-2 text-xs text-slate-500">12% anual</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Prima de servicios</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{fmt(result?.prima_servicios?.amount)}</div>
                <div className="mt-2 text-xs text-slate-500">Bruta: {fmt(result?.prima_servicios?.gross)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Vacaciones</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{fmt(result?.vacaciones?.amount)}</div>
                <div className="mt-2 text-xs text-slate-500">Divisor 720</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">Prestaciones sociales</div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {(result.items || []).filter((item) => item.code !== 'INDEMNIZACION').map((item) => (
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
                    {!result?.indemnizacion?.applied ? (
                      <tr>
                        <td className="px-4 py-3 text-slate-500">No aplica indemnización para este motivo.</td>
                      </tr>
                    ) : (
                      <tr>
                        <td className="px-4 py-2 text-slate-700">
                          Indemnización {result?.indemnizacion?.manual ? 'manual' : 'por despido sin justa causa'}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-900">{fmt(result?.indemnizacion?.amount)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {result?.indemnizacion?.applied && !result?.indemnizacion?.manual && (
                  <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                    {result?.indemnizacion?.base_days} días primer año + {result?.indemnizacion?.additional_days_per_year} días por año adicional · {result?.indemnizacion?.days} días calculados
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 p-4 md:grid-cols-3">
              <div>
                <div className="text-xs font-semibold text-slate-500">Salario diario</div>
                <div className="mt-1 font-bold text-slate-900">{fmt(result?.salary?.daily)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Anticipos de prima</div>
                <div className="mt-1 font-bold text-slate-900">{fmt(result?.prima_servicios?.advances)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Salario frente a 10 SMLMV</div>
                <div className="mt-1 font-bold text-slate-900">
                  {result?.indemnizacion?.salary_bracket === 'high' ? 'Igual o superior' : 'Inferior'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
