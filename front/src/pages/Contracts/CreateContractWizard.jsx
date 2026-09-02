import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';

export default function CreateContractWizard({ apiUrl, token, companyId }) {
    const navigate = useNavigate();
    const toast = useToast();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [countries, setCountries] = useState([]);

    // Form State
    const [formData, setFormData] = useState({
        category: 'contractor', // 'contractor' | 'eor'
        type: 'fixed',
        title: '',
        scope_of_work: '',
        start_date: '',
        end_date: '',
        currency_id: 1, // Default USD
        rate: '',
        payment_frequency: 'monthly',
        notice_period: 0,
        special_clause: '',
        country: '', // For EOR
        freelancer_id: null, // TODO: Implement freelancer selection
        template_id: ''
    });

    const handlePreviewPdf = async (tplId) => {
        try {
            const res = await fetch(`${apiUrl}/api/global-contract-templates/${tplId}?action=pdf`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!res.ok) throw new Error('Error generando PDF');
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (e) {
            console.error(e);
            toast.error('Error al visualizar PDF');
        }
    };

    const api = useMemo(() => {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        return {
            get: async (endpoint) => {
                const res = await fetch(`${apiUrl}${endpoint}`, { headers });
                if (!res.ok) {
                    throw new Error('Error fetching data');
                }
                return res.json();
            },
            post: async (endpoint, body) => {
                const res = await fetch(`${apiUrl}${endpoint}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                });
                if (!res.ok) {
                    throw new Error('Error posting data');
                }
                return res.json();
            }
        };
    }, [apiUrl, token]);

    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const res = await api.get('/api/global-contract-templates?status=active');
                setTemplates(res.data || []);
            } catch (e) {
                console.error('Error loading templates', e);
            }
        };
        fetchTemplates();
    }, [api]);

    useEffect(() => {
        const fetchCountries = async () => {
            try {
                const res = await api.get('/api/countries?per_page=200');
                if (Array.isArray(res)) {
                    setCountries(res);
                } else if (Array.isArray(res.data)) {
                    setCountries(res.data);
                } else {
                    setCountries([]);
                }
            } catch (e) {
                console.error('Error loading countries', e);
                setCountries([]);
            }
        };
        fetchCountries();
    }, [api]);

    const handleSubmit = async () => {
        setLoading(true);
        try {
            await api.post(`/api/tenants/${companyId}/contracts`, formData);
            toast.success('Contrato creado exitosamente');
            navigate('/contracts'); // Assuming this route exists or we go to dashboard
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    const nextStep = () => {
        // If EOR selected in Step 1, skip Contractor Type selection (Step 2)
        if (step === 1 && formData.category === 'eor') {
            setFormData(prev => ({ ...prev, type: 'eor_employee' }));
            setStep(3);
            return;
        }
        setStep(s => s + 1);
    };
    
    const prevStep = () => {
        // If coming back from Step 3 and is EOR, go back to Step 1
        if (step === 3 && formData.category === 'eor') {
            setStep(1);
            return;
        }
        setStep(s => s - 1);
    };

    const findCountryByIso2 = (iso2) => {
        if (!iso2) return null;
        if (!Array.isArray(countries) || countries.length === 0) return null;
        const value = String(iso2).toUpperCase();
        return countries.find(c => String(c.iso2).toUpperCase() === value) || null;
    };

    const getCountryName = (iso2) => {
        if (!iso2) return '—';
        const c = findCountryByIso2(iso2);
        return c ? c.name : iso2;
    };

    const Step1_Category = () => (
        <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900">¿A quién deseas contratar?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div 
                    onClick={() => setFormData({...formData, category: 'contractor'})}
                    className={`cursor-pointer p-8 rounded-xl border-2 transition-all ${
                        formData.category === 'contractor' 
                        ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' 
                        : 'border-slate-200 hover:border-blue-300'
                    }`}
                >
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 text-blue-600">
                        <i className="bi bi-person-workspace text-2xl"></i>
                    </div>
                    <h3 className="font-bold text-lg text-slate-900">Contractor</h3>
                    <p className="text-sm text-slate-500 mt-2">
                        Trabajadores independientes o freelancers. Tú pagas por servicios, ellos manejan sus impuestos.
                    </p>
                    <ul className="mt-4 space-y-2 text-sm text-slate-600">
                        <li className="flex items-center gap-2"><i className="bi bi-check-circle-fill text-emerald-500"></i> Rápido y flexible</li>
                        <li className="flex items-center gap-2"><i className="bi bi-check-circle-fill text-emerald-500"></i> Facturas automáticas</li>
                    </ul>
                </div>

                <div 
                    onClick={() => setFormData({...formData, category: 'eor', type: 'eor_employee'})}
                    className={`cursor-pointer p-8 rounded-xl border-2 transition-all ${
                        formData.category === 'eor' 
                        ? 'border-purple-600 bg-purple-50 ring-2 ring-purple-200' 
                        : 'border-slate-200 hover:border-purple-300'
                    }`}
                >
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4 text-purple-600">
                        <i className="bi bi-building-fill-check text-2xl"></i>
                    </div>
                    <h3 className="font-bold text-lg text-slate-900">Empleado EOR</h3>
                    <p className="text-sm text-slate-500 mt-2">
                        Contrata empleados a tiempo completo en +150 países sin abrir entidad legal. Spectra actúa como empleador legal.
                    </p>
                    <ul className="mt-4 space-y-2 text-sm text-slate-600">
                        <li className="flex items-center gap-2"><i className="bi bi-check-circle-fill text-emerald-500"></i> Cumplimiento local total</li>
                        <li className="flex items-center gap-2"><i className="bi bi-check-circle-fill text-emerald-500"></i> Beneficios y seguros</li>
                    </ul>
                </div>
            </div>
        </div>
    );

    const Step2_ContractorType = () => (
        <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900">Tipo de Contrato (Contractor)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    { id: 'fixed', label: 'Fixed Rate', desc: 'Pago fijo por periodo (ej. Mensual)' },
                    { id: 'hourly', label: 'Pay As You Go', desc: 'Pago por horas trabajadas' },
                    { id: 'milestone', label: 'Milestones', desc: 'Pago por objetivos cumplidos' }
                ].map(type => (
                    <div 
                        key={type.id}
                        onClick={() => setFormData({...formData, type: type.id})}
                        className={`cursor-pointer p-6 rounded-xl border-2 transition-all ${
                            formData.type === type.id 
                            ? 'border-blue-600 bg-blue-50' 
                            : 'border-slate-200 hover:border-blue-300'
                        }`}
                    >
                        <h3 className="font-bold text-slate-900">{type.label}</h3>
                        <p className="text-sm text-slate-500 mt-2">{type.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    );

    const Step3_General = () => (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">
                {formData.category === 'eor' ? 'Detalles del Empleo (EOR)' : 'Detalles del Contrato'}
            </h2>
            
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Plantilla Legal (Opcional)</label>
                <div className="flex gap-2">
                    {(() => {
                        const countryObj = formData.country ? findCountryByIso2(formData.country) : null;
                        const countryId = countryObj ? String(countryObj.id) : null;
                        const filteredTemplates = templates.filter(t => {
                            if (t.type !== formData.type) return false;
                            if (!countryId) return true;
                            return String(t.country_id) === countryId;
                        });
                        return (
                    <select
                        className="w-full rounded-lg border-slate-300"
                        value={formData.template_id}
                        onChange={e => {
                            const tplId = e.target.value;
                            const tpl = templates.find(t => t.id === tplId);
                            setFormData({
                                ...formData, 
                                template_id: tplId,
                                title: tpl ? (tpl.title || formData.title) : formData.title
                            });
                        }}
                    >
                        <option value="">-- Sin Plantilla (Generar PDF estándar) --</option>
                        {filteredTemplates.map(t => {
                            const country = countries.find(c => String(c.id) === String(t.country_id));
                            const countryIso = country ? String(country.iso2 || '').toUpperCase() : '';
                            const lang = t.language_code ? String(t.language_code).toUpperCase() : '';
                            let suffix = '';
                            if (countryIso && lang) {
                                suffix = ` (${countryIso} · ${lang})`;
                            } else if (countryIso || lang) {
                                suffix = ` (${countryIso || lang})`;
                            }
                            return (
                                <option key={t.id} value={t.id}>
                                    {t.title}
                                    {suffix}
                                </option>
                            );
                        })}
                    </select>
                        );
                    })()}
                    {formData.template_id && (
                        <button
                            type="button"
                            onClick={() => handlePreviewPdf(formData.template_id)}
                            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600 hover:bg-slate-50 hover:text-red-600"
                            title="Ver PDF"
                        >
                            <i className="bi bi-file-pdf text-lg" />
                        </button>
                    )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                    Selecciona una plantilla legal certificada para el país del contratista.
                </p>
            </div>

            {formData.category === 'eor' && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">País de Residencia del Empleado</label>
                    <select 
                        className="w-full rounded-lg border-slate-300"
                        value={formData.country}
                        onChange={e => setFormData({...formData, country: e.target.value})}
                    >
                        <option value="">Selecciona un país...</option>
                        {countries.map(c => (
                            <option key={c.id} value={c.iso2}>{c.name}</option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Spectra verificará los requisitos legales de este país.</p>
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    {formData.category === 'eor' ? 'Cargo / Job Title' : 'Nombre del Contrato / Puesto'}
                </label>
                <input 
                    type="text" 
                    className="w-full rounded-lg border-slate-300"
                    placeholder="ej. Senior Frontend Developer"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Alcance del Trabajo (Scope)</label>
                <textarea 
                    className="w-full rounded-lg border-slate-300"
                    rows={4}
                    placeholder="Describe las responsabilidades..."
                    value={formData.scope_of_work}
                    onChange={e => setFormData({...formData, scope_of_work: e.target.value})}
                />
            </div>
        </div>
    );

    const Step4_Payment = () => (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Detalles de Pago</h2>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                    <select 
                        className="w-full rounded-lg border-slate-300"
                        value={formData.currency_id}
                        onChange={e => setFormData({...formData, currency_id: Number(e.target.value)})}
                    >
                        <option value={1}>USD - Dólar Estadounidense</option>
                        <option value={2}>EUR - Euro</option>
                        <option value={3}>GBP - Libra Esterlina</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        {formData.type === 'hourly' ? 'Tarifa por Hora' : 'Tarifa Mensual/Total'}
                    </label>
                    <input 
                        type="number" 
                        className="w-full rounded-lg border-slate-300"
                        placeholder="0.00"
                        value={formData.rate}
                        onChange={e => setFormData({...formData, rate: e.target.value})}
                    />
                </div>
            </div>
            {formData.type === 'fixed' && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Frecuencia de Pago</label>
                    <select 
                        className="w-full rounded-lg border-slate-300"
                        value={formData.payment_frequency}
                        onChange={e => setFormData({...formData, payment_frequency: e.target.value})}
                    >
                        <option value="monthly">Mensual</option>
                        <option value="biweekly">Quincenal</option>
                        <option value="weekly">Semanal</option>
                    </select>
                </div>
            )}
        </div>
    );

    const Step5_Dates = () => (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Fechas y Cláusulas</h2>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Inicio</label>
                    <input 
                        type="date" 
                        className="w-full rounded-lg border-slate-300"
                        value={formData.start_date}
                        onChange={e => setFormData({...formData, start_date: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Fin (Opcional)</label>
                    <input 
                        type="date" 
                        className="w-full rounded-lg border-slate-300"
                        value={formData.end_date}
                        onChange={e => setFormData({...formData, end_date: e.target.value})}
                    />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Periodo de Aviso (Días)</label>
                <input 
                    type="number" 
                    className="w-full rounded-lg border-slate-300"
                    placeholder="0"
                    value={formData.notice_period}
                    onChange={e => setFormData({...formData, notice_period: e.target.value})}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cláusulas Especiales</label>
                <textarea 
                    className="w-full rounded-lg border-slate-300"
                    rows={3}
                    placeholder="Cualquier condición adicional..."
                    value={formData.special_clause}
                    onChange={e => setFormData({...formData, special_clause: e.target.value})}
                />
            </div>
        </div>
    );

    const Step6_Review = () => (
        <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900">Revisar Contrato</h2>
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <span className="block text-slate-500">Categoría</span>
                        <span className="font-medium capitalize">{formData.category.toUpperCase()}</span>
                    </div>
                    <div>
                        <span className="block text-slate-500">Tipo</span>
                        <span className="font-medium capitalize">{formData.type.replace('_', ' ')}</span>
                    </div>
                    <div>
                        <span className="block text-slate-500">Título</span>
                        <span className="font-medium">{formData.title}</span>
                    </div>
                    <div>
                        <span className="block text-slate-500">Tarifa</span>
                        <span className="font-medium">{formData.rate} (Moneda ID: {formData.currency_id})</span>
                    </div>
                    <div>
                        <span className="block text-slate-500">Inicio</span>
                        <span className="font-medium">{formData.start_date}</span>
                    </div>
                    {formData.country && (
                        <div>
                            <span className="block text-slate-500">País</span>
                            <span className="font-medium">{getCountryName(formData.country)}</span>
                        </div>
                    )}
                </div>
                <div className="pt-4 border-t border-slate-200">
                    <span className="block text-slate-500 mb-1">Alcance</span>
                    <p className="text-slate-700 bg-white p-3 rounded border border-slate-200">{formData.scope_of_work || 'Sin definir'}</p>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                {/* Progress Bar */}
                <div className="mb-8">
                    <div className="flex justify-between text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">
                        <span>Categoría</span>
                        <span>Tipo</span>
                        <span>Detalles</span>
                        <span>Pagos</span>
                        <span>Fechas</span>
                        <span>Revisar</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden flex">
                        {[1,2,3,4,5,6].map(i => (
                            <div key={i} className={`flex-1 transition-colors ${i <= step ? 'bg-blue-600' : 'bg-transparent'}`} />
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                    <div className="p-8">
                        {step === 1 && <Step1_Category />}
                        {step === 2 && <Step2_ContractorType />}
                        {step === 3 && <Step3_General />}
                        {step === 4 && <Step4_Payment />}
                        {step === 5 && <Step5_Dates />}
                        {step === 6 && <Step6_Review />}
                    </div>
                    
                    <div className="bg-slate-50 px-8 py-4 flex justify-between items-center border-t border-slate-200">
                        <button 
                            onClick={prevStep}
                            disabled={step === 1}
                            className={`px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-200 transition-colors ${step === 1 ? 'opacity-0 pointer-events-none' : ''}`}
                        >
                            Atrás
                        </button>
                        
                        {step < 6 ? (
                            <button 
                                onClick={nextStep}
                                disabled={step === 3 && !formData.title} // Basic validation example
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-colors"
                            >
                                Siguiente
                            </button>
                        ) : (
                            <button 
                                onClick={handleSubmit}
                                disabled={loading}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
                            >
                                {loading ? 'Creando...' : 'Crear Contrato'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
