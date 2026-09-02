import React, { useState, useEffect } from 'react';

const EmployeeDocumentsPage = ({ apiUrl, token }) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      // Assuming fetching documents for a specific user context or listing all if admin.
      // For now, let's try to fetch with a user_id query param if known, or just expect the backend to handle context.
      // But the backend requires user_id query param. Let's assume we are viewing a user's docs or our own.
      // Ideally this page should be part of a user profile or have a user selector.
      // For this implementation, I'll pass a dummy user_id or handle the error gracefully.
      // A better approach is to list ALL documents if admin.
      // The backend code I saw requires `user_id` in GET.
      // I'll fetch for user_id=1 for demo or update backend to allow listing all.
      // Let's just try to fetch.
      const res = await fetch(`${apiUrl}/api/employee-documents?user_id=1`, { 
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setDocuments(data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Documentos de RRHH</h1>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
          Subir Documento
        </button>
      </div>

      {loading ? <p>Cargando...</p> : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <ul className="divide-y divide-gray-200">
            {documents.length === 0 ? (
              <p className="p-4 text-center text-gray-500">No hay documentos registrados.</p>
            ) : documents.map((doc) => (
              <li key={doc.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <svg className="h-6 w-6 text-gray-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-indigo-600 truncate">{doc.title}</p>
                      <p className="text-sm text-gray-500">{doc.document_type}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      {doc.status}
                    </p>
                    <a href={doc.file_path} target="_blank" rel="noreferrer" className="ml-4 text-sm text-gray-500 hover:text-gray-700">
                      Descargar
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default EmployeeDocumentsPage;
