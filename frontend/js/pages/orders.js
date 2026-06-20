/** pages/orders.js */
async function loadOrders() {
  const page = document.getElementById('page-orders');
  let currentOffset = 0;
  const LIMIT = 50;

  page.innerHTML = `
    <div class="page-header">
      <div class="page-title">Orders</div>
      <div class="page-sub">Synced from eBay Fulfillment API</div>
    </div>
    <div class="toolbar">
      <input type="text" id="ord-search" placeholder="Search order, item or buyer…" oninput="ordersRender()">
      <select id="ord-status" onchange="ordersRender()">
        <option value="">All statuses</option>
        <option value="NOT_STARTED">Pending</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="FULFILLED">Fulfilled</option>
      </select>
      <input type="month" id="ord-month" onchange="ordersRender()" style="width:160px">
      <button class="btn" onclick="exportOrdersCSV()"><i class="ti ti-download"></i> CSV</button>
      <button class="btn" onclick="API.syncOrders().then(()=>{UI.toast('Orders synced','success');ordersRender()})">
        <i class="ti ti-refresh"></i> Sync
      </button>
    </div>
    <div class="card card-flush">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Order ID</th><th>Item</th><th>Buyer</th><th>Date</th>
            <th>Sale</th><th>eBay fees</th><th>COGS</th><th>Net profit</th><th>Status</th>
          </tr></thead>
          <tbody id="orders-tbody"><tr><td colspan="9"><div class="loading"><span class="spinner"></span>Loading…</div></td></tr></tbody>
        </table>
      </div>
      <div class="pagination" id="orders-pagination"></div>
    </div>`;

  window.ordersRender = async () => {
    const search = document.getElementById('ord-search').value;
    const status = document.getElementById('ord-status').value;
    const month  = document.getElementById('ord-month').value;
    const tbody  = document.getElementById('orders-tbody');
    tbody.innerHTML = `<tr><td colspan="9"><div class="loading"><span class="spinner"></span></div></td></tr>`;

    try {
      const data = await API.orders({ search, status, month, limit: LIMIT, offset: currentOffset });
      tbody.innerHTML = data.orders?.map(o => `
        <tr>
          <td style="font-size:11px;color:var(--color-muted)">${o.ebay_order_id}</td>
          <td>${o.item_title || '—'}</td>
          <td style="color:var(--color-muted)">${o.buyer_username || '—'}</td>
          <td style="white-space:nowrap">${UI.date(o.order_date)}</td>
          <td>${UI.pound(o.sale_price)}</td>
          <td style="color:var(--color-danger)">–${UI.pound((parseFloat(o.ebay_final_value_fee||0)+parseFloat(o.ebay_per_order_fee||0)+parseFloat(o.promoted_fee||0)))}</td>
          <td style="color:var(--color-muted)">–${UI.pound(o.cogs)}</td>
          <td style="font-weight:500;color:${parseFloat(o.net_profit)>=0?'var(--color-success)':'var(--color-danger)'}">${UI.pound(o.net_profit)}</td>
          <td>${UI.statusBadge(o.fulfillment_status)}</td>
        </tr>`).join('') || `<tr><td colspan="9"><div class="empty">No orders found</div></td></tr>`;

      const pag = document.getElementById('orders-pagination');
      pag.innerHTML = `
        <button class="btn" ${currentOffset===0?'disabled':''} onclick="currentOffset-=${LIMIT};ordersRender()">← Prev</button>
        <span>${currentOffset+1}–${Math.min(currentOffset+LIMIT, data.total)} of ${data.total}</span>
        <button class="btn" ${currentOffset+LIMIT>=data.total?'disabled':''} onclick="currentOffset+=${LIMIT};ordersRender()">Next →</button>`;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="alert alert-danger">${err.message}</div></td></tr>`;
    }
  };

  window.exportOrdersCSV = async () => {
    const data = await API.orders({ limit: 1000 });
    const rows = [['Order ID','Item','Buyer','Date','Sale','eBay Fees','COGS','Net Profit','Status'],
      ...data.orders.map(o => [o.ebay_order_id,o.item_title,o.buyer_username,o.order_date,o.sale_price,
        parseFloat(o.ebay_final_value_fee||0)+parseFloat(o.ebay_per_order_fee||0),o.cogs,o.net_profit,o.fulfillment_status])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { href: 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv), download: 'sellhub-orders.csv' });
    a.click();
  };

  ordersRender();
}

