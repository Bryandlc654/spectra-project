export function normalizePageResponse(payload) {
  if (Array.isArray(payload)) {
    const items = payload;
    const page = 1;
    const perPage = items.length || 10;
    const total = items.length;
    const totalPages = 1;
    return { items, meta: { page, perPage, total, totalPages } };
  }

  const data = payload || {};
  const items = Array.isArray(data.data) ? data.data : (Array.isArray(data.items) ? data.items : []);
  const meta = data.meta || {};
  const page = Number(meta.page || data.page || 1);
  const perPage = Number(meta.per_page || meta.perPage || data.per_page || 10);
  const total = Number(meta.total || data.total || items.length);
  const totalPages = Number(meta.total_pages || meta.totalPages || data.total_pages || Math.ceil(total / Math.max(1, perPage)) || 1);
  return { items, meta: { page, perPage, total, totalPages } };
}
