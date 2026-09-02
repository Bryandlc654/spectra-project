import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Shield, 
  FileText, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  XCircle, 
  ExternalLink, 
  AlertTriangle,
  Loader2
} from 'lucide-react';

const CompliancePage = ({ apiUrl, token, user }) => {
  const [requirements, setRequirements] = useState([]);
  const [userDocuments, setUserDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState({}); // Map of requirementId -> File
  const [uploading, setUploading] = useState(false);
  const isGlobalAdmin = ['super_admin', 'admin_global'].includes(user?.platform_role);

  // Mock user country if not available in user object, or use a selector for admins
  const userCountryId = user?.country_id || 1; 

  useEffect(() => {
    if (user?.id && user.id !== 'undefined') {
        fetchData();
    }
  }, [apiUrl, token, userCountryId, user?.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch requirements for the country
      const reqRes = await fetch(`${apiUrl}/api/compliance/requirements?country_id=${userCountryId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      let docData = [];
      // Ensure user.id is valid and not the string "undefined"
      if (user?.id && user.id !== 'undefined') {
          // Fetch user's uploaded documents
          const docRes = await fetch(`${apiUrl}/api/compliance/documents?user_id=${user.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (docRes.ok) {
            docData = await docRes.json();
          }
      }

      if (reqRes.ok) {
        const reqData = await reqRes.json();
        
        // Handle paginated response structure { data: [...], meta: ... }
        const requirementsList = Array.isArray(reqData) ? reqData : (reqData.data || []);
        setRequirements(requirementsList);

        // Handle documents response
        const documentsList = Array.isArray(docData) ? docData : (docData.data || []);
        setUserDocuments(documentsList);
      }
    } catch (error) {
      console.error("Error fetching compliance data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (reqId, file) => {
    setSelectedFiles(prev => ({ ...prev, [reqId]: file }));
  };

  const handleCancelFile = (reqId) => {
    setSelectedFiles(prev => {
        const newState = { ...prev };
        delete newState[reqId];
        return newState;
    });
  };

  const handleUpload = async (requirementId) => {
    const file = selectedFiles[requirementId];
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('requirement_id', requirementId);

    try {
      const res = await fetch(`${apiUrl}/api/compliance/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        handleCancelFile(requirementId);
        fetchData(); // Refresh list
      } else {
        alert('Failed to upload document');
      }
    } catch (error) {
      console.error(error);
      alert('Error uploading document');
    } finally {
      setUploading(false);
    }
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'verified': 
        return { 
          label: 'Verified', 
          icon: <CheckCircle className="w-5 h-5 text-emerald-500" />, 
          bg: 'bg-emerald-50', 
          border: 'border-emerald-200',
          text: 'text-emerald-700'
        };
      case 'rejected': 
        return { 
          label: 'Rejected', 
          icon: <XCircle className="w-5 h-5 text-red-500" />, 
          bg: 'bg-red-50', 
          border: 'border-red-200',
          text: 'text-red-700'
        };
      case 'pending': 
        return { 
          label: 'Pending Review', 
          icon: <Clock className="w-5 h-5 text-amber-500" />, 
          bg: 'bg-amber-50', 
          border: 'border-amber-200',
          text: 'text-amber-700'
        };
      default: 
        return { 
          label: 'Missing', 
          icon: <AlertCircle className="w-5 h-5 text-slate-400" />, 
          bg: 'bg-slate-50', 
          border: 'border-slate-200',
          text: 'text-slate-600'
        };
    }
  };

  // Calculate stats
  const stats = {
    total: requirements.length,
    verified: 0,
    pending: 0,
    rejected: 0,
    missing: 0
  };

  requirements.forEach(req => {
    const doc = userDocuments.find(d => d.requirement_id === req.id);
    const status = doc ? doc.status : 'missing';
    if (stats[status] !== undefined) stats[status]++;
    else stats.missing++;
  });

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
        <p>Loading compliance requirements...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-8 h-8 text-indigo-600" />
            Compliance & Requirements
          </h1>
          <p className="text-slate-500 mt-1">
            Manage your legal documents and ensure compliance with local regulations.
          </p>
        </div>
        <div className="flex gap-2">
          {['super_admin', 'admin', 'legal', 'support'].includes(user?.platform_role) && (
            <Link 
              to="/dashboard/compliance/admin" 
              className="inline-flex items-center px-4 py-2 bg-indigo-600 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Admin Review
            </Link>
          )}
          <Link 
            to="/dashboard/compliance/alerts" 
            className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <AlertTriangle className="w-4 h-4 mr-2 text-amber-500" />
            View Alerts
          </Link>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{stats.verified}</p>
            <p className="text-xs font-medium text-slate-500 uppercase">Verified</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{stats.pending}</p>
            <p className="text-xs font-medium text-slate-500 uppercase">Pending</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{stats.rejected}</p>
            <p className="text-xs font-medium text-slate-500 uppercase">Action Needed</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-lg">
            <FileText className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{stats.missing}</p>
            <p className="text-xs font-medium text-slate-500 uppercase">Missing</p>
          </div>
        </div>
      </div>

      {/* Requirements List */}
      <div className="space-y-4">
        {requirements.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200 border-dashed">
            <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900">No requirements found</h3>
            <p className="text-slate-500 mt-1">There are no compliance requirements configured for your region.</p>
          </div>
        ) : (
          requirements.map((req) => {
            const doc = userDocuments.find(d => d.requirement_id === req.id);
            const status = doc ? doc.status : 'missing';
            const statusInfo = getStatusInfo(status);
            const selectedFile = selectedFiles[req.id];

            return (
              <div 
                key={req.id} 
                className={`group bg-white rounded-xl border transition-all duration-200 hover:shadow-md ${statusInfo.border} ${status === 'missing' ? 'border-slate-200' : ''}`}
              >
                <div className="p-5 flex flex-col md:flex-row gap-6">
                  {/* Left: Icon & Info */}
                  <div className="flex-1 flex gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${statusInfo.bg}`}>
                      {statusInfo.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900">{req.document_type}</h3>
                        {req.is_mandatory && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-wide border border-slate-200">
                            Mandatory
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 leading-relaxed">{req.description}</p>
                      
                      {status === 'rejected' && doc.rejection_reason && (
                        <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-100 flex gap-2 items-start">
                          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-red-700">
                            <span className="font-medium">Reason for rejection:</span> {doc.rejection_reason}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-col items-end justify-center gap-3 min-w-[200px]">
                    {/* Status Badge */}
                    <div className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${statusInfo.bg} ${statusInfo.text}`}>
                      {status === 'verified' && <CheckCircle className="w-3.5 h-3.5" />}
                      {status === 'pending' && <Clock className="w-3.5 h-3.5" />}
                      {status === 'rejected' && <XCircle className="w-3.5 h-3.5" />}
                      {statusInfo.label}
                    </div>

                    {/* Action Buttons */}
                    {status === 'verified' ? (
                      <a 
                        href={`${apiUrl}${doc.file_path}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Document
                      </a>
                    ) : isGlobalAdmin ? (
                      <div className="flex flex-col items-end gap-2 min-w-[200px]">
                        {doc?.file_path ? (
                          <a 
                            href={`${apiUrl}${doc.file_path}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            View Document
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500">Sin documento cargado</span>
                        )}
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-wide border border-slate-200">
                          Solo verificación
                        </span>
                      </div>
                    ) : (
                      <div className="w-full">
                        {!selectedFile ? (
                          <label className="flex flex-col items-center justify-center w-full h-10 px-4 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 hover:border-indigo-400 transition-colors group/upload">
                            <div className="flex items-center gap-2 text-slate-500 group-hover/upload:text-indigo-600">
                              <Upload className="w-4 h-4" />
                              <span className="text-sm font-medium">Select Document</span>
                            </div>
                            <input 
                              type="file" 
                              className="hidden" 
                              onChange={(e) => handleFileSelect(req.id, e.target.files[0])}
                            />
                          </label>
                        ) : (
                          <div className="flex items-center gap-2 w-full">
                            <button
                              onClick={() => handleUpload(req.id)}
                              disabled={uploading}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                              {uploading ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4" />
                                  Confirm
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleCancelFile(req.id)}
                              disabled={uploading}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </div>
                        )}
                        {selectedFile && (
                          <p className="mt-2 text-xs text-center text-slate-500 truncate max-w-[200px]">
                            {selectedFile.name}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CompliancePage;
