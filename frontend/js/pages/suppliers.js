/**
 * pages/suppliers.js — Supplier management
 */
async function loadSuppliers() {
  const page = document.getElementById('page-suppliers');
  page.innerHTML = `
    <div class="page-header">
      <div class="page-title">Suppliers</div>
      <div class="page-sub">Track your sourcing contacts and profitability by supplier</div>
    </div>
    <div class="two-col" style="margin-bottom:16px">
      <div class="card">
        <div class="card-header"><span class="card-title">Add supplier</span></div>
        <div class="form-group"><label class="form-label">Supplier name</label><input type="text" id="sup-name" placeholder="e.g. Sports Direct, CeX, Charity Shop"></div>
        <div class="form-group"><label class="form-label">Website</label><input type="text" id="sup-web" placeholder="https://"></div>
        <div class="form-group"><label class="form-label">Contact / notes</label><input type="text" id="sup-notes" placeholder="Account manager, phone, terms…"></div>
        <button class="btn btn-primary" onclick="addSupplier()"><i class="ti ti-plus"></i> Add supplier</button>
        <div id="sup-msg" style="margin-top:8px"></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Supplier performance</span></div>
        <div id="sup-stats"><div class="loading"><span class="spinner"></span></div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">All suppliers</span></div>
      <div id="sup-list"><div class="loading"><span class="spinner"></span></div></div>
    </div>`;

  window.addSupplier = async () => {
    const name  = document.getElementById('sup-name').value.trim();
    const web   = document.getElementById('sup-web').value.trim();
    const notes = document.getElementById('sup-notes').value.trim();
    const msg   = document.getElementById('sup-msg');
    if (!name) { msg.innerHTML = '<div class="alert alert-danger">Please enter a supplier name</div>'; return; }
    try {
      await API.post('/api/suppliers', { name, website: web, notes });
      msg.innerHTML = `<div class="alert alert-success">Supplier "${name}" added</div>`;
      document.getElementById('sup-name').value = '';
      document.getElementById('sup-web').value  = '';
      document.getElementById('sup-notes').value = '';
      loadSupplierList();
      loadSupplierStats();
    } catch (err) { msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`; }
  };

  loadSupplierList();
  loadSupplierStats();
}

async function loadSupplierList() {
  try {
    const suppliers = await API.get('/api/suppliers');
    const el = document.getElementById('sup-list');
    if (!suppliers.length) { el.innerHTML = '<div class="empty">No suppliers yet — add your first one</div>'; return; }
    el.innerHTML = `<table>
      <thead><tr><th>Name</th><th>Website</th><th>Items sourced</th><th>Notes</th><th></th></tr></thead>
      <tbody>` +
      suppliers.map(s => `
        <tr>
          <td style="font-weight:500">${s.name}</td>
          <td>${s.website ? `<a href="${s.website}" target="_blank" style="color:var(--color-info)">${s.website.replace('https://','')}</a>` : '—'}</td>
          <td><span class="badge badge-info" id="sup-count-${s.id}">—</span></td>
          <td style="color:var(--color-muted);font-size:12px">${s.notes || '—'}</td>
          <td><button class="btn btn-sm btn-danger" onclick="deleteSupplier(${s.id},'${s.name.replace(/'/g,"\\'")}')"><i class="ti ti-trash"></i></button></td>
        </tr>`).join('') +
      `</tbody></table>`;

    // Load item counts per supplier
    const items = await API.inventory({});
    suppliers.forEach(s => {
      const count = items.filter(i => i.supplier === s.name).length;
      const el2 = document.getElementById(`sup-count-${s.id}`);
      if (el2) el2.textContent = `${count} items`;
    });
  } catch (err) { document.getElementById('sup-list').innerHTML = `<div class="alert alert-danger">${err.message}</div>`; }
}

async function loadSupplierStats() {
  try {
    const items   = await API.inventory({});
    const orders  = await API.orders({ limit: 200 });

    // Group profit by supplier
    const stats = {};
    orders.orders?.forEach(o => {
      const item = items.find(i => i.ebay_sku === o.ebay_sku);
      const sup  = item?.supplier || 'Unknown';
      if (!stats[sup]) stats[sup] = { revenue: 0, profit: 0, orders: 0 };
      stats[sup].revenue += parseFloat(o.sale_price || 0);
      stats[sup].profit  += parseFloat(o.net_profit || 0);
      stats[sup].orders++;
    });

    const sorted = Object.entries(stats).sort((a,b) => b[1].profit - a[1].profit).slice(0,6);
    const el = document.getElementById('sup-stats');
    if (!sorted.length) { el.innerHTML = '<div class="empty">No data yet</div>'; return; }

    el.innerHTML = `<table>
      <thead><tr><th>Supplier</th><th>Orders</th><th>Revenue</th><th>Profit</th></tr></thead>
      <tbody>` +
      sorted.map(([name, s]) => `
        <tr>
          <td style="font-weight:500">${name}</td>
          <td>${s.orders}</td>
          <td>${UI.pound(s.revenue)}</td>
          <td style="color:var(--color-success);font-weight:500">${UI.pound(s.profit)}</td>
        </tr>`).join('') +
      `</tbody></table>`;
  } catch(e) { document.getElementById('sup-stats').innerHTML = '<div class="empty">No data</div>'; }
}

window.deleteSupplier = async (id, name) => {
  if (!confirm(`Delete supplier "${name}"?`)) return;
  try {
    await API.delete(`/api/suppliers/${id}`);
    UI.toast('Supplier deleted', 'success');
    loadSupplierList();
  } catch (err) { UI.toast(err.message, 'danger'); }
};
