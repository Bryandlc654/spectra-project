export function normalizePageResponse(payload) {
    const data = payload || {};
    const items = Array.isArray(data.data) ? data.data : (Array.isArray(data.items) ? data.items : []);
    const meta = data.meta || {};

    const page = Number(meta.page || data.page || 1);
    const perPage = Number(meta.per_page || meta.perPage || data.per_page || 10);
    const total = Number(meta.total || data.total || items.length);

    const fromTotalPages = meta.total_pages || meta.totalPages || data.total_pages;
    const totalPages = Number(fromTotalPages || Math.ceil(total / Math.max(1, perPage)) || 1);

    return { items, page, perPage, total, totalPages };
}
