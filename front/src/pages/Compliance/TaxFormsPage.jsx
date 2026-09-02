import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../components/ToastProvider';

export default function TaxFormsPage({ apiUrl, token }) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [currentForm, setCurrentForm] = useState(null);
    const [view, setView] = useState('selector'); // selector, w9, w8ben

    const api = useMemo(() => {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        return {
            get: async (path) => {
                const res = await fetch(`${apiUrl}${path}`, { headers });
                if (!res.ok) throw new Error('Error fetching data');
                return res.json();
            },
            post: async (path, body) => {
                const res = await fetch(`${apiUrl}${path}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                });
                if (!res.ok) throw new Error('Error posting data');
                return res.json();
            }
        };
    }, [apiUrl, token]);

    useEffect(() => {
        loadForm();
    }, []);

    const loadForm = async () => {
        setLoading(true);
        try {
            const data = await api.get('/api/tax-forms/me');
            if (data) {
                setCurrentForm(data);
                setView('submitted');
            } else {
                setView('selector');
            }
        } catch (e) {
            // Ignore 404
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (type, data) => {
        setLoading(true);
        try {
            await api.post('/api/tax-forms', { type, data });
            toast.success('Formulario enviado exitosamente');
            loadForm();
        } catch (e) {
            toast.error('Error al enviar formulario');
            setLoading(false);
        }
    };

    if (loading && !currentForm) return <div className="p-8 text-center">Cargando información fiscal...</div>;

    if (view === 'submitted' && currentForm) {
        return (
            <div className="p-6 max-w-4xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-8 text-center">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Información Fiscal Completada</h2>
                    <p className="text-slate-500 mb-6">
                        Has enviado tu formulario <span className="font-bold text-slate-900">{currentForm.type.toUpperCase()}</span> exitosamente el {new Date(currentForm.created_at).toLocaleDateString()}.
                    </p>
                    <div className="flex justify-center gap-4">
                        <a 
                            href={`${apiUrl}/api/tax-forms/${currentForm.id}/download`} 
                            target="_blank"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <i className="bi bi-file-earmark-pdf"></i>
                            Descargar PDF
                        </a>
                        <button 
                            onClick={() => setView('selector')}
                            className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium"
                        >
                            Enviar nuevo formulario
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'w9') return <W9Form onSubmit={(data) => handleSubmit('w9', data)} onCancel={() => setView('selector')} />;
    if (view === 'w8ben') return <W8BenForm onSubmit={(data) => handleSubmit('w8ben', data)} onCancel={() => setView('selector')} />;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Información Fiscal</h1>
            <p className="text-slate-500 mb-8">Para cumplir con las regulaciones, necesitamos recolectar tu información fiscal.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div 
                    onClick={() => setView('w9')}
                    className="cursor-pointer group bg-white p-8 rounded-xl border-2 border-slate-200 hover:border-blue-500 transition-all hover:shadow-md"
                >
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
                        <span className="font-bold text-xl">US</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Soy una persona/entidad de EE.UU.</h3>
                    <p className="text-sm text-slate-500 mb-4">Formulario W-9</p>
                    <ul className="text-sm text-slate-600 space-y-2">
                        <li>• Ciudadanos de EE.UU.</li>
                        <li>• Residentes extranjeros de EE.UU.</li>
                        <li>• Entidades formadas en EE.UU.</li>
                    </ul>
                </div>

                <div 
                    onClick={() => setView('w8ben')}
                    className="cursor-pointer group bg-white p-8 rounded-xl border-2 border-slate-200 hover:border-blue-500 transition-all hover:shadow-md"
                >
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 mb-4 group-hover:scale-110 transition-transform">
                        <i className="bi bi-globe text-xl"></i>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">No soy una persona de EE.UU.</h3>
                    <p className="text-sm text-slate-500 mb-4">Formulario W-8BEN / W-8BEN-E</p>
                    <ul className="text-sm text-slate-600 space-y-2">
                        <li>• Contratistas internacionales</li>
                        <li>• Entidades extranjeras</li>
                        <li>• Beneficiarios efectivos extranjeros</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

const FormField = ({ label, name, value, onChange, type = "text", required = true, placeholder = "" }) => (
    <div>
        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">{label} {required && '*'}</label>
        <input
            type={type}
            name={name}
            value={value}
            onChange={onChange}
            required={required}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
        />
    </div>
);

const W9Form = ({ onSubmit, onCancel }) => {
    const [formData, setFormData] = useState({
        name: '', business_name: '', type: 'Individual', address: '', city: '', state: '', zip: '', ssn_ein: '', signature: ''
    });

    const handleChange = (e) => setFormData({...formData, [e.target.name]: e.target.value});

    return (
        <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-900">Formulario W-9</h2>
                <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-900">Cancelar</button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField label="Nombre (como aparece en declaración de impuestos)" name="name" value={formData.name} onChange={handleChange} />
                    <FormField label="Nombre del Negocio (si es diferente)" name="business_name" value={formData.business_name} onChange={handleChange} required={false} />
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Clasificación Fiscal federal *</label>
                    <select 
                        name="type" 
                        value={formData.type} 
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option>Individual/sole proprietor or single-member LLC</option>
                        <option>C Corporation</option>
                        <option>S Corporation</option>
                        <option>Partnership</option>
                        <option>Trust/estate</option>
                        <option>LLC</option>
                    </select>
                </div>

                <FormField label="Dirección (Calle, Apto, Suite)" name="address" value={formData.address} onChange={handleChange} />
                
                <div className="grid grid-cols-3 gap-4">
                    <FormField label="Ciudad" name="city" value={formData.city} onChange={handleChange} />
                    <FormField label="Estado" name="state" value={formData.state} onChange={handleChange} />
                    <FormField label="Código Postal" name="zip" value={formData.zip} onChange={handleChange} />
                </div>

                <FormField label="SSN o EIN (Número de Identificación Fiscal)" name="ssn_ein" value={formData.ssn_ein} onChange={handleChange} placeholder="XXX-XX-XXXX" />

                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 mt-6">
                    <h4 className="font-bold text-slate-900 mb-2">Certificación y Firma</h4>
                    <p className="text-xs text-slate-600 mb-4">
                        Bajo pena de perjurio, certifico que la información proporcionada es correcta.
                    </p>
                    <FormField label="Firma Electrónica (Escribe tu nombre completo)" name="signature" value={formData.signature} onChange={handleChange} placeholder="e.g. John Doe" />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={onCancel} className="px-6 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 font-medium">Cancelar</button>
                    <button type="submit" className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-bold shadow-lg shadow-blue-500/30">Firmar y Enviar W-9</button>
                </div>
            </form>
        </div>
    );
};

const W8BenForm = ({ onSubmit, onCancel }) => {
    const [formData, setFormData] = useState({
        name: '', country_citizenship: '', address: '', city: '', country: '', tax_id: '', birth_date: '', signature: ''
    });

    const handleChange = (e) => setFormData({...formData, [e.target.name]: e.target.value});

    return (
        <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-900">Formulario W-8BEN</h2>
                <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-900">Cancelar</button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField label="Nombre Completo" name="name" value={formData.name} onChange={handleChange} />
                    <FormField label="País de Ciudadanía" name="country_citizenship" value={formData.country_citizenship} onChange={handleChange} />
                </div>

                <FormField label="Dirección de Residencia Permanente" name="address" value={formData.address} onChange={handleChange} />
                
                <div className="grid grid-cols-2 gap-4">
                    <FormField label="Ciudad" name="city" value={formData.city} onChange={handleChange} />
                    <FormField label="País" name="country" value={formData.country} onChange={handleChange} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FormField label="Foreign Tax ID (Número Fiscal Extranjero)" name="tax_id" value={formData.tax_id} onChange={handleChange} required={false} />
                    <FormField label="Fecha de Nacimiento" name="birth_date" type="date" value={formData.birth_date} onChange={handleChange} />
                </div>

                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 mt-6">
                    <h4 className="font-bold text-slate-900 mb-2">Certificación y Firma</h4>
                    <p className="text-xs text-slate-600 mb-4">
                        Certifico que no soy una persona de EE.UU. y que soy el beneficiario efectivo de los ingresos.
                    </p>
                    <FormField label="Firma Electrónica (Escribe tu nombre completo)" name="signature" value={formData.signature} onChange={handleChange} placeholder="e.g. Juan Pérez" />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={onCancel} className="px-6 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 font-medium">Cancelar</button>
                    <button type="submit" className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-bold shadow-lg shadow-blue-500/30">Firmar y Enviar W-8BEN</button>
                </div>
            </form>
        </div>
    );
};
