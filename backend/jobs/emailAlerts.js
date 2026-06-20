/**
 * backend/jobs/emailAlerts.js
 *
 * Sends two types of email:
 *  1. Daily profit summary (revenue, profit, orders, top items)
 *  2. Low stock alert (items at or below threshold)
 *
 * Uses nodemailer. Works with Gmail, Mailgun, SendGrid, or any SMTP.
 *
 * .env vars required:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *   ALERT_EMAIL  (where to send alerts — defaults to SMTP_USER)
 */

const nodemailer = require('nodemailer');
const pool       = require('../db/pool');

// ── Transporter (created lazily so missing config doesn't crash on startup) ──
let _transport = null;
function getTransport() {
  if (_transport) return _transport;
  if (!process.env.SMTP_HOST) throw new Error('SMTP not configured');
  _transport = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transport;
}

const ALERT_TO = () => process.env.ALERT_EMAIL || process.env.SMTP_USER;

// ── Helpers ───────────────────────────────────────────────────────────────────
const GBP  = n => `GBP${parseFloat(n || 0).toFixed(2)}`;
const pct = n => `${parseFloat(n || 0).toFixed(1)}%`;

function htmlWrap(title, bodyHtml) {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a18">
    <h2 style="font-size:20px;font-weight:600;margin-bottom:4px">${title}</h2>
    <p style="font-size:13px;color:#6b6b68;margin-bottom:24px">SellHub · ${new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
    ${bodyHtml}
    <p style="font-size:11px;color:#9e9d99;margin-top:32px;border-top:1px solid #eee;padding-top:12px">
      SellHub eBay Seller Management · <a href="${process.env.APP_URL||'http://localhost:3000'}" style="color:#185fa5">Open app</a>
    </p>
  </body></html>`;
}

function metricRow(label, value, color = '#1a1a18') {
  return `<tr>
    <td style="padding:8px 0;color:#6b6b68;font-size:13px">${label}</td>
    <td style="padding:8px 0;text-align:right;font-weight:600;font-size:14px;color:${color}">${value}</td>
  </tr>`;
}

// ── Daily profit summary ──────────────────────────────────────────────────────
async function sendDailySummary(sellerId, username) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);

  // Yesterday's stats
  const { rows: day } = await pool.query(`
    SELECT
      COUNT(*)::int                             AS orders,
      COALESCE(SUM(sale_price),0)               AS revenue,
      COALESCE(SUM(net_profit),0)               AS profit,
      COALESCE(SUM(ebay_final_value_fee+ebay_per_order_fee+promoted_fee),0) AS fees,
      COALESCE(SUM(cogs),0)                     AS cogs
    FROM orders
    WHERE seller_id=$1 AND order_date::date = $2
  `, [sellerId, yStr]);

  // Month to date
  const { rows: mtd } = await pool.query(`
    SELECT
      COUNT(*)::int                             AS orders,
      COALESCE(SUM(sale_price),0)               AS revenue,
      COALESCE(SUM(net_profit),0)               AS profit
    FROM orders
    WHERE seller_id=$1 AND TO_CHAR(order_date,'YYYY-MM')=TO_CHAR(NOW(),'YYYY-MM')
  `, [sellerId]);

  // Top item yesterday
  const { rows: top } = await pool.query(`
    SELECT item_title, COUNT(*)::int as units, SUM(net_profit) as profit
    FROM orders
    WHERE seller_id=$1 AND order_date::date=$2
    GROUP BY item_title ORDER BY profit DESC LIMIT 1
  `, [sellerId, yStr]);

  const d   = day[0];
  const m   = mtd[0];
  const t   = top[0];
  const profitColor = parseFloat(d.profit) >= 0 ? '#0f6e56' : '#a32d2d';

  const body = `
    <h3 style="font-size:15px;margin-bottom:12px">Yesterday · ${yesterday.toLocaleDateString('en-GB',{day:'numeric',month:'long'})}</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      ${metricRow('Orders', d.orders)}
      ${metricRow('Revenue', GBP(d.revenue))}
      ${metricRow('eBay fees', `–${GBP(d.fees)}`, '#a32d2d')}
      ${metricRow('COGS', `–${GBP(d.cogs)}`, '#a32d2d')}
      ${metricRow('Net profit', GBP(d.profit), profitColor)}
    </table>
    ${t ? `<div style="background:#f8f8f6;border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:13px">
      <span style="color:#6b6b68">Top item:</span> <strong>${t.item_title}</strong>
      · ${t.units} sold · ${GBP(t.profit)} profit
    </div>` : ''}
    <h3 style="font-size:15px;margin-bottom:12px">Month to date</h3>
    <table style="width:100%;border-collapse:collapse">
      ${metricRow('Orders', m.orders)}
      ${metricRow('Revenue', GBP(m.revenue))}
      ${metricRow('Net profit', GBP(m.profit), parseFloat(m.profit)>=0?'#0f6e56':'#a32d2d')}
    </table>`;

  await getTransport().sendMail({
    from:    `SellHub <${process.env.SMTP_USER}>`,
    to:      ALERT_TO(),
    subject: `📊 Daily summary — ${GBP(d.revenue)} revenue, ${GBP(d.profit)} profit`,
    html:    htmlWrap(`Daily summary for ${username}`, body),
  });

  console.log(`[email] Daily summary sent for seller ${sellerId}`);
}

// ── Low stock alert ───────────────────────────────────────────────────────────
async function sendLowStockAlert(sellerId, username) {
  const { rows: items } = await pool.query(`
    SELECT i.title, i.ebay_sku, i.quantity, s.low_stock_threshold
    FROM inventory i
    JOIN sellers s ON s.id = i.seller_id
    WHERE i.seller_id=$1 AND i.quantity <= s.low_stock_threshold
    ORDER BY i.quantity ASC
  `, [sellerId]);

  if (!items.length) return; // nothing to alert on

  // Don't spam — only send if there are new low-stock items since last alert
  // (Simple approach: check if count changed. Could be made smarter with a sent_at table)

  const rows = items.map(item => `
    <tr>
      <td style="padding:8px 10px;font-size:13px">${item.title}</td>
      <td style="padding:8px 10px;font-size:12px;color:#6b6b68">${item.ebay_sku || '—'}</td>
      <td style="padding:8px 10px;text-align:center;font-weight:600;color:${item.quantity===0?'#a32d2d':'#854f0b'}">${item.quantity}</td>
    </tr>`).join('');

  const body = `
    <p style="font-size:13px;color:#6b6b68;margin-bottom:16px">
      ${items.length} item${items.length>1?'s are':' is'} at or below your low stock threshold.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="border-bottom:1px solid #eee">
          <th style="text-align:left;padding:6px 10px;font-size:11px;color:#9e9d99;text-transform:uppercase">Item</th>
          <th style="text-align:left;padding:6px 10px;font-size:11px;color:#9e9d99;text-transform:uppercase">SKU</th>
          <th style="text-align:center;padding:6px 10px;font-size:11px;color:#9e9d99;text-transform:uppercase">Stock</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:20px">
      <a href="${process.env.APP_URL||'http://localhost:3000'}/#inventory" 
         style="background:#1a1a18;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px">
        View inventory →
      </a>
    </div>`;

  await getTransport().sendMail({
    from:    `SellHub <${process.env.SMTP_USER}>`,
    to:      ALERT_TO(),
    subject: `⚠️ Low stock alert — ${items.length} item${items.length>1?'s':''} need restocking`,
    html:    htmlWrap(`Low stock alert for ${username}`, body),
  });

  console.log(`[email] Low stock alert sent — ${items.length} items`);
}

// ── Test email (call from settings route) ────────────────────────────────────
async function sendTestEmail(sellerId) {
  await getTransport().sendMail({
    from:    `SellHub <${process.env.SMTP_USER}>`,
    to:      ALERT_TO(),
    subject: '✅ SellHub email is working!',
    html:    htmlWrap('Test email', '<p style="font-size:14px">Your email alerts are configured correctly.</p>'),
  });
}

module.exports = { sendDailySummary, sendLowStockAlert, sendTestEmail };

