/**
 * ui.js — shared UI helpers used across all pages
 */

const UI = {

  // Format currency
  pound: (n) => `£${parseFloat(n || 0).toFixed(2)}`,

  // Format percentage
  pct: (n) => `${parseFloat(n || 0).toFixed(1)}%`,

  // Status → badge class
  statusBadge(status) {
    const map = {
      FULFILLED:   ['badge-success', 'Fulfilled'],
      NOT_STARTED: ['badge-warning', 'Pending'],
      IN_PROGRESS: ['badge-info',    'In progress'],
      PAID:        ['badge-success', 'Paid'],
      UNPAID:      ['badge-danger',  'Unpaid'],
      Shipped:     ['badge-success', 'Shipped'],
      Pending:     ['badge-warning', 'Pending'],
      Paid:        ['badge-info',    'Paid'],
      Cancelled:   ['badge-danger',  'Cancelled'],
    };
    const [cls, label] = map[status] || ['badge-neutral', status];
    return `<span class="badge ${cls}">${label}</span>`;
  },

  // Stock quantity with mini bar
  stockBar(qty, threshold = 3) {
    const pct = Math.min(100, Math.round((qty / 10) * 100));
    const cls = qty <= 0 ? 'low' : qty <= threshold ? 'mid' : '';
    const color = qty <= 0 ? 'var(--color-danger)' : qty <= threshold ? '#EF9F27' : 'var(--color-success)';
    return `
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-weight:500;color:${color};min-width:18px">${qty}</span>
        <div class="stock-bar-wrap"><div class="stock-bar ${cls}" style="width:${pct}%"></div></div>
      </div>`;
  },

  // Simple bar chart
  barChart(containerId, data, color = '#1D9E75') {
    const el = document.getElementById(containerId);
    if (!el) return;
    const max = Math.max(...data.map(d => d.v), 1);
    el.innerHTML = `<div class="chart-bars">` +
      data.map(d => `
        <div class="bar-col">
          <div class="bar" style="height:${Math.round((d.v / max) * 100)}px;background:${color}" title="${UI.pound(d.v)}"></div>
          <div class="bar-lbl">${d.l}</div>
        </div>`
      ).join('') +
    `</div>`;
  },

  // Render metric cards
  metrics(containerId, items) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = items.map(m => `
      <div class="metric">
        <div class="metric-label">${m.label}</div>
        <div class="metric-value" style="${m.color ? `color:${m.color}` : ''}">${m.value}</div>
        ${m.sub ? `<div class="metric-change ${m.updown || ''}">${m.sub}</div>` : ''}
      </div>`
    ).join('');
  },

  // Show loading state in a container
  loading(el, msg = 'Loading…') {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.innerHTML = `<div class="loading"><span class="spinner"></span>${msg}</div>`;
  },

  // Show error
  error(el, msg) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.innerHTML = `<div class="alert alert-danger">${msg}</div>`;
  },

  // Format date
  date(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  // Show toast notification
  toast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `alert alert-${type}`;
    t.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;min-width:260px;box-shadow:0 2px 8px rgba(0,0,0,0.12)';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  },
};

