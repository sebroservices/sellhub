/**
 * pages/emailschedule.js — Email report scheduling
 */
async function loadEmailSchedule() {
  const page = document.getElementById('page-emailschedule');
  page.innerHTML = `
    <div class="page-header">
      <div class="page-title">Email reports</div>
      <div class="page-sub">Schedule automatic reports to be emailed to you or your accountant</div>
    </div>

    <div class="card" style="margin-bottom:16px;background:var(--color-background-info);border-color:var(--color-border-info)">
      <div style="font-size:13px;color:var(--color-text-info);display:flex;gap:10px;align-items:flex-start">
        <i class="ti ti-mail" style="font-size:18px;flex-shrink:0;margin-top:1px"></i>
        <div>Configure SMTP in your <strong>.env</strong> file to enable emails. 
        Add: <code style="background:rgba(0,0,0,0.08);padding:1px 6px;border-radius:4px">SMTP_HOST, SMTP_USER, SMTP_PASS, ALERT_EMAIL</code>. 
        Works with Gmail, Outlook, Mailgun or any SMTP provider.</div>
      </div>
    </div>

    <div class="two-col">
      <div class="card">
        <div class="card-header"><span class="card-title">Scheduled reports</span></div>

        <div style="border:0.5px solid var(--color-border);border-radius:var(--radius-md);padding:14px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <div style="font-size:13px;font-weight:500">Daily profit summary</div>
              <div style="font-size:12px;color:var(--color-muted)">Yesterday's revenue, profit, top item · sent at 8am</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="toggle-daily" checked onchange="saveSchedule()">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Send to</label>
            <input type="email" id="email-daily" placeholder="your@email.com" onchange="saveSchedule()">
          </div>
        </div>

        <div style="border:0.5px solid var(--color-border);border-radius:var(--radius-md);padding:14px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <div style="font-size:13px;font-weight:500">Weekly P&L report</div>
              <div style="font-size:12px;color:var(--color-muted)">Full week summary · sent Monday 8am</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="toggle-weekly" onchange="saveSchedule()">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Send to</label>
            <input type="email" id="email-weekly" placeholder="your@email.com" onchange="saveSchedule()">
          </div>
        </div>

        <div style="border:0.5px solid var(--color-border);border-radius:var(--radius-md);padding:14px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <div style="font-size:13px;font-weight:500">Monthly accountant report</div>
              <div style="font-size:12px;color:var(--color-muted)">Full P&L + VAT Excel · sent 1st of each month</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="toggle-monthly" onchange="saveSchedule()">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Send to (accountant email)</label>
            <input type="email" id="email-monthly" placeholder="accountant@firm.com" onchange="saveSchedule()">
          </div>
        </div>

        <div style="border:0.5px solid var(--color-border);border-radius:var(--radius-md);padding:14px;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <div style="font-size:13px;font-weight:500">Low stock alerts</div>
              <div style="font-size:12px;color:var(--color-muted)">When items hit threshold · sent hourly if triggered</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="toggle-stock" checked onchange="saveSchedule()">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Send to</label>
            <input type="email" id="email-stock" placeholder="your@email.com" onchange="saveSchedule()">
          </div>
        </div>

        <button class="btn btn-primary" onclick="sendTestEmail()"><i class="ti ti-send"></i> Send test email</button>
        <div id="email-msg" style="margin-top:10px"></div>
      </div>

      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><span class="card-title">Send report now</span></div>
          <p style="font-size:12px;color:var(--color-muted);margin-bottom:14px">Manually trigger any report to be sent immediately</p>
          <div class="form-group">
            <label class="form-label">Report type</label>
            <select id="manual-report-type">
              <option value="daily">Daily profit summary</option>
              <option value="monthly_pl">Monthly P&L (current month)</option>
              <option value="monthly_vat">VAT return (current quarter)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Send to</label>
            <input type="email" id="manual-email" placeholder="email@example.com">
          </div>
          <button class="btn btn-primary" onclick="sendManualReport()"><i class="ti ti-send"></i> Send now</button>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">SMTP setup guide</span></div>
          <div style="font-size:12px;color:var(--color-muted);line-height:1.8">
            <strong>Gmail:</strong><br>
            SMTP_HOST=smtp.gmail.com<br>
            SMTP_PORT=587<br>
            SMTP_USER=you@gmail.com<br>
            SMTP_PASS=your-app-password<br><br>
            <strong>To get a Gmail app password:</strong><br>
            1. Google Account → Security<br>
            2. Enable 2-Step Verification<br>
            3. Search "App passwords"<br>
            4. Generate for "Mail"<br><br>
            <strong>Outlook/Office 365:</strong><br>
            SMTP_HOST=smtp.office365.com<br>
            SMTP_PORT=587
          </div>
        </div>
      </div>
    </div>`;

  // Add toggle switch styles
  const style = document.createElement('style');
  style.textContent = `.toggle-switch{position:relative;display:inline-block;width:40px;height:22px}.toggle-switch input{opacity:0;width:0;height:0}.toggle-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--color-border-md);border-radius:22px;transition:.3s}.toggle-slider:before{position:absolute;content:"";height:16px;width:16px;left:3px;bottom:3px;background:white;border-radius:50%;transition:.3s}.toggle-switch input:checked+.toggle-slider{background:#1a1a18}.toggle-switch input:checked+.toggle-slider:before{transform:translateX(18px)}`;
  document.head.appendChild(style);

  window.saveSchedule = () => {
    const schedule = {
      daily:   { enabled: document.getElementById('toggle-daily').checked,   email: document.getElementById('email-daily').value },
      weekly:  { enabled: document.getElementById('toggle-weekly').checked,  email: document.getElementById('email-weekly').value },
      monthly: { enabled: document.getElementById('toggle-monthly').checked, email: document.getElementById('email-monthly').value },
      stock:   { enabled: document.getElementById('toggle-stock').checked,   email: document.getElementById('email-stock').value },
    };
    localStorage.setItem('sellhub_email_schedule', JSON.stringify(schedule));
    UI.toast('Schedule saved', 'success');
  };

  window.sendTestEmail = async () => {
    const msg = document.getElementById('email-msg');
    try {
      await API.post('/api/email/test', {});
      msg.innerHTML = '<div class="alert alert-success">Test email sent! Check your inbox.</div>';
    } catch(err) {
      msg.innerHTML = `<div class="alert alert-danger">Could not send — check SMTP settings in .env<br><small>${err.message}</small></div>`;
    }
  };

  window.sendManualReport = async () => {
    const type  = document.getElementById('manual-report-type').value;
    const email = document.getElementById('manual-email').value;
    if (!email) { UI.toast('Please enter an email address', 'warning'); return; }
    try {
      await API.post('/api/email/send', { type, email });
      UI.toast('Report sent!', 'success');
    } catch(err) {
      UI.toast('Could not send — check SMTP settings', 'danger');
    }
  };

  // Restore saved schedule
  const saved = localStorage.getItem('sellhub_email_schedule');
  if (saved) {
    const s = JSON.parse(saved);
    if (s.daily?.email)   document.getElementById('email-daily').value   = s.daily.email;
    if (s.weekly?.email)  document.getElementById('email-weekly').value  = s.weekly.email;
    if (s.monthly?.email) document.getElementById('email-monthly').value = s.monthly.email;
    if (s.stock?.email)   document.getElementById('email-stock').value   = s.stock.email;
    if (s.weekly)  document.getElementById('toggle-weekly').checked  = s.weekly.enabled;
    if (s.monthly) document.getElementById('toggle-monthly').checked = s.monthly.enabled;
  }
}
