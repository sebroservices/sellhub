/**
 * backend/services/retentionService.js
 *
 * Manages permanent data storage — critical because eBay only returns
 * 90 days of orders/transactions via their API.
 *
 * Key jobs:
 *  1. takeInventorySnapshot()  — called daily, records stock levels at close of day
 *  2. checkRetentionHealth()   — warns if sync gap approaches 90 days
 *  3. lockFinancialPeriod()    — freezes a month's P&L once reconciled
 *  4. buildVatRecords()        — calculates VAT per order and writes to vat_records
 *  5. getInventoryAtDate()     — returns stock snapshot for any historical date
 */

const pool = require('../db/pool');

// ── 1. Daily inventory snapshot ───────────────────────────────────────────────
async function takeInventorySnapshot(sellerId, date = new Date()) {
  const snapshotDate = date.toISOString().slice(0, 10); // YYYY-MM-DD

  // Check if we already have today's snapshot
  const existing = await pool.query(
    'SELECT id FROM inventory_snapshots WHERE seller_id=$1 AND snapshot_date=$2 LIMIT 1',
    [sellerId, snapshotDate]
  );
  if (existing.rows.length) {
    console.log(`[retention] Snapshot already exists for ${snapshotDate}`);
    return;
  }

  const { rows: items } = await pool.query(
    'SELECT ebay_sku, title, category, quantity, buy_price, list_price FROM inventory WHERE seller_id=$1',
    [sellerId]
  );

  if (!items.length) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      await client.query(`
        INSERT INTO inventory_snapshots
          (seller_id, snapshot_date, ebay_sku, title, category, quantity, buy_price, list_price, total_value)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (seller_id, snapshot_date, ebay_sku) DO UPDATE SET
          quantity    = EXCLUDED.quantity,
          buy_price   = EXCLUDED.buy_price,
          list_price  = EXCLUDED.list_price,
          total_value = EXCLUDED.total_value
      `, [
        sellerId, snapshotDate,
        item.ebay_sku, item.title, item.category,
        item.quantity, item.buy_price, item.list_price,
        (parseFloat(item.quantity || 0) * parseFloat(item.buy_price || 0)).toFixed(2),
      ]);
    }
    await client.query('COMMIT');
    console.log(`[retention] Snapshot saved: ${items.length} items for ${snapshotDate}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── 2. Retention health check ─────────────────────────────────────────────────
async function checkRetentionHealth(sellerId) {
  const alerts = [];

  // Find the most recent successful sync
  const { rows: lastSync } = await pool.query(`
    SELECT started_at, oldest_order FROM sync_log
    WHERE seller_id=$1 AND status='success' AND sync_type IN ('orders','full')
    ORDER BY started_at DESC LIMIT 1
  `, [sellerId]);

  // Find oldest order in our DB
  const { rows: oldestOrder } = await pool.query(`
    SELECT MIN(order_date) AS oldest FROM orders WHERE seller_id=$1
  `, [sellerId]);

  const daysSinceSync = lastSync.length
    ? Math.floor((Date.now() - new Date(lastSync[0].started_at)) / 86400000)
    : 999;

  // eBay 90-day window — warn at 75 days since last sync of oldest data
  if (daysSinceSync > 7) {
    alerts.push({
      type: 'sync_overdue',
      severity: daysSinceSync > 30 ? 'critical' : 'warning',
      message: `Last eBay sync was ${daysSinceSync} days ago. Sync regularly to prevent data loss.`,
    });
  }

  // Check for any date gaps in our orders
  const { rows: gaps } = await pool.query(`
    WITH daily AS (
      SELECT order_date::date AS d, COUNT(*) AS cnt
      FROM orders WHERE seller_id=$1
      GROUP BY order_date::date
    ),
    date_series AS (
      SELECT generate_series(
        (SELECT MIN(d) FROM daily),
        (SELECT MAX(d) FROM daily),
        '1 day'::interval
      )::date AS d
    )
    SELECT ds.d AS gap_date
    FROM date_series ds
    LEFT JOIN daily ON daily.d = ds.d
    WHERE daily.d IS NULL
      AND ds.d < NOW() - INTERVAL '1 day'  -- exclude today
    ORDER BY ds.d
    LIMIT 10
  `, [sellerId]);

  if (gaps.length > 3) {
    alerts.push({
      type: 'data_gaps',
      severity: 'warning',
      message: `${gaps.length} days with no orders found — may indicate missing sync data.`,
      detail: gaps.map(g => g.gap_date).join(', '),
    });
  }

  // Write alerts to DB
  for (const alert of alerts) {
    await pool.query(`
      INSERT INTO retention_alerts (seller_id, alert_type, description)
      VALUES ($1, $2, $3)
    `, [sellerId, alert.type, alert.message]);
  }

  return {
    status:          alerts.some(a => a.severity === 'critical') ? 'critical' : alerts.length ? 'warning' : 'healthy',
    days_since_sync: daysSinceSync,
    oldest_order:    oldestOrder[0]?.oldest,
    alerts,
  };
}

// ── 3. Lock a financial period ────────────────────────────────────────────────
async function lockFinancialPeriod(sellerId, period, lockedBy = 'user') {
  // First, snapshot the current P&L figures for this period
  const { rows } = await pool.query(`
    SELECT
      COALESCE(SUM(sale_price),0)                                              AS gross_revenue,
      COALESCE(SUM(shipping_charged),0)                                        AS shipping_revenue,
      COALESCE(SUM(ebay_final_value_fee+ebay_per_order_fee+promoted_fee),0)    AS total_fees,
      COALESCE(SUM(ebay_final_value_fee),0)                                    AS fvf,
      COALESCE(SUM(ebay_per_order_fee),0)                                      AS per_order_fees,
      COALESCE(SUM(promoted_fee),0)                                            AS promoted_fees,
      COALESCE(SUM(cogs),0)                                                    AS cogs,
      COALESCE(SUM(shipping_cost),0)                                           AS shipping_cost,
      COALESCE(SUM(other_costs),0)                                             AS other_costs,
      COALESCE(SUM(net_profit),0)                                              AS net_profit,
      COUNT(*)::int                                                             AS order_count,
      COALESCE(SUM(vat_amount),0)                                              AS vat_on_sales,
      COALESCE(SUM(ebay_fee_vat),0)                                            AS vat_on_fees
    FROM orders
    WHERE seller_id=$1 AND TO_CHAR(order_date,'YYYY-MM')=$2
  `, [sellerId, period]);

  const p = rows[0];

  await pool.query(`
    INSERT INTO financial_periods (
      seller_id, period, period_type,
      gross_revenue, shipping_revenue, total_fees, fvf, per_order_fees,
      promoted_fees, cogs, shipping_cost, other_costs, net_profit,
      order_count, vat_on_sales, vat_on_fees,
      locked, locked_at, locked_by
    ) VALUES ($1,$2,'month',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,NOW(),$16)
    ON CONFLICT (seller_id, period, period_type) DO UPDATE SET
      gross_revenue    = EXCLUDED.gross_revenue,
      total_fees       = EXCLUDED.total_fees,
      net_profit       = EXCLUDED.net_profit,
      order_count      = EXCLUDED.order_count,
      locked           = true,
      locked_at        = NOW(),
      locked_by        = EXCLUDED.locked_by,
      updated_at       = NOW()
  `, [
    sellerId, period,
    p.gross_revenue, p.shipping_revenue, p.total_fees, p.fvf, p.per_order_fees,
    p.promoted_fees, p.cogs, p.shipping_cost, p.other_costs, p.net_profit,
    p.order_count, p.vat_on_sales, p.vat_on_fees,
    lockedBy,
  ]);

  return { period, locked: true, ...p };
}

// ── 4. Build VAT records for a period ────────────────────────────────────────
async function buildVatRecords(sellerId, period) {
  // Get seller's VAT settings
  const { rows: seller } = await pool.query(
    'SELECT vat_registered, vat_scheme, flat_rate_pct FROM sellers WHERE id=$1',
    [sellerId]
  );
  const s = seller[0];

  const { rows: orders } = await pool.query(`
    SELECT id, ebay_order_id, order_date, sale_price, shipping_charged,
           ebay_final_value_fee, ebay_per_order_fee, promoted_fee, cogs, buyer_country
    FROM orders
    WHERE seller_id=$1 AND TO_CHAR(order_date,'YYYY-MM')=$2
  `, [sellerId, period]);

  const vatRate = 20.00; // UK standard rate
  const quarter = `${period.slice(0,4)}-Q${Math.ceil(parseInt(period.slice(5,7))/3)}`;

  for (const o of orders) {
    const grossSale     = parseFloat(o.sale_price) + parseFloat(o.shipping_charged || 0);
    const vatAmount     = s.vat_registered ? parseFloat((grossSale * vatRate / (100 + vatRate)).toFixed(2)) : 0;
    const netSale       = parseFloat((grossSale - vatAmount).toFixed(2));
    const ebayFeeGross  = parseFloat(o.ebay_final_value_fee || 0) + parseFloat(o.ebay_per_order_fee || 0) + parseFloat(o.promoted_fee || 0);
    const ebayFeeVat    = s.vat_registered ? parseFloat((ebayFeeGross * vatRate / (100 + vatRate)).toFixed(2)) : 0;
    const ebayFeeNet    = parseFloat((ebayFeeGross - ebayFeeVat).toFixed(2));

    await pool.query(`
      INSERT INTO vat_records (
        seller_id, order_id, ebay_order_id, transaction_date, tax_period,
        buyer_country, vat_scheme, gross_sale, vat_rate, vat_amount, net_sale,
        ebay_fee_gross, ebay_fee_vat, ebay_fee_net, cogs, is_vat_registered
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (seller_id, ebay_order_id) DO UPDATE SET
        vat_amount    = EXCLUDED.vat_amount,
        net_sale      = EXCLUDED.net_sale,
        ebay_fee_vat  = EXCLUDED.ebay_fee_vat,
        ebay_fee_net  = EXCLUDED.ebay_fee_net
    `, [
      sellerId, o.id, o.ebay_order_id, o.order_date, quarter,
      o.buyer_country || 'GB', s.vat_scheme || 'STANDARD',
      grossSale, vatRate, vatAmount, netSale,
      ebayFeeGross, ebayFeeVat, ebayFeeNet,
      parseFloat(o.cogs || 0), s.vat_registered,
    ]);
  }

  return { period, orders_processed: orders.length };
}

// ── 5. Get inventory at any historical date ───────────────────────────────────
async function getInventoryAtDate(sellerId, date) {
  const targetDate = date.toISOString().slice(0, 10);

  // Find the closest snapshot on or before the requested date
  const { rows } = await pool.query(`
    SELECT
      s.ebay_sku, s.title, s.category, s.quantity,
      s.buy_price, s.list_price, s.total_value, s.snapshot_date
    FROM inventory_snapshots s
    WHERE s.seller_id = $1
      AND s.snapshot_date = (
        SELECT MAX(snapshot_date)
        FROM inventory_snapshots
        WHERE seller_id=$1 AND snapshot_date <= $2
      )
    ORDER BY s.category, s.title
  `, [sellerId, targetDate]);

  const totalValue = rows.reduce((sum, r) => sum + parseFloat(r.total_value || 0), 0);
  const totalUnits = rows.reduce((sum, r) => sum + parseInt(r.quantity || 0), 0);

  return {
    requested_date:  targetDate,
    snapshot_date:   rows[0]?.snapshot_date || null,
    items:           rows,
    total_value:     totalValue.toFixed(2),
    total_units:     totalUnits,
    item_count:      rows.length,
  };
}

// ── 6. Log a sync run ─────────────────────────────────────────────────────────
async function logSync(sellerId, syncType, data = {}) {
  const { rows } = await pool.query(`
    INSERT INTO sync_log (seller_id, sync_type, orders_synced, items_synced, oldest_order, newest_order, status, finished_at, ebay_api_calls)
    VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8)
    RETURNING id
  `, [
    sellerId, syncType,
    data.orders_synced || 0, data.items_synced || 0,
    data.oldest_order || null, data.newest_order || null,
    data.status || 'success',
    data.api_calls || 0,
  ]);
  return rows[0].id;
}

module.exports = {
  takeInventorySnapshot,
  checkRetentionHealth,
  lockFinancialPeriod,
  buildVatRecords,
  getInventoryAtDate,
  logSync,
};
