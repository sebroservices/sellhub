/**
 * pages/reports.js
 * Accountant reports page — P&L, VAT, Annual, Inventory at date, exports
 */

async function loadReports() {
  const page = document.getElementById('page-reports');
  page.innerHTML = `
    <div class="page-header">
      <div class="page-title">Reports</div>
      <div class="page-sub">Professional reports for your accountant — PDF, Excel, QuickBooks & Xero</div>
    </div>

    <div id="retention-health" style="margin-bottom:16px"></div>

    <div class="two-col" style="gap:16px;margin-bottom:16px">

      <!-- Monthly P&L -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="ti ti-file-analytics" style="font-size:16px;vertical-align:-2px;margin-right:6px"></i>Monthly P&L</span>
        </div>
        <p style="font-size:12px;color:var(--color-muted);margin-bottom:12px">Full profit & loss statement with order detail. Includes income, eBay fees, COGS, and net profit.</p>
        <div class="form-group">
          <label class="form-label">Select month</label>
          <select id="pl-month"></select>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="downloadReport('pl/pdf', document.getElementById('pl-month').value)">
            <i class="ti ti-file-type-pdf"></i> PDF
          </button>
          <button class="btn btn-sm" onclick="downloadReport('pl/excel', document.getElementById('pl-month').value)">
            <i class="ti ti-table"></i> Excel
          </button>
          <button class="btn btn-sm" onclick="lockPeriod(document.getElementById('pl-month').value)">
            <i class="ti ti-lock"></i> Lock period
          </button>
        </div>
      </div>

      <!-- VAT Return -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="ti ti-receipt-tax" style="font-size:16px;vertical-align:-2px;margin-right:6px"></i>VAT Return</span>
          <span class="badge badge-info">HMRC MTD</span>
        </div>
        <p style="font-size:12px;color:var(--color-muted);margin-bottom:12px">Boxes 1–7 for UK VAT return. Output VAT on sales, input VAT on eBay fees, net payable.</p>
        <div class="form-group">
          <label class="form-label">Select quarter</label>
          <select id="vat-quarter">
            <option value="2026-Q2">Q2 2026 (Apr–Jun)</option>
            <option value="2026-Q1">Q1 2026 (Jan–Mar)</option>
            <option value="2025-Q4">Q4 2025 (Oct–Dec)</option>
            <option value="2025-Q3">Q3 2025 (Jul–Sep)</option>
          </select>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="downloadVat('excel')">
            <i class="ti ti-table"></i> Excel
          </button>
          <button class="btn btn-sm" onclick="buildVat()">
            <i class="ti ti-refresh"></i> Recalculate VAT
          </button>
        </div>
      </div>

    </div>

    <div class="two-col" style="gap:16px;margin-bottom:16px">

      <!-- Annual Tax Report -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="ti ti-calendar-stats" style="font-size:16px;vertical-align:-2px;margin-right:6px"></i>Annual Tax Report</span>
        </div>
        <p style="font-size:12px;color:var(--color-muted);margin-bottom:12px">Full year P&L, monthly breakdown, top items. Share with your accountant for self-assessment.</p>
        <div class="form-group">
          <label class="form-label">Tax year</label>
          <select id="annual-year"></select>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="downloadReport('annual/pdf', document.getElementById('annual-year').value)">
            <i class="ti ti-file-type-pdf"></i> PDF
          </button>
          <button class="btn btn-sm" onclick="downloadReport('annual/excel', document.getElementById('annual-year').value)">
            <i class="ti ti-table"></i> Excel
          </button>
        </div>
      </div>

      <!-- Inventory at Date -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="ti ti-packages" style="font-size:16px;vertical-align:-2px;margin-right:6px"></i>Inventory valuation</span>
        </div>
        <p style="font-size:12px;color:var(--color-muted);margin-bottom:12px">Stock levels and valuation at any historical date. Perfect for year-end accounts and asset valuations.</p>
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="date" id="inv-date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="downloadInventory('pdf')">
            <i class="ti ti-file-type-pdf"></i> PDF
          </button>
          <button class="btn btn-sm" onclick="downloadInventory('excel')">
            <i class="ti ti-table"></i> Excel
          </button>
          <button class="btn btn-sm" onclick="snapshotNow()">
            <i class="ti ti-camera"></i> Snapshot now
          </button>
        </div>
      </div>

    </div>

    <!-- Accounting Exports -->
    <div class="card">
      <div class="card-header">
        <span class="card-title"><i class="ti ti-arrows-right-left" style="font-size:16px;vertical-align:-2px;margin-right:6px"></i>Accounting software exports</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="font-size:13px;font-weight:500;margin-bottom:4px">QuickBooks</div>
          <div style="font-size:12px;color:var(--color-muted);margin-bottom:10px">IIF format — import directly into QuickBooks Desktop or Online</div>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="qb-month" style="flex:1"></select>
            <button class="btn btn-sm" onclick="downloadExport('quickbooks', document.getElementById('qb-month').value)">
              <i class="ti ti-download"></i> Download IIF
            </button>
          </div>
        </div>
        <div>
          <div style="font-size:13px;font-weight:500;margin-bottom:4px">Xero</div>
          <div style="font-size:12px;color:var(--color-muted);margin-bottom:10px">CSV format — import via Xero's "Import Invoices" feature</div>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="xero-month" style="flex:1"></select>
            <button class="btn btn-sm" onclick="downloadExport('xero', document.getElementById('xero-month').value)">
              <i class="ti ti-download"></i> Download CSV
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Financial periods lock status -->
    <div class="card">
      <div class="card-header">
        <span class="card-title"><i class="ti ti-lock" style="font-size:16px;vertical-align:-2px;margin-right:6px"></i>Financial periods</span>
        <span style="font-size:12px;color:var(--color-muted)">Lock a month to freeze its P&L — prevents accidental changes</span>
      </div>
      <div id="periods-table"><div class="loading"><span class="spinner"></span></div></div>
    </div>`;

  // Load periods and populate selects
  try {
    const { months, years } = await API.get('/api/reports/periods');

    const monthOptions = months.map(m =>
      `<option value="${m.period}">${m.label}${m.locked ? ' 🔒' : ''}</option>`
    ).join('');

    ['pl-month', 'qb-month', 'xero-month'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = monthOptions;
    });

    const yearOptions = years.map(y => `<option value="${y}">${y}</option>`).join('');
    document.getElementById('annual-year').innerHTML = yearOptions;

    // Periods table
    document.getElementById('periods-table').innerHTML = months.length
      ? `<table>
          <thead><tr><th>Period</th><th>Orders</th><th>Net profit</th><th>Status</th><th></th></tr></thead>
          <tbody>` +
        months.map(m => `
          <tr>
            <td>${m.label}</td>
            <td>${m.orders}</td>
            <td style="font-weight:500;color:${parseFloat(m.profit)>=0?'var(--color-success)':'var(--color-danger)'}">£${parseFloat(m.profit).toFixed(2)}</td>
            <td>${m.locked
              ? '<span class="badge badge-success">🔒 Locked</span>'
              : '<span class="badge badge-neutral">Open</span>'}</td>
            <td style="display:flex;gap:6px">
              <button class="btn btn-sm" onclick="downloadReport('pl/pdf','${m.period}')"><i class="ti ti-file-type-pdf"></i></button>
              <button class="btn btn-sm" onclick="downloadReport('pl/excel','${m.period}')"><i class="ti ti-table"></i></button>
              ${!m.locked ? `<button class="btn btn-sm" onclick="lockPeriod('${m.period}')"><i class="ti ti-lock"></i> Lock</button>` : ''}
            </td>
          </tr>`).join('') +
        `</tbody></table>`
      : '<div class="empty">No data yet — sync your eBay orders first</div>';

  } catch (err) {
    document.getElementById('periods-table').innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }

  // Load retention health
  try {
    const health = await API.get('/api/reports/health');
    const color  = health.status === 'healthy' ? 'success' : health.status === 'warning' ? 'warning' : 'danger';
    const icons  = { healthy:'ti-shield-check', warning:'ti-alert-triangle', critical:'ti-alert-octagon' };
    document.getElementById('retention-health').innerHTML = `
      <div class="alert alert-${color}" style="display:flex;align-items:flex-start;gap:10px">
        <i class="ti ${icons[health.status]}" style="font-size:18px;margin-top:1px"></i>
        <div>
          <strong>Data retention: ${health.status}</strong>
          ${health.alerts?.length ? '<br>' + health.alerts.map(a => a.message).join('<br>') : ' — all data safely stored'}
          ${health.oldest_order ? `<br><span style="font-size:12px">Oldest order: ${UI.date(health.oldest_order)} · Last sync: ${health.days_since_sync} days ago</span>` : ''}
        </div>
      </div>`;
  } catch (_) {}

  // ── Actions ───────────────────────────────────────────────────────────────

  window.downloadReport = (type, value) => {
    if (!value) return UI.toast('Please select a period', 'warning');
    window.open(`/api/reports/${type}/${value}`, '_blank');
  };

  window.downloadVat = (format) => {
    const q = document.getElementById('vat-quarter').value;
    window.open(`/api/reports/vat/${format}/${q}`, '_blank');
  };

  window.downloadInventory = (format) => {
    const date = document.getElementById('inv-date').value;
    if (!date) return UI.toast('Please select a date', 'warning');
    window.open(`/api/reports/inventory/${format}?date=${date}`, '_blank');
  };

  window.downloadExport = (type, period) => {
    if (!period) return UI.toast('Please select a period', 'warning');
    window.open(`/api/reports/export/${type}/${period}`, '_blank');
  };

  window.lockPeriod = async (period) => {
    if (!confirm(`Lock ${period}? This freezes the P&L figures. You can still download reports.`)) return;
    try {
      await API.post(`/api/reports/lock/${period}`);
      UI.toast(`Period ${period} locked`, 'success');
      loadReports(); // refresh
    } catch (err) { UI.toast(err.message, 'danger'); }
  };

  window.buildVat = async () => {
    const q = document.getElementById('vat-quarter').value;
    // Convert quarter to period for API
    const periodMap = { 'Q1':'01', 'Q2':'04', 'Q3':'07', 'Q4':'10' };
    const [y, qt]  = q.split('-');
    const period   = `${y}-${periodMap[qt]}`;
    try {
      await API.post(`/api/reports/vat/build/${period}`);
      UI.toast('VAT records recalculated', 'success');
    } catch (err) { UI.toast(err.message, 'danger'); }
  };

  window.snapshotNow = async () => {
    try {
      const date = document.getElementById('inv-date').value;
      await API.post('/api/reports/snapshot', { date });
      UI.toast('Inventory snapshot saved', 'success');
    } catch (err) { UI.toast(err.message, 'danger'); }
  };
}

