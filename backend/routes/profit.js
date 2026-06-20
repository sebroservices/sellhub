/**
 * routes/profit.js
 * GET /api/profit/summary       → P&L totals for a period
 * GET /api/profit/monthly       → month-by-month breakdown
 * GET /api/profit/top-items     → most profitable SKUs
 * GET /api/profit/fees          → fee breakdown
 * POST /api/profit/calculate    → one-off fee calculator (no auth needed)
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// GET /api/profit/summary?from=2026-01-01&to=2026-06-30
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [req.sellerId];
    let dateFilter = '';
    if (from && to) {
      dateFilter = 'AND order_date BETWEEN $2 AND $3';
      params.push(from, to);
    }

    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(sale_price), 0)::NUMERIC(10,2)              AS gross_revenue,
        COALESCE(SUM(shipping_charged), 0)::NUMERIC(10,2)        AS shipping_revenue,
        COALESCE(SUM(ebay_final_value_fee), 0)::NUMERIC(10,2)    AS fvf_total,
        COALESCE(SUM(ebay_per_order_fee), 0)::NUMERIC(10,2)      AS per_order_total,
        COALESCE(SUM(promoted_fee), 0)::NUMERIC(10,2)            AS promoted_total,
        COALESCE(SUM(shipping_cost), 0)::NUMERIC(10,2)           AS shipping_cost_total,
        COALESCE(SUM(cogs), 0)::NUMERIC(10,2)                    AS cogs_total,
        COALESCE(SUM(other_costs), 0)::NUMERIC(10,2)             AS other_costs_total,
        COALESCE(SUM(net_profit), 0)::NUMERIC(10,2)              AS net_profit,
        COUNT(*)::INT                                             AS order_count,
        CASE WHEN SUM(sale_price) > 0
          THEN ROUND((SUM(net_profit) / SUM(sale_price)) * 100, 1)
          ELSE 0
        END                                                       AS margin_pct,
        CASE WHEN SUM(cogs) > 0
          THEN ROUND((SUM(net_profit) / SUM(cogs)) * 100, 1)
          ELSE 0
        END                                                       AS roi_pct
      FROM orders
      WHERE seller_id = $1 ${dateFilter}
    `, params);

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/profit/monthly?year=2026
router.get('/monthly', requireAuth, async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const { rows } = await pool.query(`
      SELECT
        TO_CHAR(order_date, 'Mon')                    AS month_label,
        TO_CHAR(order_date, 'YYYY-MM')                AS month,
        COALESCE(SUM(sale_price), 0)::NUMERIC(10,2)   AS revenue,
        COALESCE(SUM(net_profit), 0)::NUMERIC(10,2)   AS profit,
        COUNT(*)::INT                                  AS orders
      FROM orders
      WHERE seller_id = $1
        AND EXTRACT(YEAR FROM order_date) = $2
      GROUP BY month, month_label
      ORDER BY month ASC
    `, [req.sellerId, year]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/profit/top-items?limit=10
router.get('/top-items', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const { rows } = await pool.query(`
      SELECT
        item_title,
        ebay_sku,
        COUNT(*)::INT                                AS units_sold,
        COALESCE(SUM(sale_price), 0)::NUMERIC(10,2) AS revenue,
        COALESCE(SUM(cogs), 0)::NUMERIC(10,2)       AS total_cogs,
        COALESCE(SUM(net_profit), 0)::NUMERIC(10,2) AS total_profit,
        CASE WHEN SUM(cogs) > 0
          THEN ROUND((SUM(net_profit) / SUM(cogs)) * 100, 1)
          ELSE 0
        END                                          AS roi_pct
      FROM orders
      WHERE seller_id = $1
      GROUP BY item_title, ebay_sku
      ORDER BY total_profit DESC
      LIMIT $2
    `, [req.sellerId, limit]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/profit/fees
router.get('/fees', requireAuth, async (req, res) => {
  try {
    const { month } = req.query;
    const monthFilter = month ? `AND TO_CHAR(order_date, 'YYYY-MM') = $2` : '';
    const params = month ? [req.sellerId, month] : [req.sellerId];

    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(ebay_final_value_fee), 0)::NUMERIC(10,2) AS fvf,
        COALESCE(SUM(ebay_per_order_fee), 0)::NUMERIC(10,2)   AS per_order,
        COALESCE(SUM(promoted_fee), 0)::NUMERIC(10,2)         AS promoted,
        COALESCE(SUM(ebay_final_value_fee + ebay_per_order_fee + promoted_fee), 0)::NUMERIC(10,2) AS total_fees,
        CASE WHEN SUM(sale_price) > 0
          THEN ROUND(SUM(ebay_final_value_fee + ebay_per_order_fee + promoted_fee) / SUM(sale_price) * 100, 2)
          ELSE 0
        END AS fee_pct_of_sales
      FROM orders
      WHERE seller_id = $1 ${monthFilter}
    `, params);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/profit/calculate  (no auth — used by public fee calculator)
router.post('/calculate', (req, res) => {
  const {
    sale_price     = 0,
    item_cost      = 0,
    shipping_in    = 0,
    shipping_out   = 0,
    fvf_pct        = 13.25,
    store_discount = 0,
    promo_pct      = 0,
    other_costs    = 0,
  } = req.body;

  const total_sale = parseFloat(sale_price) + parseFloat(shipping_in);
  const effective_fvf_pct = Math.max(0, parseFloat(fvf_pct) - parseFloat(store_discount));
  const fvf          = total_sale * (effective_fvf_pct / 100);
  const promo_fee    = parseFloat(sale_price) * (parseFloat(promo_pct) / 100);
  const per_order    = 0.30;
  const net_shipping = parseFloat(shipping_out) - parseFloat(shipping_in);
  const profit       = parseFloat(sale_price) - fvf - promo_fee - per_order - net_shipping - parseFloat(item_cost) - parseFloat(other_costs);
  const roi          = parseFloat(item_cost) > 0 ? (profit / parseFloat(item_cost)) * 100 : 0;
  const margin       = parseFloat(sale_price) > 0 ? (profit / parseFloat(sale_price)) * 100 : 0;
  const max_buy_for_30_roi = (parseFloat(sale_price) - fvf - promo_fee - per_order - net_shipping - parseFloat(other_costs)) / 1.30;

  res.json({
    sale_price:   parseFloat(sale_price).toFixed(2),
    fvf:          fvf.toFixed(2),
    fvf_pct:      effective_fvf_pct.toFixed(2),
    promo_fee:    promo_fee.toFixed(2),
    per_order_fee: per_order.toFixed(2),
    net_shipping: net_shipping.toFixed(2),
    item_cost:    parseFloat(item_cost).toFixed(2),
    other_costs:  parseFloat(other_costs).toFixed(2),
    net_profit:   profit.toFixed(2),
    roi_pct:      roi.toFixed(1),
    margin_pct:   margin.toFixed(1),
    max_buy_30roi: Math.max(0, max_buy_for_30_roi).toFixed(2),
    is_profitable: profit > 0,
  });
});

module.exports = router;
