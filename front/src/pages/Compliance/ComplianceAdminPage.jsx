import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Eye, 
  Filter, 
  Search, 
  FileText, 
  User, 
  Calendar,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useToast } from '../../components/ToastProvider';

const ComplianceAdminPage = ({ apiUrl, token }) => {
  const toast = useToast();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending'); // default to pending
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Modal State
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [page, filterStatus]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      let url = `${apiUrl}/api/compliance/documents?page=${page}&limit=50`;
      if (filterStatus !== 'all') {
        url += `&status=${filterStatus}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const json = await res.json();
        setDocuments(json.data || []);
        setTotalPages(json.meta?.pages || 1);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Failed to fetch documents', err);
        toast.error(err.message || 'Failed to load documents');
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast.error('Network error loading documents');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (docId, status, reason = null) => {
    setProcessing(true);
    try {
      const body = { status };
      if (reason) body.reason = reason;

      const res = await fetch(`${apiUrl}/api/compliance/documents/${docId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        toast.success(`Document ${status} successfully`);
        setIsRejectModalOpen(false);
        setRejectionReason('');
        setSelectedDoc(null);
        fetchDocuments(); // Refresh list
      } else {
        const err = await res.json();
        toast.error(err.message || 'Update failed');
      }
    } catch (error) {
      console.error(error);
      toast.error('Error updating status');
    } finally {
      setProcessing(false);
    }
  };

  const openRejectModal = (doc) => {
    setSelectedDoc(doc);
    setRejectionReason('');
    setIsRejectModalOpen(true);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'verified':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
          <CheckCircle className="w-3 h-3 mr-1" /> Verified
        </span>;
      case 'rejected':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <XCircle className="w-3 h-3 mr-1" /> Rejected
        </span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
          <Clock className="w-3 h-3 mr-1" /> Pending
        </span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compliance Approvals</h1>
          <p className="text-slate-500">Review and manage user uploaded documents.</p>
        </div>
        
        {/* Filters */}
        <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200">
          {['pending', 'verified', 'rejected', 'all'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${
                filterStatus === status 
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm' 
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p>No documents found for this filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Document</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">
                          {doc.full_name?.[0] || 'U'}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-slate-900">{doc.full_name || 'Unknown User'}</div>
                          <div className="text-sm text-slate-500">{doc.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">{doc.document_type}</div>
                      <div className="text-sm text-slate-500 truncate max-w-xs">{doc.description}</div>
                      {doc.is_mandatory && (
                         <span className="text-[10px] uppercase font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded ml-2">Required</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {new Date(doc.updated_at || doc.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(doc.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <a 
                        href={`${apiUrl}${doc.file_path}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-indigo-600 hover:text-indigo-900"
                        title="View Document"
                      >
                        <Eye className="w-4 h-4" />
                      </a>
                      
                      {doc.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleStatusUpdate(doc.id, 'verified')}
                            disabled={processing}
                            className="inline-flex items-center text-emerald-600 hover:text-emerald-900 disabled:opacity-50"
                            title="Verify"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openRejectModal(doc)}
                            disabled={processing}
                            className="inline-flex items-center text-red-600 hover:text-red-900 disabled:opacity-50"
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination Controls */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-sm text-slate-500">
                Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1 rounded hover:bg-slate-200 disabled:opacity-50"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1 rounded hover:bg-slate-200 disabled:opacity-50"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>
        </div>
      </div>

      {/* Reject Modal */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-medium text-slate-900 mb-2">Reject Document</h3>
              <p className="text-sm text-slate-500 mb-4">
                Please provide a reason for rejecting this document. This will be visible to the user.
              </p>
              
              <textarea
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-sm p-3 border"
                rows={4}
                placeholder="Reason for rejection (e.g. Blurred image, wrong document, expired)..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              ></textarea>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setIsRejectModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleStatusUpdate(selectedDoc.id, 'rejected', rejectionReason)}
                  disabled={!rejectionReason.trim() || processing}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {processing && <Loader2 className="w-3 h-3 animate-spin" />}
                  Reject Document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplianceAdminPage;
