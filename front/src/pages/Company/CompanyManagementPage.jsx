import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ToastProvider';
import { createApi, resolveApiUrl } from '../../lib/api';
import TenantSettingsTab from '../Tenants/tabs/TenantSettingsTab';

export default function CompanyManagementPage() {
  const { user, token } = useAuth();
  const apiUrl = resolveApiUrl();
  const toast = useToast();
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  
  // Asignado a company_admin, usamos su company_id
  const companyId = user?.company_id;

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(null);
  const [kyb, setKyb] = useState(null);
  const [kybDocs, setKybDocs] = useState([]);
  const [contacts, setContacts] = useState([]);
  
  // Form states
  const [contactForm, setContactForm] = useState({ type: 'billing', name: '', email: '', phone: '', notes: '' });
  const [kybType, setKybType] = useState('incorporation');
  const [uploading, setUploading] = useState(false);
  const [submittingKyb, setSubmittingKyb] = useState(false);

  const kybDocTypes = {
    incorporation: 'Certificado de Constitución',
    tax_id: 'Identificación Fiscal (Tax ID)',
    proof_of_address: 'Comprobante de Domicilio',
    identity_proof: 'Identificación del Representante',
    other: 'Otro Documento'
  };

  useEffect(() => {
    if (companyId && token) {
      loadAllData();
    }
  }, [companyId, token]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      // 1. Company Data (includes subscription usually)
      const resCompany = await fetch(`${apiUrl}/api/tenants/${companyId}`, { headers });
      const dataCompany = await resCompany.json();
      
      // 2. KYB Data
      const resKyb = await fetch(`${apiUrl}/api/tenants/${companyId}/kyb`, { headers });
      const dataKyb = await resKyb.json();

      // 3. Contacts
      const resContacts = await fetch(`${apiUrl}/api/tenants/${companyId}/contacts`, { headers });
      const dataContacts = await resContacts.json();

      if (resCompany.ok) setCompany(dataCompany.data || dataCompany);
      if (resKyb.ok) {
        setKyb(dataKyb.request || null);
        setKybDocs(dataKyb.documents || []);
      }
      if (resContacts.ok) setContacts(dataContacts.data || dataContacts.contacts || []);

    } catch (error) {
      console.error(error);
      toast.error('Error cargando información de la empresa');
    } finally {
      setLoading(false);
    }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/tenants/${companyId}/contacts`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(contactForm)
      });
      if (!res.ok) throw new Error('Error agregando contacto');
      
      toast.success('Contacto agregado');
      setContactForm({ type: 'billing', name: '', email: '', phone: '', notes: '' });
      
      // Reload contacts
      const resContacts = await fetch(`${apiUrl}/api/tenants/${companyId}/contacts`, { headers: { Authorization: `Bearer ${token}` } });
      const dataContacts = await resContacts.json();
      setContacts(dataContacts.data || dataContacts.contacts || []);

    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleUploadKyb = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // reset

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', kybType);

    setUploading(true);
    try {
      const res = await fetch(`${apiUrl}/api/tenants/${companyId}/kyb/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (!res.ok) throw new Error('Error subiendo documento');

      toast.success('Documento subido');
      // Reload KYB
      const resKyb = await fetch(`${apiUrl}/api/tenants/${companyId}/kyb`, { headers: { Authorization: `Bearer ${token}` } });
      const dataKyb = await resKyb.json();
      setKybDocs(dataKyb.documents || []);

    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitKyb = async () => {
    if (!confirm('¿Enviar solicitud para revisión?')) return;
    setSubmittingKyb(true);
    try {
        const res = await fetch(`${apiUrl}/api/tenants/${companyId}/kyb/submit`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error enviando solicitud');
        
        toast.success('Solicitud enviada');
        // Reload KYB
        const resKyb = await fetch(`${apiUrl}/api/tenants/${companyId}/kyb`, { headers: { Authorization: `Bearer ${token}` } });
        const dataKyb = await resKyb.json();
        setKyb(dataKyb.request || null);
    } catch (err) {
        toast.error(err.message);
    } finally {
        setSubmittingKyb(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando gestión de empresa...</div>;
  if (!companyId) return <div className="p-8 text-center text-red-500">Error: No se encontró el ID de empresa asociado a su usuario.</div>;
  if (!company) return <div className="p-8 text-center text-red-500">No se encontró información de la empresa.</div>;

  const companyInfo = company.company || company;
  const kybStatus = kyb?.status || 'draft';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Gestión de la Empresa</h1>
        <p className="text-slate-500">Administración centralizada de datos, contactos y cumplimiento.</p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Column: General Data & Subscription */}
        <div className="space-y-8 lg:col-span-2">
            <TenantSettingsTab companyId={companyId} api={api} onUpdate={loadAllData} />
            
            {/* 1. Datos Generales */}
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Datos Generales</h2>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                    <div>
                        <dt className="text-xs font-medium text-slate-500 uppercase">Nombre Legal</dt>
                        <dd className="mt-1 text-sm font-semibold text-slate-900">{companyInfo.name}</dd>
                    </div>
                    <div>
                        <dt className="text-xs font-medium text-slate-500 uppercase">ID / Tax ID</dt>
                        <dd className="mt-1 text-sm font-semibold text-slate-900">{companyInfo.tax_id || '—'}</dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="text-xs font-medium text-slate-500 uppercase">Dirección</dt>
                        <dd className="mt-1 text-sm text-slate-900">{companyInfo.address || '—'}</dd>
                    </div>
                    <div>
                        <dt className="text-xs font-medium text-slate-500 uppercase">País</dt>
                        <dd className="mt-1 text-sm text-slate-900">
                          {typeof companyInfo.country === 'object' ? companyInfo.country?.name : companyInfo.country || '—'}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs font-medium text-slate-500 uppercase">Moneda Base</dt>
                        <dd className="mt-1 text-sm text-slate-900">
                          {typeof companyInfo.currency === 'object' ? companyInfo.currency?.code : companyInfo.currency || 'USD'}
                        </dd>
                    </div>
                </dl>
            </section>

            {/* 2. Contactos */}
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Contactos Principales</h2>
                
                {/* Add Form */}
                <form onSubmit={handleAddContact} className="mb-6 rounded-lg bg-slate-50 p-4 border border-slate-100">
                    <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Nuevo Contacto</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <select 
                            value={contactForm.type}
                            onChange={e => setContactForm({...contactForm, type: e.target.value})}
                            className="rounded-lg border-slate-300 text-sm"
                        >
                            <option value="billing">Billing</option>
                            <option value="operations">Operaciones</option>
                            <option value="legal">Legal</option>
                        </select>
                        <input 
                            placeholder="Nombre"
                            value={contactForm.name}
                            onChange={e => setContactForm({...contactForm, name: e.target.value})}
                            className="rounded-lg border-slate-300 text-sm"
                            required
                        />
                        <input 
                            placeholder="Email"
                            type="email"
                            value={contactForm.email}
                            onChange={e => setContactForm({...contactForm, email: e.target.value})}
                            className="rounded-lg border-slate-300 text-sm"
                        />
                        <input 
                            placeholder="Teléfono"
                            value={contactForm.phone}
                            onChange={e => setContactForm({...contactForm, phone: e.target.value})}
                            className="rounded-lg border-slate-300 text-sm"
                        />
                        <div className="sm:col-span-2">
                             <button type="submit" className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                                Agregar Contacto
                             </button>
                        </div>
                    </div>
                </form>

                {/* List */}
                <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Tipo</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Nombre</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Contacto</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {contacts.map((c, idx) => (
                                <tr key={c.id || idx}>
                                    <td className="px-4 py-3 text-sm font-medium text-slate-900 capitalize">{c.type}</td>
                                    <td className="px-4 py-3 text-sm text-slate-600">{c.name}</td>
                                    <td className="px-4 py-3 text-sm text-slate-500">
                                        <div className="flex flex-col">
                                            <span>{c.email}</span>
                                            <span className="text-xs text-slate-400">{c.phone}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {contacts.length === 0 && (
                                <tr>
                                    <td colSpan="3" className="px-4 py-4 text-center text-sm text-slate-500">No hay contactos registrados.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>

        {/* Right Column: KYB & Plan */}
        <div className="space-y-8">
            
            {/* 3. KYB / Verificación */}
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">Verificación KYB</h2>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        kybStatus === 'approved' ? 'bg-green-100 text-green-800' :
                        kybStatus === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                    }`}>
                        {kybStatus === 'approved' ? 'Verificado' : 
                         kybStatus === 'pending' || kybStatus === 'pending_review' ? 'En Revisión' : 
                         kybStatus === 'rejected' ? 'Rechazado' : 'Pendiente'}
                    </span>
                </div>
                
                <p className="mb-4 text-sm text-slate-500">
                    Carga la documentación legal para verificar tu empresa y desbloquear todas las funciones.
                </p>

                {kybStatus !== 'approved' && kybStatus !== 'pending' && kybStatus !== 'pending_review' && (
                    <div className="mb-6 space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-700">Tipo de Documento</label>
                            <select 
                                value={kybType} 
                                onChange={e => setKybType(e.target.value)}
                                className="w-full rounded-lg border-slate-300 text-sm"
                            >
                                {Object.entries(kybDocTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        
                        <label className="flex w-full cursor-pointer justify-center rounded-lg border-2 border-dashed border-slate-300 px-4 py-4 text-center hover:bg-slate-50">
                            <div className="space-y-1">
                                <i className="bi bi-cloud-upload text-xl text-slate-400" />
                                <div className="text-xs text-slate-500">
                                    {uploading ? 'Subiendo...' : 'Click para subir archivo'}
                                </div>
                            </div>
                            <input type="file" className="hidden" onChange={handleUploadKyb} disabled={uploading} />
                        </label>
                    </div>
                )}

                <div className="mb-4 space-y-2">
                    <h3 className="text-xs font-semibold uppercase text-slate-500">Documentos Cargados</h3>
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                        {kybDocs.map((doc, idx) => (
                            <li key={idx} className="flex items-center justify-between px-3 py-2">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <i className="bi bi-file-earmark-text text-slate-400" />
                                    <span className="truncate text-xs text-slate-600">{doc.file_name}</span>
                                </div>
                                <span className="text-[10px] text-slate-400">
                                    {new Date(doc.created_at).toLocaleDateString()}
                                </span>
                            </li>
                        ))}
                        {kybDocs.length === 0 && (
                            <li className="px-3 py-2 text-center text-xs text-slate-400">Sin documentos</li>
                        )}
                    </ul>
                </div>

                {kybDocs.length > 0 && kybStatus === 'draft' && (
                    <button 
                        onClick={handleSubmitKyb}
                        disabled={submittingKyb}
                        className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {submittingKyb ? 'Enviando...' : 'Enviar a Revisión'}
                    </button>
                )}
            </section>
        </div>
      </div>
    </div>
  );
}
