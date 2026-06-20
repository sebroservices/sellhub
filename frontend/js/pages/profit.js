/** pages/profit.js */
async function loadProfit() {
  const page = document.getElementById('page-profit');
  const year = new Date().getFullYear();
  page.innerHTML = `
    <div class="page-header">
      <div class="page-title">Profit analysis</div>
      <div class="page-sub">Full P&L breakdown · ${year}</div>
    </div>
    <div class="metric-grid" id="profit-metrics"></div>
    <div class="two-col">
      <div class="card">
        <div class="card-header"><span class="card-title">Monthly profit</span></div>
        <div id="profit-chart"></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Fee breakdown</span></div>
        <div id="fee-table"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Top items by profit</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Item</th><th>SKU</th><th>Units sold</th><th>Revenue</th><th>COGS</th><th>Profit</th><th>ROI</th></tr></thead>
        <tbody id="top-items-tbody"></tbody>
      </table></div>
    </div>`;

  try {
    const [summary, monthly, topItems, fees] = await Promise.all([
      API.profitSummary({}),
      API.profitMonthly(year),
      API.topItems(10),
      API.fees(),
    ]);

    UI.metrics('profit-metrics', [
      { label: 'Gross revenue',    value: UI.pound(summary.gross_revenue) },
      { label: 'eBay fees',        value: `–${UI.pound(summary.fvf_total + summary.per_order_total + summary.promoted_total)}`, color: 'var(--color-danger)' },
      { label: 'COGS',             value: `–${UI.pound(summary.cogs_total)}`,     color: 'var(--color-danger)' },
      { label: 'Shipping cost',    value: `–${UI.pound(summary.shipping_cost_total)}`, color: 'var(--color-danger)' },
      { label: 'Net profit',       value: UI.pound(summary.net_profit), color: parseFloat(summary.net_profit)>=0?'var(--color-success)':'var(--color-danger)' },
      { label: 'Margin %',         value: UI.pct(summary.margin_pct), color: 'var(--color-success)' },
    ]);

    UI.barChart('profit-chart', monthly.map(m => ({ l: m.month_label, v: parseFloat(m.profit) })), '#185FA5');

    document.getElementById('fee-table').innerHTML = `
      <table>
        <thead><tr><th>Fee type</th><th>Amount</th><th>% of sales</th></tr></thead>
        <tbody>
          <tr><td>Final value fee</td><td>${UI.pound(fees.fvf)}</td><td>${UI.pct((fees.fvf/summary.gross_revenue)*100)}</td></tr>
          <tr><td>Per-order fees</td><td>${UI.pound(fees.per_order)}</td><td>${UI.pct((fees.per_order/summary.gross_revenue)*100)}</td></tr>
          <tr><td>Promoted listings</td><td>${UI.pound(fees.promoted)}</td><td>${UI.pct((fees.promoted/summary.gross_revenue)*100)}</td></tr>
          <tr><td style="font-weight:500">Total fees</td><td style="font-weight:500">${UI.pound(fees.total_fees)}</td><td style="font-weight:500">${UI.pct(fees.fee_pct_of_sales)}</td></tr>
        </tbody>
      </table>`;

    document.getElementById('top-items-tbody').innerHTML = topItems.map(item => `
      <tr>
        <td>${item.item_title || '—'}</td>
        <td style="font-size:11px;color:var(--color-muted)">${item.ebay_sku || '—'}</td>
        <td>${item.units_sold}</td>
        <td>${UI.pound(item.revenue)}</td>
        <td style="color:var(--color-muted)">–${UI.pound(item.total_cogs)}</td>
        <td style="font-weight:500;color:var(--color-success)">${UI.pound(item.total_profit)}</td>
        <td><span class="badge badge-success">${UI.pct(item.roi_pct)}</span></td>
      </tr>`).join('') || `<tr><td colspan="7"><div class="empty">No data yet</div></td></tr>`;

  } catch (err) {
    UI.error('profit-metrics', 'Could not load profit data: ' + err.message);
  }
}

