import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch, resolveApiUrl } from '../lib/api';

export default function FreelancerNetSalaryPage() {
  const { token } = useAuth();
  const apiUrl = resolveApiUrl();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [terminationReasonPreset, setTerminationReasonPreset] = useState('RENUNCIA');

  const [salaryBase, setSalaryBase] = useState('');
  const [hasFamilyAllowance, setHasFamilyAllowance] = useState(true);
  const [familyAllowanceAmount, setFamilyAllowanceAmount] = useState('113');

  const [pensionType, setPensionType] = useState('AFP');
  const [onpRatePct, setOnpRatePct] = useState('13');
  const [afpFundPct, setAfpFundPct] = useState('10');
  const [afpCommissionPct, setAfpCommissionPct] = useState('1.47');
  const [afpInsurancePct, setAfpInsurancePct] = useState('1.70');

  const [bonusRatePct, setBonusRatePct] = useState('9');
  const [daysPerMonth, setDaysPerMonth] = useState('30');
  const [daysPerYear, setDaysPerYear] = useState('360');
  const [ctsDivisor, setCtsDivisor] = useState('12');
  const [gratDivisor, setGratDivisor] = useState('6');

  const [showPensionRates, setShowPensionRates] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const currencyCode = 'PEN';
  const currencySymbol = useMemo(() => (currencyCode === 'PEN' ? 'S/' : ''), [currencyCode]);
  const fmt = (n) => `${currencySymbol} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const terminationReason = useMemo(() => {
    if (terminationReasonPreset === 'OTRO') return 'Otro';
    if (terminationReasonPreset === 'RENUNCIA') return 'Renuncia';
    if (terminationReasonPreset === 'DESPIDO') return 'Despido';
    if (terminationReasonPreset === 'FIN_CONTRATO') return 'Fin de contrato';
    if (terminationReasonPreset === 'MUTUO') return 'Mutuo acuerdo';
    return String(terminationReasonPreset || '').trim();
  }, [terminationReasonPreset]);

  const dateError = useMemo(() => {
    if (!startDate || !endDate) return '';
    try {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 'Fechas inválidas';
      if (s.getTime() > e.getTime()) return 'La fecha de ingreso no puede ser mayor que la fecha de cese';
    } catch {
      return 'Fechas inválidas';
    }
    return '';
  }, [endDate, startDate]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!startDate || !endDate) return false;
    if (!terminationReason) return false;
    if (!salaryBase) return false;
    if (dateError) return false;
    return true;
  }, [dateError, endDate, salaryBase, startDate, submitting, terminationReason]);

  function resetPensionDefaults(nextType = pensionType) {
    if (nextType === 'AFP') {
      setAfpFundPct('10');
      setAfpCommissionPct('1.47');
      setAfpInsurancePct('1.70');
    } else {
      setOnpRatePct('13');
    }
  }

  function resetSystemDefaults() {
    setBonusRatePct('9');
    setDaysPerMonth('30');
    setDaysPerYear('360');
    setCtsDivisor('12');
    setGratDivisor('6');
  }

  function resetAll() {
    setStartDate('');
    setEndDate('');
    setTerminationReasonPreset('RENUNCIA');
    setSalaryBase('');
    setHasFamilyAllowance(true);
    setFamilyAllowanceAmount('113');
    setPensionType('AFP');
    resetPensionDefaults('AFP');
    resetSystemDefaults();
    setError('');
    setResult(null);
    setShowDetails(false);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    setResult(null);

    try {
      const body = {
        country: 'PE',
        currency_code: currencyCode,
        start_date: startDate,
        end_date: endDate,
        termination_reason: terminationReason,
        salary_base: Number(salaryBase || 0),
        family_allowance: hasFamilyAllowance ? Number(familyAllowanceAmount || 0) : 0,
        pension: {
          type: pensionType,
          onp_rate: Number(onpRatePct || 0) / 100,
          afp_fund: Number(afpFundPct || 0) / 100,
          afp_commission: Number(afpCommissionPct || 0) / 100,
          afp_insurance: Number(afpInsurancePct || 0) / 100
        },
        config: {
          bonus_rate: Number(bonusRatePct || 0) / 100,
          days_per_month: Number(daysPerMonth || 30),
          days_per_year: Number(daysPerYear || 360),
          cts_divisor: Number(ctsDivisor || 12),
          grat_divisor: Number(gratDivisor || 6)
        }
      };

      const res = await apiFetch(apiUrl, '/api/payroll/salary-calculator', {
        method: 'POST',
        body,
        token
      });
      setResult(res);
    } catch (err) {
      setError(err?.message || 'Error al calcular');
    } finally {
      setSubmitting(false);
    }
  }

  const benefits = useMemo(() => (Array.isArray(result?.items) ? result.items.filter((i) => i.type === 'benefit') : []), [result?.items]);
  const deductions = useMemo(() => (Array.isArray(result?.items) ? result.items.filter((i) => i.type === 'deduction') : []), [result?.items]);
  const benefitByCode = useMemo(() => {
    const m = new Map();
    for (const it of benefits) m.set(it.code, it);
    return m;
  }, [benefits]);
  const deductionsTotal = useMemo(() => deductions.reduce((acc, d) => acc + Number(d.amount || 0), 0), [deductions]);

  return (
    <div className="p-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calculadora de Liquidación (Perú)</h1>
          <div className="mt-1 text-sm text-slate-500">
            Ingresa los datos básicos y obtén el total a pagar con el desglose de CTS, vacaciones, gratificación y bonificación.
          </div>
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
              <div className="mt-1 text-xs text-slate-500">Moneda: Soles (PEN)</div>
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
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Fecha de cese</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                      required
                    />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Motivo de cese</label>
                    <select
                      value={terminationReasonPreset}
                      onChange={(e) => setTerminationReasonPreset(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                      required
                    >
                      <option value="RENUNCIA">Renuncia</option>
                      <option value="FIN_CONTRATO">Fin de contrato</option>
                      <option value="MUTUO">Mutuo acuerdo</option>
                      <option value="DESPIDO">Despido</option>
                      <option value="OTRO">Otro</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-900">Datos remunerativos</div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Sueldo básico mensual</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{currencySymbol}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={salaryBase}
                        onChange={(e) => setSalaryBase(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pl-10 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                        required
                      />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Usado para vacaciones y gratificación; y para CTS vía remuneración computable.</div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={hasFamilyAllowance}
                        onChange={(e) => setHasFamilyAllowance(e.target.checked)}
                        className="rounded border-slate-300 text-brand focus:ring-brand"
                      />
                      Asignación familiar
                    </label>
                    <div className="mt-3">
                      <label className="block text-xs font-semibold text-slate-500">Monto</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{currencySymbol}</span>
                        <input
                          type="number"
                          step="0.01"
                          value={familyAllowanceAmount}
                          onChange={(e) => setFamilyAllowanceAmount(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pl-10 text-sm outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all disabled:opacity-60"
                          disabled={!hasFamilyAllowance}
                        />
                      </div>
                      <div className="mt-1 text-xs text-slate-500">Configurable. Ejemplo común: 113.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Pensión (descuento)</div>
                    <div className="mt-1 text-xs text-slate-500">Se aplica solo a vacaciones truncas.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPensionRates((v) => !v)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {showPensionRates ? 'Ocultar tasas' : 'Editar tasas'}
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="pensionType"
                      checked={pensionType === 'AFP'}
                      onChange={() => {
                        setPensionType('AFP');
                        resetPensionDefaults('AFP');
                      }}
                      className="rounded border-slate-300 text-brand focus:ring-brand"
                    />
                    AFP
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="pensionType"
                      checked={pensionType === 'ONP'}
                      onChange={() => {
                        setPensionType('ONP');
                        resetPensionDefaults('ONP');
                      }}
                      className="rounded border-slate-300 text-brand focus:ring-brand"
                    />
                    ONP
                  </label>
                </div>

                {!showPensionRates && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {pensionType === 'AFP' ? `AFP: Fondo ${afpFundPct}% + Comisión ${afpCommissionPct}% + Seguro ${afpInsurancePct}%` : `ONP: ${onpRatePct}%`}
                  </div>
                )}

                {showPensionRates && (
                  <>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => resetPensionDefaults(pensionType)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Usar tasas típicas
                      </button>
                    </div>
                    {pensionType === 'AFP' ? (
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500">% Fondo</label>
                          <input value={afpFundPct} onChange={(e) => setAfpFundPct(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500">% Comisión</label>
                          <input value={afpCommissionPct} onChange={(e) => setAfpCommissionPct(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500">% Seguro</label>
                          <input value={afpInsurancePct} onChange={(e) => setAfpInsurancePct(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all" />
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 max-w-xs">
                        <label className="block text-xs font-semibold text-slate-500">% ONP</label>
                        <input value={onpRatePct} onChange={(e) => setOnpRatePct(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all" />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Opciones avanzadas</div>
                    <div className="mt-1 text-xs text-slate-500">Normalmente no necesitas cambiar esto.</div>
                  </div>
                  <span className="text-sm font-semibold text-slate-600">{showAdvanced ? '−' : '+'}</span>
                </button>

                {showAdvanced && (
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={resetSystemDefaults} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        Restablecer por defecto
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500">% Bonificación extraordinaria</label>
                        <input value={bonusRatePct} onChange={(e) => setBonusRatePct(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500">Días por mes</label>
                        <input value={daysPerMonth} onChange={(e) => setDaysPerMonth(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500">Días por año</label>
                        <input value={daysPerYear} onChange={(e) => setDaysPerYear(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500">CTS divisor</label>
                        <input value={ctsDivisor} onChange={(e) => setCtsDivisor(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500">Gratificación divisor</label>
                        <input value={gratDivisor} onChange={(e) => setGratDivisor(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all" />
                      </div>
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
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Total a pagar</div>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">{fmt(result.total_pagar)}</div>
              </div>
              <div className="text-xs text-slate-500">
                Tiempo de servicio (360): {result?.service_time?.years}a {result?.service_time?.months}m {result?.service_time?.days}d
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">CTS</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{fmt(benefitByCode.get('CTS')?.amount)}</div>
                <div className="mt-2 text-xs text-slate-500">{result?.cts?.months}m {result?.cts?.days}d</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Vacaciones (neto)</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{fmt(benefitByCode.get('VACACIONES_NETO')?.amount)}</div>
                <div className="mt-2 text-xs text-slate-500">Descuento: {fmt(deductionsTotal)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Gratificación</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{fmt(benefitByCode.get('GRATIFICACION')?.amount)}</div>
                <div className="mt-2 text-xs text-slate-500">{result?.gratificacion_trunca?.months}m {result?.gratificacion_trunca?.days}d</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Bonificación</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{fmt(benefitByCode.get('BONIFICACION_9')?.amount)}</div>
                <div className="mt-2 text-xs text-slate-500">Sin descuentos</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">Ver detalle de cálculo</div>
                  <div className="mt-1 text-xs text-slate-500">Remuneración computable, periodos usados y descuentos.</div>
                </div>
                <span className="text-sm font-semibold text-slate-600">{showDetails ? '−' : '+'}</span>
              </button>

              {showDetails && (
                <div className="border-t border-slate-200 p-4 space-y-6">
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="text-sm font-semibold text-slate-900">Remuneración computable (para CTS)</div>
                      <div className="mt-3 space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-slate-600">Base</span><span className="font-semibold text-slate-900">{fmt(result?.remuneracion_computable?.base)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600">Prom. gratificación (1/{result?.inputs?.config?.grat_divisor || 6})</span><span className="font-semibold text-slate-900">{fmt(result?.remuneracion_computable?.grat_avg)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600">Bonificación ({Number((result?.remuneracion_computable?.bonus_rate || 0) * 100).toFixed(2)}%)</span><span className="font-semibold text-slate-900">{fmt(result?.remuneracion_computable?.bonus)}</span></div>
                        <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-semibold text-slate-700">Total</span><span className="font-extrabold text-slate-900">{fmt(result?.remuneracion_computable?.total)}</span></div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="text-sm font-semibold text-slate-900">Periodos usados</div>
                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        <div>
                          <div className="text-xs font-semibold text-slate-500">CTS</div>
                          <div>Periodo: {result?.cts?.period_start} → {result?.cts?.period_end}</div>
                          <div>Cálculo desde: {result?.cts?.calc_from} ({result?.cts?.months}m {result?.cts?.days}d)</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-500">Gratificación</div>
                          <div>Periodo: {result?.gratificacion_trunca?.period_start} → {result?.gratificacion_trunca?.period_end}</div>
                          <div>Cálculo desde: {result?.gratificacion_trunca?.calc_from} ({result?.gratificacion_trunca?.months}m {result?.gratificacion_trunca?.days}d)</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-500">Vacaciones</div>
                          <div>Devengo desde: {result?.vacaciones_truncas?.accrual_start} ({result?.vacaciones_truncas?.months}m {result?.vacaciones_truncas?.days}d)</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">Beneficios</div>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                          {benefits.map((it, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-2 text-slate-700">{it.name}</td>
                              <td className="px-4 py-2 text-right font-semibold text-slate-900">{fmt(it.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">Descuentos</div>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                          {deductions.length === 0 ? (
                            <tr>
                              <td className="px-4 py-3 text-slate-500">Sin descuentos</td>
                            </tr>
                          ) : (
                            deductions.map((it, idx) => (
                              <tr key={idx}>
                                <td className="px-4 py-2 text-slate-700">{it.name}</td>
                                <td className="px-4 py-2 text-right font-semibold text-slate-900">{fmt(it.amount)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                      <div className="px-4 py-2 text-xs text-slate-500">Aplican solo a vacaciones truncas.</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
