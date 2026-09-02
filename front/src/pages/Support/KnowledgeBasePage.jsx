import React, { useEffect, useMemo, useState } from 'react';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';

export default function KnowledgeBasePage({ apiUrl, token }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const [categories, setCategories] = useState([]);
  const [articles, setArticles] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(true);

  // Create Modal State
  const [showCreateArticle, setShowCreateArticle] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  
  const [articleForm, setArticleForm] = useState({ title: '', content: '', category_id: '', is_published: true });
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });
  
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // View State
  const [viewingArticle, setViewingArticle] = useState(null);
  const [editingArticleId, setEditingArticleId] = useState(null);

  // Computed
  const isEditing = !!editingArticleId;

  const openArticle = (id) => {
    const art = articles.find(a => a.id === id);
    if (art) setViewingArticle(art);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [catsRes, artsRes] = await Promise.all([
        api.get('/api/kb/categories'),
        api.get('/api/kb/articles' + (selectedCategory ? `?category_id=${selectedCategory}` : ''))
      ]);
      setCategories(catsRes.data || []);
      setArticles(artsRes.data || []);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar base de conocimiento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [api, selectedCategory]);

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!categoryForm.name) return toast.error('Nombre requerido');
    
    setCreating(true);
    try {
      await api.post('/api/kb/categories', categoryForm);
      toast.success('Categoría creada');
      setShowCreateCategory(false);
      setCategoryForm({ name: '', description: '' });
      loadData();
    } catch (err) {
      toast.error(err.message || 'Error al crear categoría');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveArticle = async (e) => {
    e.preventDefault();
    if (!articleForm.title || !articleForm.category_id) return toast.error('Datos incompletos');

    setCreating(true);
    try {
      if (isEditing) {
        await api.put(`/api/kb/articles/${editingArticleId}`, articleForm);
        toast.success('Artículo actualizado');
      } else {
        await api.post('/api/kb/articles', articleForm);
        toast.success('Artículo creado');
      }
      
      setShowCreateArticle(false);
      setEditingArticleId(null);
      setArticleForm({ title: '', content: '', category_id: '', is_published: true });
      loadData();
      
      // If we were viewing this article, update the view too
      if (viewingArticle && viewingArticle.id === editingArticleId) {
          setViewingArticle(null); // Close view to avoid stale data or complicated sync
      }
    } catch (err) {
      toast.error(err.message || (isEditing ? 'Error al actualizar' : 'Error al crear'));
    } finally {
      setCreating(false);
    }
  };

  const startEditArticle = (art) => {
      setArticleForm({
          title: art.title,
          content: art.content || '',
          category_id: art.category_id,
          is_published: !!art.is_published
      });
      setEditingArticleId(art.id);
      setViewingArticle(null); // Close view modal
      setShowCreateArticle(true); // Open form modal
  };

  const handleDeleteArticle = async (id) => {
      if (!window.confirm('¿Estás seguro de eliminar este artículo?')) return;
      
      setDeleting(true);
      try {
          await api.del(`/api/kb/articles/${id}`);
          toast.success('Artículo eliminado');
          setViewingArticle(null);
          loadData();
      } catch (err) {
          toast.error(err.message || 'Error al eliminar');
      } finally {
          setDeleting(false);
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Base de Conocimiento</h1>
          <p className="text-sm text-slate-500">Gestiona artículos y guías de ayuda</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowCreateCategory(true)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Nueva Categoría
          </button>
          <button 
            onClick={() => setShowCreateArticle(true)}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 transition shadow-sm"
          >
            Nuevo Artículo
          </button>
        </div>
      </div>

      {/* Categories Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
            !selectedCategory 
              ? 'bg-brand text-white shadow-sm' 
              : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          Todas
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
              selectedCategory === cat.id
                ? 'bg-brand text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <i className="bi bi-book text-3xl" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">No hay artículos</h3>
          <p className="mt-2 text-slate-500">
            No se encontraron artículos en esta categoría.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((art) => (
            <div key={art.id} onClick={() => openArticle(art.id)} className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-brand/30">
              <div className="flex items-start justify-between">
                <div className="mb-3 h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-brand group-hover:text-white transition">
                  <i className="bi bi-file-text text-xl" />
                </div>
                {art.is_published ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                    Publicado
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                    Borrador
                  </span>
                )}
              </div>
              <h3 className="font-bold text-slate-900 group-hover:text-brand transition">{art.title}</h3>
              <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                {art.slug}
              </p>
                    <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <i className="bi bi-calendar" />
                <span>{new Date(art.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); startEditArticle(art); }}
                  className="rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition"
                  title="Editar"
                >
                  <i className="bi bi-pencil" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteArticle(art.id); }}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                  title="Eliminar"
                >
                  <i className="bi bi-trash" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}

      {/* Create Category Modal */}
      {showCreateCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-bold text-slate-900">Nueva Categoría</h2>
            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Nombre</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
                  value={categoryForm.name}
                  onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Descripción</label>
                <textarea
                  className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
                  value={categoryForm.description}
                  onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreateCategory(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={creating} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50">Crear</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Article Modal */}
      {showCreateArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-bold text-slate-900">{isEditing ? 'Editar Artículo' : 'Nuevo Artículo'}</h2>
            <form onSubmit={handleSaveArticle} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Título</label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
                    value={articleForm.title}
                    onChange={e => setArticleForm({ ...articleForm, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Categoría</label>
                  <select
                    required
                    className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
                    value={articleForm.category_id}
                    onChange={e => setArticleForm({ ...articleForm, category_id: e.target.value })}
                  >
                    <option value="">Seleccionar...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Contenido</label>
                <textarea
                  rows={10}
                  className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm font-mono"
                  value={articleForm.content}
                  onChange={e => setArticleForm({ ...articleForm, content: e.target.value })}
                  placeholder="Markdown soportado..."
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="published"
                  checked={articleForm.is_published}
                  onChange={e => setArticleForm({ ...articleForm, is_published: e.target.checked })}
                  className="rounded border-slate-300 text-brand focus:ring-brand"
                />
                <label htmlFor="published" className="text-sm text-slate-700">Publicar inmediatamente</label>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreateArticle(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={creating} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50">{isEditing ? 'Guardar Cambios' : 'Crear Artículo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Article Modal */}
      {viewingArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-8 shadow-xl">
            <div className="mb-6 flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="mb-2 inline-block rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600">
                  {categories.find(c => c.id === viewingArticle.category_id)?.name || 'Sin Categoría'}
                </span>
                <h2 className="text-2xl font-bold text-slate-900">{viewingArticle.title}</h2>
                <div className="mt-2 flex items-center gap-3 text-sm text-slate-500">
                  <span><i className="bi bi-calendar mr-1"/> {new Date(viewingArticle.created_at).toLocaleDateString()}</span>
                  <span><i className="bi bi-person mr-1"/> Soporte</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                 <button
                   onClick={() => startEditArticle(viewingArticle)}
                   className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition"
                   title="Editar"
                 >
                   <i className="bi bi-pencil text-lg" />
                 </button>
                 <button
                   onClick={() => handleDeleteArticle(viewingArticle.id)}
                   className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                   title="Eliminar"
                 >
                   <i className="bi bi-trash text-lg" />
                 </button>
                 <button 
                  onClick={() => setViewingArticle(null)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                >
                  <i className="bi bi-x-lg text-lg" />
                </button>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none whitespace-pre-wrap font-sans text-slate-700 leading-relaxed">
              {viewingArticle.content}
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6 flex justify-between items-center">
              <div className="text-sm text-slate-500">
                ¿Te fue útil este artículo?
              </div>
              <button 
                onClick={() => setViewingArticle(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
