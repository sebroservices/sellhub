/**
 * pages/cogs.js
 * Cost of Goods management — enter and manage buy prices per item
 * Links buy prices from inventory into orders for accurate profit calculation
 */

async function loadCogs() {
  const page = document.getElementById('page-cogs');
  page.innerHTML = `
    <div class="page-header">
      <div class="page-title">Cost of goods</div>
      <div class="page-sub">Enter your buy prices here — they flow into all profit calculations automatically</div>
    </div>

    <div class="card" style="margin-bottom:16px;background:var(--color-background-info);border-color:var(--color-border-info)">
      <div style="display:flex;gap:12px;align-items:flex-start">
        <i class="ti ti-info-circle" style="font-size:20px;color:var(--color-text-info);flex-shrink:0;margin-top:2px"></i>
        <div style="font-size:13px;color:var(--color-text-info);line-height:1.6">
          <strong>How it works:</strong> Enter the price you paid for each item (your buy/sourcing cost). 
          Once set, SellHub uses this in all profit calculations — dashboard, P&L reports, per-order profit, ROI. 
          You can also bulk upload via CSV on the Inventory page.
        </div>
      </div>
    </div>

    <div class="two-col" style="margin-bottom:16px">
      <div class="card">
        <div class="card-header"><span class="card-title">Quick add COGS</span></div>
        <p style="font-size:12px;color:var(--color-text-secondary);margin-bottom:12px">Enter cost for a new item or one not yet in inventory</p>
        <div class="form-group"><label class="form-label">eBay SKU or item title</label><input type="text" id="cogs-sku" placeholder="e.g. NK-AM90-BK10 or Nike Air Max 90"></div>
        <div class="form-group"><label class="form-label">Buy price (£)</label><input type="number" id="cogs-price" step="0.01" placeholder="0.00"></div>
        <div class="form-group"><label class="form-label">Supplier (optional)</label><input type="text" id="cogs-supplier" placeholder="e.g. Sports Direct, CeX"></div>
        <button class="btn btn-primary" onclick="submitCogs()"><i class="ti ti-check"></i> Save cost price</button>
        <div id="cogs-msg" style="margin-top:10px"></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Items missing COGS</span><span class="badge badge-warning" id="missing-count"></span></div>
        <p style="font-size:12px;color:var(--color-text-secondary);margin-bottom:12px">Orders where buy price is not set — profit will show as £0</p>
        <div id="missing-cogs"><div class="loading"><span class="spinner"></span></div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">All inventory costs</span>
        <div style="display:flex;gap:8px">
          <input type="text" id="cogs-search" placeholder="Search…" style="width:200px;font-size:12px" oninput="cogsRender()">
          <button class="btn btn-sm" onclick="App.navigate('inventory')"><i class="ti ti-upload"></i> Bulk CSV import</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Buy price</th><th>List price</th><th>Margin</th><th>Supplier</th><th></th></tr></thead>
          <tbody id="cogs-tbody"></tbody>
        </table>
      </div>
    </div>`;

  // Load missing COGS
  loadMissingCogs();

  window.cogsRender = async () => {
    const search = document.getElementById('cogs-search')?.value || '';
    const tbody  = document.getElementById('cogs-tbody');
    tbody.innerHTML = `<tr><td colspan="8"><div class="loading"><span class="spinner"></span></div></td></tr>`;
    try {
      const items = await API.inventory({ search });
      tbody.innerHTML = items.map(item => `
        <tr>
          <td style="font-size:11px;color:var(--color-text-secondary)">${item.ebay_sku || '—'}</td>
          <td>${item.title}</td>
          <td>${item.category ? `<span class="badge badge-info">${item.category}</span>` : '—'}</td>
          <td>
            ${item.buy_price
              ? `<span style="font-weight:500">${UI.pound(item.buy_price)}</span>`
              : `<span style="color:var(--color-text-warning);font-size:12px">Not set</span>`}
          </td>
          <td>${item.list_price ? UI.pound(item.list_price) : '—'}</td>
          <td style="font-weight:500;color:var(--color-success)">${item.margin_pct ? UI.pct(item.margin_pct) : '—'}</td>
          <td style="color:var(--color-text-secondary);font-size:12px">${item.supplier || '—'}</td>
          <td>
            <button class="btn btn-sm" onclick="editCogs(${item.id}, '${(item.buy_price||0)}', '${(item.supplier||'')}', '${item.title.replace(/'/g,"\\'")}')">
              <i class="ti ti-edit"></i> Edit
            </button>
          </td>
        </tr>`).join('') || `<tr><td colspan="8"><div class="empty">No items found</div></td></tr>`;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="alert alert-danger">${err.message}</div></td></tr>`;
    }
  };

  window.editCogs = (id, currentPrice, currentSupplier, title) => {
    const price    = prompt(`Buy price for "${title}" (£):`, currentPrice || '');
    if (price === null) return;
    const supplier = prompt(`Supplier for "${title}" (optional):`, currentSupplier || '');
    API.updateInventory(id, { buy_price: parseFloat(price), supplier: supplier || undefined })
      .then(() => {
        UI.toast('Cost price updated', 'success');
        updateOrderCogs(id, parseFloat(price));
        cogsRender();
        loadMissingCogs();
      })
      .catch(err => UI.toast(err.message, 'danger'));
  };

  window.submitCogs = async () => {
    const sku      = document.getElementById('cogs-sku').value.trim();
    const price    = parseFloat(document.getElementById('cogs-price').value);
    const supplier = document.getElementById('cogs-supplier').value.trim();
    const msg      = document.getElementById('cogs-msg');

    if (!sku || isNaN(price) || price < 0) {
      msg.innerHTML = '<div class="alert alert-danger">Please enter a SKU/title and a valid price</div>';
      return;
    }

    try {
      // Try to find existing inventory item first
      const items = await API.inventory({ search: sku });
      if (items.length > 0) {
        await API.updateInventory(items[0].id, { buy_price: price, supplier: supplier || undefined });
        await updateOrderCogs(items[0].id, price);
        msg.innerHTML = `<div class="alert alert-success">Updated cost price for "${items[0].title}"</div>`;
      } else {
        // Create new inventory item
        await API.addInventory({ ebay_sku: sku, title: sku, buy_price: price, supplier, quantity: 0 });
        msg.innerHTML = `<div class="alert alert-success">Cost price saved for "${sku}"</div>`;
      }
      document.getElementById('cogs-sku').value   = '';
      document.getElementById('cogs-price').value  = '';
      document.getElementById('cogs-supplier').value = '';
      cogsRender();
      loadMissingCogs();
    } catch (err) {
      msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  };

  cogsRender();
}

async function loadMissingCogs() {
  try {
    // Find orders where cogs = 0
    const data = await API.orders({ limit: 100 });
    const missing = data.orders?.filter(o => parseFloat(o.cogs || 0) === 0) || [];

    const badge = document.getElementById('missing-count');
    if (badge) badge.textContent = missing.length ? `${missing.length}` : '0';

    const el = document.getElementById('missing-cogs');
    if (!el) return;

    if (!missing.length) {
      el.innerHTML = '<div class="empty" style="padding:20px">All orders have cost prices set ✓</div>';
      return;
    }

    // Group by item title
    const grouped = {};
    missing.forEach(o => {
      const key = o.item_title || o.ebay_sku || 'Unknown';
      if (!grouped[key]) grouped[key] = { count: 0, sku: o.ebay_sku, title: key };
      grouped[key].count++;
    });

    el.innerHTML = `<table>
      <thead><tr><th>Item</th><th>Orders affected</th><th></th></tr></thead>
      <tbody>` +
      Object.values(grouped).slice(0,8).map(g => `
        <tr>
          <td style="font-size:12px">${g.title?.slice(0,45) || '—'}</td>
          <td><span class="badge badge-warning">${g.count}</span></td>
          <td>
            <button class="btn btn-sm" onclick="quickSetCogs('${(g.sku||g.title).replace(/'/g,"\\'")}', '${g.title.replace(/'/g,"\\'")}')">
              Set price
            </button>
          </td>
        </tr>`).join('') +
      `</tbody></table>`;
  } catch(e) {}
}

window.quickSetCogs = async (sku, title) => {
  const price = prompt(`Buy price for "${title}" (£):`);
  if (!price || isNaN(parseFloat(price))) return;
  document.getElementById('cogs-sku').value   = sku;
  document.getElementById('cogs-price').value  = price;
  await submitCogs();
};

async function updateOrderCogs(inventoryId, buyPrice) {
  // Update cogs on uncosted orders matching this SKU
  try {
    await API.post('/api/inventory/apply-cogs', { inventory_id: inventoryId, buy_price: buyPrice });
  } catch(e) { /* endpoint may not exist yet, that's ok */ }
}
