/** pages/inventory.js */
async function loadInventory() {
  const page = document.getElementById('page-inventory');
  page.innerHTML = `
    <div class="page-header">
      <div class="page-title">Inventory</div>
      <div class="page-sub">Live from eBay Inventory API · buy prices entered manually</div>
    </div>
    <div class="toolbar">
      <input type="text" id="inv-search" placeholder="Search SKU or title…" oninput="invRender()">
      <select id="inv-cat" onchange="invRender()">
        <option value="">All categories</option>
        <option>Footwear</option><option>Electronics</option><option>Clothing</option><option>Toys</option>
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="inv-low" onchange="invRender()"> Low stock only
      </label>
      <button class="btn btn-primary" onclick="showAddItemModal()"><i class="ti ti-plus"></i> Add item</button>
      <button class="btn" onclick="API.syncInventory().then(()=>{UI.toast('Inventory synced','success');invRender()})">
        <i class="ti ti-refresh"></i> Sync eBay
      </button>
    </div>
    <div id="inv-add-form" class="card hidden" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">Add inventory item</span><button class="btn btn-sm" onclick="document.getElementById('inv-add-form').classList.add('hidden')">Cancel</button></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Title</label><input type="text" id="add-title" placeholder="Item name"></div>
        <div class="form-group"><label class="form-label">SKU</label><input type="text" id="add-sku" placeholder="Your SKU"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Buy price (£)</label><input type="number" id="add-buy" step="0.01" placeholder="0.00"></div>
        <div class="form-group"><label class="form-label">List price (£)</label><input type="number" id="add-list" step="0.01" placeholder="0.00"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Quantity</label><input type="number" id="add-qty" value="1"></div>
        <div class="form-group"><label class="form-label">Category</label><input type="text" id="add-cat" placeholder="e.g. Electronics"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Supplier</label><input type="text" id="add-supplier"></div>
        <div class="form-group"><label class="form-label">Notes</label><input type="text" id="add-notes"></div>
      </div>
      <button class="btn btn-primary" onclick="submitAddItem()"><i class="ti ti-check"></i> Save item</button>
    </div>
    <div class="card card-flush">
      <div class="table-wrap">
        <table>
          <thead><tr><th>SKU</th><th>Title</th><th>Category</th><th>Buy price</th><th>List price</th><th>Margin</th><th>Stock</th><th>Status</th><th></th></tr></thead>
          <tbody id="inv-tbody"></tbody>
        </table>
      </div>
    </div>`;

  window.showAddItemModal = () => document.getElementById('inv-add-form').classList.remove('hidden');

  window.submitAddItem = async () => {
    try {
      await API.addInventory({
        title: document.getElementById('add-title').value,
        ebay_sku: document.getElementById('add-sku').value,
        buy_price: document.getElementById('add-buy').value,
        list_price: document.getElementById('add-list').value,
        quantity: document.getElementById('add-qty').value,
        category: document.getElementById('add-cat').value,
        supplier: document.getElementById('add-supplier').value,
        notes: document.getElementById('add-notes').value,
      });
      UI.toast('Item added', 'success');
      document.getElementById('inv-add-form').classList.add('hidden');
      invRender();
    } catch (err) { UI.toast(err.message, 'danger'); }
  };

  window.invRender = async () => {
    const tbody = document.getElementById('inv-tbody');
    tbody.innerHTML = `<tr><td colspan="9"><div class="loading"><span class="spinner"></span></div></td></tr>`;
    try {
      const params = {
        search: document.getElementById('inv-search').value,
        category: document.getElementById('inv-cat').value,
        lowStock: document.getElementById('inv-low').checked,
      };
      const items = await API.inventory(params);
      tbody.innerHTML = items.map(item => `
        <tr>
          <td style="font-size:11px;color:var(--color-muted)">${item.ebay_sku || '—'}</td>
          <td>${item.title}</td>
          <td>${item.category ? `<span class="badge badge-info">${item.category}</span>` : '—'}</td>
          <td>${item.buy_price ? UI.pound(item.buy_price) : '<span style="color:var(--color-warning)">Not set</span>'}</td>
          <td>${item.list_price ? UI.pound(item.list_price) : '—'}</td>
          <td style="font-weight:500;color:var(--color-success)">${item.margin_pct ? UI.pct(item.margin_pct) : '—'}</td>
          <td>${UI.stockBar(item.quantity)}</td>
          <td>${item.quantity > 0 ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">OOS</span>'}</td>
          <td>
            <button class="btn btn-sm" onclick="editBuyPrice(${item.id}, ${item.buy_price || 0})">Edit</button>
          </td>
        </tr>`).join('') || `<tr><td colspan="9"><div class="empty">No items found</div></td></tr>`;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="alert alert-danger">${err.message}</div></td></tr>`;
    }
  };

  window.editBuyPrice = async (id, current) => {
    const price = prompt(`Enter buy price (GBP):`, current);
    if (price === null) return;
    try {
      await API.updateInventory(id, { buy_price: parseFloat(price) });
      UI.toast('Buy price updated', 'success');
      invRender();
    } catch (err) { UI.toast(err.message, 'danger'); }
  };

  invRender();
}

// ── CSV Import panel (appended to inventory page) ─────────────────────────────
function attachImportPanel() {
  // Add import button to toolbar if not already there
  const toolbar = document.querySelector('#page-inventory .toolbar');
  if (!toolbar || document.getElementById('inv-import-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'inv-import-btn';
  btn.className = 'btn';
  btn.innerHTML = '<i class="ti ti-upload"></i> Import CSV';
  btn.onclick = toggleImportPanel;
  toolbar.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'inv-import-panel';
  panel.className = 'card hidden';
  panel.style.marginBottom = '16px';
  panel.innerHTML = `
    <div class="card-header">
      <span class="card-title">Import from CSV</span>
      <button class="btn btn-sm" onclick="toggleImportPanel()">Close</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div style="font-size:13px;font-weight:500;margin-bottom:6px">Update buy prices</div>
        <div style="font-size:12px;color:var(--color-muted);margin-bottom:10px">CSV needs columns: <code>sku, buy_price</code></div>
        <input type="file" id="csv-buy" accept=".csv" style="margin-bottom:8px">
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="doImportBuyPrices()"><i class="ti ti-upload"></i> Upload</button>
          <a href="/api/import/buy-prices-template" class="btn btn-sm"><i class="ti ti-download"></i> Template</a>
        </div>
      </div>
      <div>
        <div style="font-size:13px;font-weight:500;margin-bottom:6px">Full inventory upload</div>
        <div style="font-size:12px;color:var(--color-muted);margin-bottom:10px">CSV needs: <code>sku, title</code> (+ optional columns)</div>
        <input type="file" id="csv-inv" accept=".csv" style="margin-bottom:8px">
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="doImportInventory()"><i class="ti ti-upload"></i> Upload</button>
          <a href="/api/import/template" class="btn btn-sm"><i class="ti ti-download"></i> Template</a>
        </div>
      </div>
    </div>
    <div id="import-result" style="margin-top:12px"></div>`;

  // Insert panel before the inventory card
  const card = document.querySelector('#page-inventory .card.card-flush');
  if (card) card.parentNode.insertBefore(panel, card);
}

window.toggleImportPanel = () => {
  const p = document.getElementById('inv-import-panel');
  if (p) p.classList.toggle('hidden');
};

window.doImportBuyPrices = async () => {
  const file = document.getElementById('csv-buy')?.files[0];
  if (!file) return UI.toast('Please select a CSV file', 'warning');
  const res = await API.importBuyPrices(file);
  const el  = document.getElementById('import-result');
  if (res.success) {
    el.innerHTML = `<div class="alert alert-success">✅ Updated ${res.updated} items. ${res.skipped} skipped.${res.errors.length?'<br>'+res.errors.join('<br>'):''}`;
    invRender();
  } else {
    el.innerHTML = `<div class="alert alert-danger">❌ ${res.error}</div>`;
  }
};

window.doImportInventory = async () => {
  const file = document.getElementById('csv-inv')?.files[0];
  if (!file) return UI.toast('Please select a CSV file', 'warning');
  const res = await API.importInventory(file);
  const el  = document.getElementById('import-result');
  if (res.success) {
    el.innerHTML = `<div class="alert alert-success">✅ Imported ${res.created} items.${res.errors.length?'<br>'+res.errors.join('<br>'):''}`;
    invRender();
  } else {
    el.innerHTML = `<div class="alert alert-danger">❌ ${res.error}</div>`;
  }
};

