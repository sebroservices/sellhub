/**
 * api.js — thin fetch wrapper for all backend API calls
 */

const API = {

  async _fetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  get:    (url)          => API._fetch(url),
  post:   (url, body)    => API._fetch(url, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (url, body)    => API._fetch(url, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (url)          => API._fetch(url, { method: 'DELETE' }),

  // Auth
  me:             ()     => API.get('/auth/me'),

  // Dashboard
  orderSummary:   (month) => API.get(`/api/orders/summary${month ? `?month=${month}` : ''}`),
  lowStock:       ()      => API.get('/api/inventory/alerts'),

  // Orders
  orders:         (params = {}) => API.get('/api/orders?' + new URLSearchParams(params)),
  syncOrders:     ()      => API.post('/api/orders/sync'),

  // Inventory
  inventory:      (params = {}) => API.get('/api/inventory?' + new URLSearchParams(params)),
  addInventory:   (body)  => API.post('/api/inventory', body),
  updateInventory:(id, b) => API.put(`/api/inventory/${id}`, b),
  deleteInventory:(id)    => API.delete(`/api/inventory/${id}`),
  syncInventory:  ()      => API.post('/api/inventory/sync'),

  // Profit
  profitSummary:  (p)     => API.get('/api/profit/summary?' + new URLSearchParams(p)),
  profitMonthly:  (year)  => API.get(`/api/profit/monthly?year=${year}`),
  topItems:       (n)     => API.get(`/api/profit/top-items?limit=${n || 10}`),
  fees:           (month) => API.get(`/api/profit/fees${month ? `?month=${month}` : ''}`),
  calculate:      (body)  => API.post('/api/profit/calculate', body),

  // Settings
  settings:       ()      => API.get('/api/settings'),
  saveSettings:   (body)  => API.put('/api/settings', body),
  syncAll:        ()      => API.post('/api/settings/sync/all'),
};

// Import
const importBuyPrices = (file) => {
  const fd = new FormData(); fd.append('file', file);
  return fetch('/api/import/buy-prices', { method: 'POST', credentials: 'include', body: fd }).then(r => r.json());
};
const importInventory = (file) => {
  const fd = new FormData(); fd.append('file', file);
  return fetch('/api/import/inventory', { method: 'POST', credentials: 'include', body: fd }).then(r => r.json());
};

Object.assign(API, { importBuyPrices, importInventory });

// Reports
Object.assign(API, {
  reportPeriods: () => API.get('/api/reports/periods'),
  retentionHealth: () => API.get('/api/reports/health'),
});

// Suppliers
Object.assign(API, {
  suppliers:      () => API.get('/api/suppliers'),
  addSupplier:    (b) => API.post('/api/suppliers', b),
  delSupplier:    (id) => API.delete(`/api/suppliers/${id}`),
});

// Goals
Object.assign(API, {
  getGoals:  () => API.get('/api/goals'),
  saveGoals: (b) => API.post('/api/goals', b),
});
