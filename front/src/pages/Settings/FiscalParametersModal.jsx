import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import { apiFetch } from '../../lib/api';

export default function FiscalParametersModal({ country, onClose, apiUrl, token }) {
    const [params, setParams] = useState([]);
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [filterApplies, setFilterApplies] = useState('all');
    const [onlyActive, setOnlyActive] = useState(false);
    const [sortKey, setSortKey] = useState('code');
    const [sortDir, setSortDir] = useState('asc');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [sortActiveFirst, setSortActiveFirst] = useState(true);
    
    // Form state
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        percentage: 0,
        description: '',
        is_active: true,
        type: 'tax',
        calculation_base: 'gross_fees',
        payslip_trigger: 'on_payment',
        applies_to: 'any',
        valid_from: '',
        valid_to: ''
    });

    useEffect(() => {
        if (country) {
            loadParams();
            resetForm();
        }
    }, [country]);

    async function loadParams() {
        setLoading(true);
        try {
            const res = await apiFetch(apiUrl, `/api/countries/${country.id}/fiscal-parameters`, { token });
            setParams(res || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    function resetForm() {
        setEditingId(null);
        setFormData({ 
            name: '', 
            code: '', 
            percentage: 0, 
            description: '', 
            is_active: true,
            type: 'tax',
            calculation_base: 'gross_fees',
            payslip_trigger: 'on_payment',
            applies_to: 'any',
            valid_from: '',
            valid_to: ''
        });
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!country) return;

        const pct = Math.max(0, Math.min(100, parseFloat(formData.percentage || 0)));
        const payload = { ...formData, percentage: Number.isFinite(pct) ? pct : 0 };

        try {
            if (editingId) {
                await apiFetch(apiUrl, `/api/fiscal-parameters/${editingId}`, {
                    method: 'PUT',
                    body: payload,
                    token
                });
            } else {
                await apiFetch(apiUrl, `/api/countries/${country.id}/fiscal-parameters`, {
                    method: 'POST',
                    body: payload,
                    token
                });
            }
            resetForm();
            loadParams();
        } catch (err) {
            alert(err.message);
        }
    }

    async function handleDelete(id) {
        if (!confirm('¿Eliminar este parámetro?')) return;
        try {
            await apiFetch(apiUrl, `/api/fiscal-parameters/${id}`, { method: 'DELETE', token });
            loadParams();
        } catch (e) {
            alert(e.message);
        }
    }
    
    async function seedPeruDefaults() {
        if (!country || (country.iso2 !== 'PE' && country.id !== 'PE')) {
            alert('Este cargador estándar solo aplica para Perú (PE).');
            return;
        }
        const defs = [
            {
                name: 'ESSALUD 9%',
                code: 'ESSALUD_9',
                percentage: 9,
                description: 'Aporte del empleador a ESSALUD',
                is_active: true,
                type: 'contribution',
                calculation_base: 'payroll_gross',
                payslip_trigger: 'monthly',
                applies_to: 'employee'
            },
            {
                name: 'Retención 4ta categoría 8%',
                code: 'RET_4TA_8',
                percentage: 8,
                description: 'Retención sobre honorarios sin constancia de suspensión',
                is_active: true,
                type: 'withholding',
                calculation_base: 'gross_fees',
                payslip_trigger: 'on_payment',
                applies_to: 'contractor'
            },
            {
                name: 'ONP Aporte 13%',
                code: 'ONP_13',
                percentage: 13,
                description: 'Aporte del trabajador al Sistema Nacional de Pensiones',
                is_active: false,
                type: 'withholding',
                calculation_base: 'payroll_gross',
                payslip_trigger: 'monthly',
                applies_to: 'employee'
            },
            {
                name: 'AFP Seguro 1.35%',
                code: 'AFP_SEGURO_1_35',
                percentage: 1.35,
                description: 'Componente de seguro del SPP',
                is_active: false,
                type: 'withholding',
                calculation_base: 'payroll_gross',
                payslip_trigger: 'monthly',
                applies_to: 'employee'
            },
            {
                name: 'AFP Comisión Flujo 1.47%',
                code: 'AFP_COMISION_FLUJO_1_47',
                percentage: 1.47,
                description: 'Comisión bajo esquema de Flujo',
                is_active: false,
                type: 'withholding',
                calculation_base: 'payroll_gross',
                payslip_trigger: 'monthly',
                applies_to: 'employee'
            },
            {
                name: 'RMV Perú',
                code: 'PE_RMV',
                percentage: 1130,
                description: 'Remuneración Mínima Vital vigente',
                is_active: true,
                type: 'other',
                calculation_base: 'other',
                payslip_trigger: 'monthly',
                applies_to: 'any'
            }
        ];
        try {
            for (const d of defs) {
                await apiFetch(apiUrl, `/api/countries/${country.id}/fiscal-parameters`, {
                    method: 'POST',
                    body: d,
                    token
                });
            }
            await loadParams();
            alert('Parámetros estándar de Perú cargados. Revisa y activa según corresponda.');
        } catch (e) {
            alert(e.message || 'No se pudo cargar los parámetros estándar');
        }
    }
    
    function handleEdit(p) {
        setEditingId(p.id);
        setFormData({
            name: p.name,
            code: p.code,
            percentage: p.percentage,
            description: p.description || '',
            is_active: !!p.is_active,
            type: p.type || 'tax',
            calculation_base: p.calculation_base || 'gross_fees',
            payslip_trigger: p.payslip_trigger || 'on_payment',
            applies_to: p.applies_to || 'any',
            valid_from: p.valid_from || '',
            valid_to: p.valid_to || ''
        });
    }

    if (!country) return null;

    return (
        <Modal open={!!country} title={`Parámetros fiscales • ${country.name} (${country.iso2})`} onClose={onClose} size="5xl">
            <div className="space-y-6 overflow-y-auto">
                <form onSubmit={handleSubmit} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <h4 className="font-semibold text-sm text-slate-800">{editingId ? 'Editar parámetro' : 'Nuevo parámetro'}</h4>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setFormData(d => ({...d, applies_to: 'employee', calculation_base: 'payroll_gross'}))}
                                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold border ${formData.applies_to === 'employee' ? 'bg-brand text-white border-brand' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                                aria-pressed={formData.applies_to === 'employee'}
                            >
                                Dependiente
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData(d => ({...d, applies_to: 'contractor', calculation_base: 'gross_fees'}))}
                                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold border ${formData.applies_to === 'contractor' ? 'bg-brand text-white border-brand' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                                aria-pressed={formData.applies_to === 'contractor'}
                            >
                                Independiente
                            </button>
                            {(country?.iso2 === 'PE' || country?.id === 'PE') && (
                                <button type="button" onClick={seedPeruDefaults} className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100">Cargar estándar Perú</button>
                            )}
                            <button type="button" onClick={() => setShowAdvanced(v => !v)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                                {showAdvanced ? 'Ocultar opciones avanzadas' : 'Opciones avanzadas'}
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                            <label className="text-xs font-medium text-slate-500">Nombre</label>
                            <input 
                                className="w-full mt-1 rounded-lg border-slate-200 text-sm focus:border-brand focus:ring-brand/10 h-9" 
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                placeholder="Ej: IVA General"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500">Código</label>
                            <input 
                                className="w-full mt-1 rounded-lg border-slate-200 text-sm focus:border-brand focus:ring-brand/10 h-9" 
                                value={formData.code}
                                onChange={e => setFormData({...formData, code: e.target.value})}
                                placeholder="Ej: VAT_21"
                                required
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                         <div>
                            <label className="text-xs font-medium text-slate-500">Porcentaje %</label>
                            <div className="relative">
                                <input 
                                    type="number" step="0.01" min="0" max="100"
                                    className="w-full mt-1 rounded-lg border-slate-200 text-sm focus:border-brand focus:ring-brand/10 pr-9 h-9" 
                                    value={formData.percentage}
                                    onChange={e => setFormData({...formData, percentage: e.target.value})}
                                    placeholder="0.00"
                                    required
                                />
                                <span className="absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 text-slate-500 text-xs">%</span>
                            </div>
                        </div>
                         <div className="flex items-center">
                            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                <input 
                                    type="checkbox"
                                    checked={formData.is_active}
                                    onChange={e => setFormData({...formData, is_active: e.target.checked})}
                                    className="rounded border-slate-300 text-brand focus:ring-brand"
                                />
                                Activo
                            </label>
                        </div>
                    </div>
                    
                    {/* Campos simplificados: se ocultan tipo/base/aplica (se definen por botones y opciones avanzadas) */}

                    

                    {showAdvanced && (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div>
                                <label className="text-xs font-medium text-slate-500">Tipo</label>
                                <select
                                    className="w-full mt-1 rounded-lg border-slate-200 text-sm focus:border-brand focus:ring-brand/10 h-9"
                                    value={formData.type}
                                    onChange={e => setFormData({...formData, type: e.target.value})}
                                >
                                    <option value="tax">Impuesto</option>
                                    <option value="withholding">Retención</option>
                                    <option value="contribution">Contribución</option>
                                    <option value="earning">Ingreso</option>
                                    <option value="other">Otro</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500">Base Cálculo</label>
                                <select
                                    className="w-full mt-1 rounded-lg border-slate-200 text-sm focus:border-brand focus:ring-brand/10 h-9"
                                    value={formData.calculation_base}
                                    onChange={e => setFormData({...formData, calculation_base: e.target.value})}
                                >
                                    <option value="gross_fees">Honorarios Brutos</option>
                                    <option value="net_fees">Honorarios Netos</option>
                                    <option value="payroll_gross">Nómina Bruta</option>
                                    <option value="services_total">Total Servicios</option>
                                    <option value="other">Otro</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500">Descripción</label>
                                <input 
                                    className="w-full mt-1 rounded-lg border-slate-200 text-sm focus:border-brand focus:ring-brand/10 h-9" 
                                    value={formData.description}
                                    onChange={e => setFormData({...formData, description: e.target.value})}
                                    placeholder="Opcional"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500">Regla Emisión</label>
                                <select
                                    className="w-full mt-1 rounded-lg border-slate-200 text-sm focus:border-brand focus:ring-brand/10 h-9"
                                    value={formData.payslip_trigger}
                                    onChange={e => setFormData({...formData, payslip_trigger: e.target.value})}
                                >
                                    <option value="on_payment">Al Pagar</option>
                                    <option value="monthly">Mensual</option>
                                    <option value="manual">Manual</option>
                                    <option value="threshold">Por Monto Mínimo</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500">Vigencia desde</label>
                                <input 
                                    type="date"
                                    className="w-full mt-1 rounded-lg border-slate-200 text-sm focus:border-brand focus:ring-brand/10 h-9" 
                                    value={formData.valid_from}
                                    onChange={e => setFormData({...formData, valid_from: e.target.value})}
                                    placeholder=""
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500">Vigencia hasta</label>
                                <input 
                                    type="date"
                                    className="w-full mt-1 rounded-lg border-slate-200 text-sm focus:border-brand focus:ring-brand/10 h-9" 
                                    value={formData.valid_to}
                                    onChange={e => setFormData({...formData, valid_to: e.target.value})}
                                    placeholder=""
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        {editingId && (
                            <button type="button" onClick={resetForm} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200">Cancelar</button>
                        )}
                        <button type="submit" className="bg-brand text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand/90">
                            {editingId ? 'Actualizar' : 'Agregar'}
                        </button>
                    </div>
                </form>

                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                            <input
                                value={q}
                                onChange={e => setQ(e.target.value)}
                                placeholder="Buscar por código o nombre"
                                className="w-full rounded-lg border-slate-300 text-sm sm:w-64 h-9"
                            />
                            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="rounded-lg border-slate-300 text-sm sm:w-40 h-9">
                                <option value="all">Todos los tipos</option>
                                <option value="tax">Impuesto</option>
                                <option value="withholding">Retención</option>
                                <option value="contribution">Contribución</option>
                                <option value="earning">Ingreso</option>
                                <option value="other">Otro</option>
                            </select>
                            <select value={filterApplies} onChange={e => setFilterApplies(e.target.value)} className="rounded-lg border-slate-300 text-sm sm:w-44 h-9">
                                <option value="all">Todos</option>
                                <option value="employee">Dependiente</option>
                                <option value="contractor">Independiente</option>
                                <option value="any">Cualquiera</option>
                            </select>
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} className="rounded border-slate-300 text-brand focus:ring-brand h-4 w-4" />
                                Solo activos
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={sortActiveFirst} onChange={e => setSortActiveFirst(e.target.checked)} className="rounded border-slate-300 text-brand focus:ring-brand h-4 w-4" />
                                Activos primero
                            </label>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <select value={sortKey} onChange={e => setSortKey(e.target.value)} className="rounded-lg border-slate-300 text-sm h-9">
                                <option value="code">Ordenar por código</option>
                                <option value="name">Ordenar por nombre</option>
                                <option value="percentage">Ordenar por porcentaje</option>
                                <option value="type">Ordenar por tipo</option>
                                <option value="applies_to">Ordenar por aplica a</option>
                                <option value="is_active">Ordenar por estado</option>
                            </select>
                            <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                                {sortDir === 'asc' ? 'Ascendente' : 'Descendente'}
                            </button>
                            <div className="text-xs text-slate-600">
                                Mostrando {params.filter(p => {
                                    if (q && !(String(p.code).toLowerCase().includes(q.toLowerCase()) || String(p.name).toLowerCase().includes(q.toLowerCase()))) return false;
                                    if (filterType !== 'all' && p.type !== filterType) return false;
                                    if (filterApplies !== 'all' && (p.applies_to || 'any') !== filterApplies) return false;
                                    if (onlyActive && !p.is_active) return false;
                                    return true;
                                }).length} de {params.length}
                            </div>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white text-slate-600 font-medium border-b border-slate-200">
                                <tr>
                                    <th className="px-3 py-2 font-normal cursor-pointer" onClick={() => { setSortKey(k => k === 'code' ? k : 'code'); setSortDir(d => sortKey === 'code' ? (d === 'asc' ? 'desc' : 'asc') : 'asc'); }}>Código</th>
                                    <th className="px-3 py-2 font-normal cursor-pointer" onClick={() => { setSortKey(k => k === 'type' ? k : 'type'); setSortDir(d => sortKey === 'type' ? (d === 'asc' ? 'desc' : 'asc') : 'asc'); }}>Tipo</th>
                                    <th className="px-3 py-2 font-normal cursor-pointer" onClick={() => { setSortKey(k => k === 'applies_to' ? k : 'applies_to'); setSortDir(d => sortKey === 'applies_to' ? (d === 'asc' ? 'desc' : 'asc') : 'asc'); }}>Aplica a</th>
                                    <th className="px-3 py-2 font-normal cursor-pointer" onClick={() => { setSortKey(k => k === 'name' ? k : 'name'); setSortDir(d => sortKey === 'name' ? (d === 'asc' ? 'desc' : 'asc') : 'asc'); }}>Nombre</th>
                                    <th className="px-3 py-2 font-normal cursor-pointer" onClick={() => { setSortKey(k => k === 'percentage' ? k : 'percentage'); setSortDir(d => sortKey === 'percentage' ? (d === 'asc' ? 'desc' : 'asc') : 'asc'); }}>%.</th>
                                    <th className="px-3 py-2 font-normal cursor-pointer" onClick={() => { setSortKey(k => k === 'is_active' ? k : 'is_active'); setSortDir(d => sortKey === 'is_active' ? (d === 'asc' ? 'desc' : 'asc') : 'asc'); }}>Estado</th>
                                    <th className="px-3 py-2 font-normal"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {loading && <tr><td colSpan="7" className="p-4 text-center text-slate-500">Cargando...</td></tr>}
                                {!loading && params.length === 0 && (
                                    <tr><td colSpan="7" className="p-4 text-center text-slate-500">No hay parámetros definidos</td></tr>
                                )}
                                {!loading && params
                                  .filter(p => {
                                      if (q && !(String(p.code).toLowerCase().includes(q.toLowerCase()) || String(p.name).toLowerCase().includes(q.toLowerCase()))) return false;
                                      if (filterType !== 'all' && p.type !== filterType) return false;
                                      if (filterApplies !== 'all' && (p.applies_to || 'any') !== filterApplies) return false;
                                      if (onlyActive && !p.is_active) return false;
                                      return true;
                                  })
                                  .sort((a,b) => {
                                      if (sortActiveFirst) {
                                          const actComp = (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0);
                                          if (actComp !== 0) return actComp;
                                      }
                                      if (sortKey === 'percentage') {
                                          const pa = Number(a.percentage || 0);
                                          const pb = Number(b.percentage || 0);
                                          const cmp = pa - pb;
                                          return sortDir === 'asc' ? cmp : -cmp;
                                      }
                                      if (sortKey === 'is_active') {
                                          const ia = a.is_active ? 1 : 0;
                                          const ib = b.is_active ? 1 : 0;
                                          const cmp = ia - ib;
                                          return sortDir === 'asc' ? cmp : -cmp;
                                      }
                                      const ka = String(a[sortKey] || '').toLowerCase();
                                      const kb = String(b[sortKey] || '').toLowerCase();
                                      if (ka < kb) return sortDir === 'asc' ? -1 : 1;
                                      if (ka > kb) return sortDir === 'asc' ? 1 : -1;
                                      return 0;
                                  })
                                  .map(p => (
                                    <tr key={p.id} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 font-mono text-xs text-slate-600">{p.code}</td>
                                        <td className="px-3 py-2">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                                                p.type === 'tax' ? 'bg-amber-100 text-amber-800' :
                                                p.type === 'withholding' ? 'bg-blue-100 text-blue-800' :
                                                p.type === 'contribution' ? 'bg-purple-100 text-purple-800' :
                                                p.type === 'earning' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-800'
                                            }`}>
                                                {p.type === 'tax' ? 'Impuesto' : p.type === 'withholding' ? 'Retención' : p.type === 'contribution' ? 'Contribución' : p.type === 'earning' ? 'Ingreso' : 'Otro'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-xs text-slate-600">
                                            {p.applies_to === 'employee' ? 'Dependiente' : p.applies_to === 'contractor' ? 'Independiente' : 'Cualquiera'}
                                        </td>
                                        <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
                                        <td className="px-3 py-2 text-slate-700">{Number(p.percentage).toFixed(2)}%</td>
                                        <td className="px-3 py-2">
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await apiFetch(apiUrl, `/api/fiscal-parameters/${p.id}`, { method: 'PUT', body: { is_active: !p.is_active }, token });
                                                        loadParams();
                                                    } catch (e) {
                                                        alert(e.message);
                                                    }
                                                }}
                                                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                                                    p.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                                                }`}
                                            >
                                                {p.is_active ? 'Activo' : 'Inactivo'}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2 text-right space-x-2">
                                            <button onClick={() => handleEdit(p)} className="text-blue-600 hover:text-blue-800 font-medium text-xs">Editar</button>
                                            <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800 font-medium text-xs">Borrar</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
