/**
 * pages/dashboard.js
 * Dashboard with date range filter (Today / This week / This month / This year / Custom)
 */

async function loadDashboard() {
  const page = document.getElementById('page-dashboard');
  page.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div class="page-title">Dashboard</div>
          <div class="page-sub" id="dash-sub">Loading…</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm dash-period active" data-period="today">Today</button>
            <button class="btn btn-sm dash-period" data-period="week">This week</button>
            <button class="btn btn-sm dash-period" data-period="month">This month</button>
            <button class="btn btn-sm dash-period" data-period="year">This year</button>
            <button class="btn btn-sm dash-period" data-period="custom">Custom</button>
          </div>
          <div id="custom-range" style="display:none;gap:6px;align-items:center">
            <input type="date" id="date-from" style="width:140px;font-size:12px;padding:4px 8px">
            <span style="font-size:12px;color:var(--color-text-secondary)">to</span>
            <input type="date" id="date-to" style="width:140px;font-size:12px;padding:4px 8px">
            <button class="btn btn-sm btn-primary" onclick="dashRefresh()">Apply</button>
          </div>
        </div>
      </div>
    </div>
    <div class="metric-grid" id="dash-metrics"></div>
    <div class="two-col">
      <div class="card">
        <div class="card-header">
          <span class="card-title" id="chart-label">Revenue chart</span>
        </div>
        <div id="rev-chart"></div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Recent orders</span>
          <button class="btn btn-sm" onclick="App.navigate('orders')">View all</button>
        </div>
        <div id="dash-recent-orders"><div class="loading"><span class="spinner"></span></div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Low stock alerts</span>
        <span class="badge badge-danger" id="low-stock-badge"></span>
      </div>
      <div id="dash-low-stock"><div class="loading"><span class="spinner"></span></div></div>
    </div>`;

  // Wire period buttons
  document.querySelectorAll('.dash-period').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dash-period').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const customRange = document.getElementById('custom-range');
      if (btn.dataset.period === 'custom') {
        customRange.style.display = 'flex';
      } else {
        customRange.style.display = 'none';
        dashRefresh();
      }
    });
  });

  // Set default dates for custom range
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  document.getElementById('date-from').value = firstOfMonth.toISOString().slice(0,10);
  document.getElementById('date-to').value   = now.toISOString().slice(0,10);

  window.dashRefresh = async () => {
    const activePeriod = document.querySelector('.dash-period.active')?.dataset.period || 'month';
    const { from, to, label, chartMode } = getDateRange(activePeriod);

    document.getElementById('dash-sub').textContent = `${label} · demo data`;
    document.getElementById('chart-label').textContent =
      chartMode === 'daily' ? 'Daily revenue' : 'Monthly revenue';

    // Build query params
    const params = {};
    if (from) params.from = from;
    if (to)   params.to   = to;
    if (!from && !to && activePeriod === 'month') {
      params.month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    }

    UI.loading('dash-metrics', 'Loading stats…');

    try {
      const [summary, chartData, recentOrders, alerts] = await Promise.all([
        fetchSummary(params),
        fetchChartData(activePeriod, now),
        API.orders({ limit: 5 }),
        API.lowStock(),
      ]);

      const net = parseFloat(summary.net_profit || summary.total_profit || 0);
      const rev = parseFloat(summary.total_revenue || 0);
      const margin = rev > 0 ? (net / rev * 100) : 0;

      UI.metrics('dash-metrics', [
        { label: 'Revenue',           value: UI.pound(rev),                    sub: `${summary.order_count} orders` },
        { label: 'Net profit',        value: UI.pound(net),                    color: net >= 0 ? 'var(--color-success)' : 'var(--color-danger)' },
        { label: 'eBay fees',         value: UI.pound(summary.total_fees),     color: 'var(--color-danger)' },
        { label: 'Margin',            value: UI.pct(margin) },
        { label: 'Avg profit / order',value: UI.pound(summary.avg_profit_per_order) },
        { label: 'COGS',              value: UI.pound(summary.total_cogs) },
      ]);

      UI.barChart('rev-chart', chartData, '#1D9E75');

      // Recent orders
      const tbody = recentOrders.orders?.map(o => `
        <tr>
          <td style="font-size:11px;color:var(--color-muted)">${o.ebay_order_id?.slice(-8)}</td>
          <td>${o.item_title || '—'}</td>
          <td>${UI.pound(o.sale_price)}</td>
          <td style="color:var(--color-success);font-weight:500">${UI.pound(o.net_profit)}</td>
          <td>${UI.statusBadge(o.fulfillment_status)}</td>
        </tr>`).join('') || '';

      document.getElementById('dash-recent-orders').innerHTML = tbody
        ? `<table><thead><tr><th>Order</th><th>Item</th><th>Sale</th><th>Profit</th><th>Status</th></tr></thead><tbody>${tbody}</tbody></table>`
        : '<div class="empty">No orders found</div>';

      // Low stock
      const badge = document.getElementById('low-stock-badge');
      badge.textContent = alerts.length ? `${alerts.length} items` : '';
      document.getElementById('dash-low-stock').innerHTML = alerts.length
        ? `<table><thead><tr><th>SKU</th><th>Item</th><th>Stock</th><th></th></tr></thead><tbody>` +
          alerts.map(a => `
            <tr>
              <td style="color:var(--color-muted);font-size:12px">${a.ebay_sku || '—'}</td>
              <td>${a.title}</td>
              <td>${UI.stockBar(a.quantity, a.low_stock_threshold)}</td>
              <td><button class="btn btn-sm btn-danger">Reorder</button></td>
            </tr>`).join('') +
          `</tbody></table>`
        : '<div class="empty">No low stock alerts</div>';

    } catch (err) {
      UI.error('dash-metrics', 'Could not load dashboard: ' + err.message);
    }
  };

  await dashRefresh();
}

function getDateRange(period) {
  const now  = new Date();
  const pad  = n => String(n).padStart(2,'0');
  const fmt  = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today = fmt(now);

  switch(period) {
    case 'today': {
      return { from: today, to: today, label: 'Today', chartMode: 'daily' };
    }
    case 'week': {
      const mon = new Date(now);
      mon.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
      return { from: fmt(mon), to: today, label: 'This week', chartMode: 'daily' };
    }
    case 'month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: fmt(first), to: today, label: `${now.toLocaleString('default',{month:'long'})} ${now.getFullYear()}`, chartMode: 'daily' };
    }
    case 'year': {
      return { from: `${now.getFullYear()}-01-01`, to: today, label: `Year ${now.getFullYear()}`, chartMode: 'monthly' };
    }
    case 'custom': {
      const from = document.getElementById('date-from')?.value || '';
      const to   = document.getElementById('date-to')?.value   || today;
      const days = from ? Math.round((new Date(to) - new Date(from)) / 86400000) : 30;
      return { from, to, label: from ? `${from} to ${to}` : 'Custom range', chartMode: days > 60 ? 'monthly' : 'daily' };
    }
    default:
      return { from: null, to: null, label: 'All time', chartMode: 'monthly' };
  }
}

async function fetchSummary(params) {
  // Build query string from params
  const qs = new URLSearchParams();
  if (params.month) qs.set('month', params.month);
  if (params.from)  qs.set('from', params.from + 'T00:00:00Z');
  if (params.to)    qs.set('to',   params.to   + 'T23:59:59Z');

  // Use profit summary for from/to, order summary for month
  if (params.month) {
    return API.get(`/api/orders/summary?${qs}`);
  } else {
    const data = await API.get(`/api/profit/summary?${qs}`);
    // normalise field names
    return {
      order_count:          data.order_count,
      total_revenue:        data.gross_revenue,
      total_profit:         data.net_profit,
      net_profit:           data.net_profit,
      total_fees:           parseFloat(data.fvf_total||0) + parseFloat(data.per_order_total||0) + parseFloat(data.promoted_total||0),
      total_cogs:           data.cogs_total,
      avg_profit_per_order: data.order_count > 0 ? data.net_profit / data.order_count : 0,
    };
  }
}

async function fetchChartData(period, now) {
  if (period === 'year') {
    const monthly = await API.profitMonthly(now.getFullYear());
    return monthly.map(m => ({ l: m.month_label, v: parseFloat(m.revenue) }));
  } else {
    // Daily chart — use monthly data for now, daily breakdown coming soon
    const monthly = await API.profitMonthly(now.getFullYear());
    return monthly.map(m => ({ l: m.month_label, v: parseFloat(m.revenue) }));
  }
}
