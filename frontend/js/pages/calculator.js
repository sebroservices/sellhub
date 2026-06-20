/** pages/calculator.js */
function loadCalculator() {
  document.getElementById('page-calculator').innerHTML = `
    <div class="page-header">
      <div class="page-title">Fee calculator</div>
      <div class="page-sub">Calculate true profit before sourcing or listing</div>
    </div>
    <div class="two-col">
      <div class="card">
        <div class="card-title" style="margin-bottom:16px">Inputs</div>
        <div class="form-group"><label class="form-label">Item cost / buy price (£)</label><input type="number" id="c-cost" value="25" step="0.01" oninput="runCalc()"></div>
        <div class="form-group"><label class="form-label">Sale price (£)</label><input type="number" id="c-sale" value="65" step="0.01" oninput="runCalc()"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Shipping charged to buyer (£)</label><input type="number" id="c-ship-in" value="3.99" step="0.01" oninput="runCalc()"></div>
          <div class="form-group"><label class="form-label">Your actual shipping cost (£)</label><input type="number" id="c-ship-out" value="4.50" step="0.01" oninput="runCalc()"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Category</label>
            <select id="c-cat" onchange="runCalc()">
              <option value="13.25">General (13.25%)</option>
              <option value="12.35">Clothing / Shoes (12.35%)</option>
              <option value="12.55">Electronics (12.55%)</option>
              <option value="15.00">Books / DVDs (15.00%)</option>
              <option value="12.35">Garden & DIY (12.35%)</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Store discount</label>
            <select id="c-store" onchange="runCalc()">
              <option value="0">No store (0%)</option>
              <option value="0.3">Basic / Featured / Anchor (–0.3%)</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Promoted listing %</label><input type="number" id="c-promo" value="0" step="0.1" oninput="runCalc()"></div>
          <div class="form-group"><label class="form-label">Other costs (packaging, £)</label><input type="number" id="c-other" value="0.50" step="0.01" oninput="runCalc()"></div>
        </div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="profit-result">
            <div style="font-size:12px;color:var(--color-muted);margin-bottom:6px">Net profit</div>
            <div class="profit-number pos" id="c-result">£0.00</div>
            <div class="profit-meta" id="c-meta">ROI: 0%  ·  Margin: 0%</div>
          </div>
          <table>
            <tbody>
              <tr><td style="color:var(--color-muted)">Sale price</td><td style="text-align:right" id="r-sale">—</td></tr>
              <tr><td style="color:var(--color-muted)">eBay final value fee</td><td style="text-align:right;color:var(--color-danger)" id="r-fvf">—</td></tr>
              <tr><td style="color:var(--color-muted)">Per-order fee</td><td style="text-align:right;color:var(--color-danger)">–£0.30</td></tr>
              <tr><td style="color:var(--color-muted)">Promoted listing fee</td><td style="text-align:right;color:var(--color-danger)" id="r-promo">—</td></tr>
              <tr><td style="color:var(--color-muted)">Net shipping cost</td><td style="text-align:right;color:var(--color-danger)" id="r-ship">—</td></tr>
              <tr><td style="color:var(--color-muted)">Item cost (COGS)</td><td style="text-align:right;color:var(--color-danger)" id="r-cogs">—</td></tr>
              <tr><td style="color:var(--color-muted)">Other costs</td><td style="text-align:right;color:var(--color-danger)" id="r-other">—</td></tr>
              <tr style="border-top:0.5px solid var(--color-border)"><td style="font-weight:500">Max buy for 30% ROI</td><td style="text-align:right;font-weight:500;color:var(--color-success)" id="r-max">—</td></tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <div class="card-title" style="margin-bottom:10px">Verdict</div>
          <div id="c-tip" style="font-size:13px;color:var(--color-muted);line-height:1.7"></div>
        </div>
      </div>
    </div>`;

  window.runCalc = async () => {
    try {
      const body = {
        sale_price:     document.getElementById('c-sale').value,
        item_cost:      document.getElementById('c-cost').value,
        shipping_in:    document.getElementById('c-ship-in').value,
        shipping_out:   document.getElementById('c-ship-out').value,
        fvf_pct:        document.getElementById('c-cat').value,
        store_discount: document.getElementById('c-store').value,
        promo_pct:      document.getElementById('c-promo').value,
        other_costs:    document.getElementById('c-other').value,
      };
      const r = await API.calculate(body);

      const el = document.getElementById('c-result');
      el.textContent = `£${r.net_profit}`;
      el.className = `profit-number ${parseFloat(r.net_profit) >= 0 ? 'pos' : 'neg'}`;
      document.getElementById('c-meta').textContent = `ROI: ${r.roi_pct}%  ·  Margin: ${r.margin_pct}%`;
      document.getElementById('r-sale').textContent  = `£${r.sale_price}`;
      document.getElementById('r-fvf').textContent   = `–£${r.fvf} (${r.fvf_pct}%)`;
      document.getElementById('r-promo').textContent = `–£${r.promo_fee}`;
      document.getElementById('r-ship').textContent  = `–£${r.net_shipping}`;
      document.getElementById('r-cogs').textContent  = `–£${r.item_cost}`;
      document.getElementById('r-other').textContent = `–£${r.other_costs}`;
      document.getElementById('r-max').textContent   = `£${r.max_buy_30roi}`;

      const roi = parseFloat(r.roi_pct);
      const tips = [
        [50,  '🟢 Great ROI — this is a strong sourcing opportunity at this price.'],
        [30,  '🟡 Solid margin. Factor in ~5% returns to stress-test the numbers.'],
        [15,  '🟠 Marginal. Try negotiating a lower buy price or raising the list price.'],
        [0,   '🔴 Low ROI — only worth it at higher volume or if you can source cheaper.'],
        [-Infinity, '❌ Loss-making at these numbers. Adjust buy price or sale price.'],
      ];
      document.getElementById('c-tip').textContent = tips.find(([t]) => roi >= t)?.[1] || '';
    } catch(e) { /* silent — API may not be available */ }
  };

  runCalc();
}


/** pages/settings.js */
async function loadSettings() {
  const page = document.getElementById('page-settings');
  page.innerHTML = `
    <div class="page-header">
      <div class="page-title">Settings</div>
      <div class="page-sub">Configure your store and preferences</div>
    </div>
    <div class="card" style="max-width:520px">
      <div class="card-header"><span class="card-title">Store settings</span></div>
      <div id="settings-form"><div class="loading"><span class="spinner"></span>Loading…</div></div>
    </div>`;

  try {
    const s = await API.settings();
    document.getElementById('settings-form').innerHTML = `
      <div class="form-group"><label class="form-label">eBay username</label><input type="text" value="${s.ebay_username || ''}" disabled style="opacity:0.6"></div>
      <div class="form-group"><label class="form-label">Marketplace</label>
        <select id="s-market">
          <option value="EBAY_GB" ${s.marketplace==='EBAY_GB'?'selected':''}>UK (ebay.co.uk)</option>
          <option value="EBAY_US" ${s.marketplace==='EBAY_US'?'selected':''}>US (ebay.com)</option>
          <option value="EBAY_DE" ${s.marketplace==='EBAY_DE'?'selected':''}>Germany (ebay.de)</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Store subscription</label>
        <select id="s-store">
          <option value="NONE">No store</option>
          <option value="BASIC" ${s.store_subscription==='BASIC'?'selected':''}>Basic</option>
          <option value="FEATURED" ${s.store_subscription==='FEATURED'?'selected':''}>Featured</option>
          <option value="ANCHOR" ${s.store_subscription==='ANCHOR'?'selected':''}>Anchor</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Target ROI (%)</label><input type="number" id="s-roi" value="${s.target_roi || 30}"></div>
        <div class="form-group"><label class="form-label">Default shipping cost (£)</label><input type="number" id="s-ship" value="${s.default_shipping_cost || 3.50}" step="0.01"></div>
      </div>
      <div class="form-group"><label class="form-label">Low stock alert threshold (units)</label><input type="number" id="s-low" value="${s.low_stock_threshold || 3}"></div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-primary" onclick="saveSettings()"><i class="ti ti-check"></i> Save settings</button>
        <button class="btn" onclick="API.syncAll().then(()=>UI.toast('Full sync started — this may take a minute','info'))"><i class="ti ti-refresh"></i> Sync all eBay data</button>
      </div>`;
  } catch (err) { UI.error('settings-form', err.message); }

  window.saveSettings = async () => {
    try {
      await API.saveSettings({
        marketplace:           document.getElementById('s-market').value,
        store_subscription:    document.getElementById('s-store').value,
        target_roi:            document.getElementById('s-roi').value,
        default_shipping_cost: document.getElementById('s-ship').value,
        low_stock_threshold:   document.getElementById('s-low').value,
      });
      UI.toast('Settings saved', 'success');
    } catch (err) { UI.toast(err.message, 'danger'); }
  };
}

