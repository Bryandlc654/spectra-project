import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { PLATFORM_ROLES } from '../../../lib/platformRoles';
import { useToast } from '../../../components/ToastProvider';

export default function TenantKYBTab({ companyId, api }) {
  const { user } = useAuth();
  const isSupport = user?.platform_role === PLATFORM_ROLES.SUPPORT;
  const toast = useToast();
  const safeApi = useMemo(() => api, [api]);

  const [kyb, setKyb] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selectedType, setSelectedType] = useState('incorporation');

  const docTypes = {
    incorporation: 'Certificado de Constitución',
    tax_id: 'Identificación Fiscal (Tax ID)',
    proof_of_address: 'Comprobante de Domicilio',
    identity_proof: 'Identificación del Representante',
    other: 'Otro Documento'
  };

  useEffect(() => {
    if (!companyId || !safeApi) return;
    loadKyb();
  }, [companyId, safeApi]);

  const loadKyb = async () => {
    setLoading(true);
    try {
      const res = await safeApi.get(`/api/tenants/${companyId}/kyb`);
      // Expecting { request: {...}, documents: [...] }
      if (res) {
        setKyb(res.request || null);
        setDocuments(res.documents || []);
      }
    } catch (e) {
      console.error(e);
      toast.error('Error cargando información de KYB');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Reset input
    e.target.value = '';

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', selectedType);

    setUploading(true);
    try {
      // Content-Type header is usually handled automatically by fetch/axios when using FormData
      // but if api wrapper needs specific handling, we assume it does it or we might need to pass headers.
      // Usually passing FormData is enough for axios.
      await safeApi.post(`/api/tenants/${companyId}/kyb/documents`, formData); 
      toast.success('Documento subido exitosamente');
      loadKyb();
    } catch (e) {
      console.error(e);
      toast.error('Error al subir documento');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitApplication = async () => {
    if (!confirm('¿Estás seguro de enviar la solicitud para revisión? No podrás subir más documentos.')) return;

    setSubmitting(true);
    try {
      await safeApi.post(`/api/tenants/${companyId}/kyb/submit`);
      toast.success('Solicitud enviada a revisión');
      loadKyb();
    } catch (e) {
      console.error(e);
      toast.error('Error al enviar solicitud');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">Aprobado</span>;
      case 'pending':
      case 'pending_review':
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">En Revisión</span>;
      case 'rejected':
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">Rechazado</span>;
      default:
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">Borrador</span>;
    }
  };

  if (loading && !kyb) {
    return <div className="p-8 text-center text-slate-500">Cargando información KYB...</div>;
  }

  const isSubmitted = kyb?.status === 'pending' || kyb?.status === 'pending_review' || kyb?.status === 'approved' || kyb?.status === 'rejected';
  const isApproved = kyb?.status === 'approved';

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <i className="bi bi-shield-check text-2xl" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Verificación de Negocio (KYB)</h2>
              <p className="text-sm text-slate-500">
                Sube los documentos requeridos para verificar la identidad de la empresa.
              </p>
            </div>
          </div>
          <div>
            {getStatusBadge(kyb?.status || 'draft')}
          </div>
        </div>

        {kyb?.submitted_at && (
          <div className="text-sm text-slate-500 mb-4">
            Enviado el: {new Date(kyb.submitted_at).toLocaleDateString()}
          </div>
        )}

        {/* Submit Action */}
        {!isSubmitted && documents.length > 0 && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg flex items-center justify-between">
            <p className="text-sm text-slate-600">
              ¿Has subido todos los documentos necesarios?
            </p>
            <button
              onClick={handleSubmitApplication}
              disabled={submitting}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Enviar Solicitud'}
            </button>
          </div>
        )}
        
        {!isSubmitted && documents.length === 0 && (
          <div className="mt-4 p-4 bg-yellow-50 text-yellow-800 rounded-lg text-sm">
            Sube al menos un documento para poder enviar la solicitud.
          </div>
        )}
      </div>

      {/* Documents Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-md font-semibold text-slate-800 mb-4">Documentos</h3>
        
        {documents.length === 0 ? (
          <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
            <i className="bi bi-file-earmark-text text-3xl mb-2 block" />
            <p>No hay documentos subidos</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre del Archivo</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Tamaño</th>
                  <th className="px-4 py-3 font-medium">Subido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700 font-medium">
                      <div className="flex items-center gap-2">
                        <i className="bi bi-file-earmark text-slate-400" />
                        {doc.file_name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {docTypes[doc.type] || doc.type || 'Otro'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{(doc.size_bytes / 1024).toFixed(1)} KB</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Upload Area */}
        {!isSubmitted && (
          <div className="mt-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tipo de Documento
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full rounded-lg border-slate-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                {Object.entries(docTypes).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <label className="block w-full cursor-pointer">
              <input 
                type="file" 
                className="hidden" 
                onChange={handleUpload}
                disabled={uploading}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              />
              <div className={`
                border-2 border-dashed rounded-xl p-8 text-center transition-colors
                ${uploading ? 'bg-slate-50 border-slate-300' : 'border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300'}
              `}>
                {uploading ? (
                  <div className="text-slate-500">
                    <div className="animate-spin inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full mb-2" />
                    <p>Subiendo archivo...</p>
                  </div>
                ) : (
                  <div className="text-indigo-600">
                    <i className="bi bi-cloud-upload text-3xl mb-2 block" />
                    <span className="font-medium">Haz clic para subir un documento</span>
                    <p className="text-sm text-slate-400 mt-1">PDF, Word (doc, docx), JPG, PNG (Max 10MB)</p>
                  </div>
                )}
              </div>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
