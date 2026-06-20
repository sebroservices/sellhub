/**
 * pages/goals.js — Profit targets and goals
 */
async function loadGoals() {
  const page = document.getElementById('page-goals');
  const now  = new Date();
  const year = now.getFullYear();
  const month = `${year}-${String(now.getMonth()+1).padStart(2,'0')}`;

  page.innerHTML = `
    <div class="page-header">
      <div class="page-title">Goals & targets</div>
      <div class="page-sub">Track progress against your profit and revenue targets</div>
    </div>
    <div id="goals-content"><div class="loading"><span class="spinner"></span></div></div>`;

  try {
    const [summary, annual, settings] = await Promise.all([
      API.orderSummary(month),
      API.profitMonthly(year),
      API.settings(),
    ]);

    const monthlyRevenue  = parseFloat(summary.total_revenue || 0);
    const monthlyProfit   = parseFloat(summary.net_profit || 0);
    const yearlyRevenue   = annual.reduce((a,m) => a + parseFloat(m.revenue || 0), 0);
    const yearlyProfit    = annual.reduce((a,m) => a + parseFloat(m.profit || 0), 0);
    const targetROI       = parseFloat(settings?.target_roi || 30);

    // Load saved goals from localStorage-style via API
    const goals = await loadSavedGoals();

    document.getElementById('goals-content').innerHTML = `
      <div class="two-col" style="margin-bottom:16px">
        <div class="card">
          <div class="card-header"><span class="card-title">Set your targets</span></div>
          <div class="form-group">
            <label class="form-label">Monthly revenue target (£)</label>
            <input type="number" id="g-monthly-rev" value="${goals.monthly_revenue || 5000}" step="100">
          </div>
          <div class="form-group">
            <label class="form-label">Monthly profit target (£)</label>
            <input type="number" id="g-monthly-profit" value="${goals.monthly_profit || 1500}" step="100">
          </div>
          <div class="form-group">
            <label class="form-label">Annual revenue target (£)</label>
            <input type="number" id="g-annual-rev" value="${goals.annual_revenue || 60000}" step="1000">
          </div>
          <div class="form-group">
            <label class="form-label">Annual profit target (£)</label>
            <input type="number" id="g-annual-profit" value="${goals.annual_profit || 18000}" step="1000">
          </div>
          <div class="form-group">
            <label class="form-label">Target ROI per item (%)</label>
            <input type="number" id="g-roi" value="${targetROI}" step="1">
          </div>
          <button class="btn btn-primary" onclick="saveGoals()"><i class="ti ti-check"></i> Save targets</button>
          <div id="goals-msg" style="margin-top:8px"></div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">This month — ${now.toLocaleString('default',{month:'long'})}</span></div>
          ${goalProgress('Monthly revenue',  monthlyRevenue,  goals.monthly_revenue || 5000)}
          ${goalProgress('Monthly profit',   monthlyProfit,   goals.monthly_profit  || 1500)}
          <div style="margin-top:16px;font-size:13px;color:var(--color-muted)">
            Days remaining this month: <strong>${daysLeft(now)}</strong><br>
            Daily revenue needed: <strong>${UI.pound((goals.monthly_revenue||5000 - monthlyRevenue) / Math.max(daysLeft(now),1))}</strong>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">This year — ${year}</span></div>
        <div class="two-col">
          <div>${goalProgress('Annual revenue', yearlyRevenue, goals.annual_revenue || 60000)}</div>
          <div>${goalProgress('Annual profit',  yearlyProfit,  goals.annual_profit  || 18000)}</div>
        </div>
        <div style="margin-top:20px">
          <div class="card-title" style="margin-bottom:12px;font-size:13px">Monthly breakdown</div>
          <div style="display:flex;align-items:flex-end;gap:6px;height:100px">
            ${annual.map(m => {
              const h = Math.max(4, Math.round((parseFloat(m.profit||0) / Math.max(yearlyProfit,1)) * 100));
              const color = parseFloat(m.profit) >= 0 ? '#1D9E75' : '#E24B4A';
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                <div style="height:${h}px;width:100%;background:${color};border-radius:3px 3px 0 0" title="${UI.pound(m.profit)}"></div>
                <div style="font-size:10px;color:var(--color-muted)">${m.month_label}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;

    window.saveGoals = async () => {
      const g = {
        monthly_revenue: parseFloat(document.getElementById('g-monthly-rev').value),
        monthly_profit:  parseFloat(document.getElementById('g-monthly-profit').value),
        annual_revenue:  parseFloat(document.getElementById('g-annual-rev').value),
        annual_profit:   parseFloat(document.getElementById('g-annual-profit').value),
      };
      const roi = parseFloat(document.getElementById('g-roi').value);
      try {
        await API.saveSettings({ target_roi: roi });
        await API.post('/api/goals', g);
        document.getElementById('goals-msg').innerHTML = '<div class="alert alert-success">Targets saved!</div>';
        setTimeout(() => loadGoals(), 800);
      } catch(err) {
        // Save locally if API not available
        localStorage.setItem('sellhub_goals', JSON.stringify(g));
        document.getElementById('goals-msg').innerHTML = '<div class="alert alert-success">Targets saved locally!</div>';
      }
    };

  } catch (err) {
    document.getElementById('goals-content').innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function goalProgress(label, current, target) {
  const pct     = Math.min(100, Math.round((current / Math.max(target, 1)) * 100));
  const color   = pct >= 100 ? '#1D9E75' : pct >= 75 ? '#185FA5' : pct >= 50 ? '#EF9F27' : '#E24B4A';
  const status  = pct >= 100 ? '✓ Target hit!' : `${pct}% of target`;
  return `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <span style="font-size:13px;font-weight:500">${label}</span>
        <span style="font-size:12px;color:var(--color-muted)">${UI.pound(current)} / ${UI.pound(target)}</span>
      </div>
      <div style="height:8px;background:var(--color-bg);border-radius:4px;overflow:hidden">
        <div style="height:8px;width:${pct}%;background:${color};border-radius:4px;transition:width 0.5s"></div>
      </div>
      <div style="font-size:11px;color:${color};margin-top:4px;font-weight:500">${status}</div>
    </div>`;
}

function daysLeft(now) {
  const lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  return lastDay - now.getDate();
}

async function loadSavedGoals() {
  try {
    return await API.get('/api/goals');
  } catch(e) {
    const saved = localStorage.getItem('sellhub_goals');
    return saved ? JSON.parse(saved) : {};
  }
}
