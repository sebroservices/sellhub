/**
 * routes/orders.js
 * GET  /api/orders          → list orders (with filtering & pagination)
 * GET  /api/orders/:id      → single order detail
 * POST /api/orders/sync     → trigger eBay sync
 * GET  /api/orders/summary  → totals for dashboard
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { syncOrders }  = require('../services/syncService');

// GET /api/orders
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, search, limit = 50, offset = 0, month } = req.query;

    let where = ['seller_id = $1'];
    let params = [req.sellerId];
    let i = 2;

    if (status) {
      where.push(`fulfillment_status = $${i++}`);
      params.push(status.toUpperCase());
    }

    if (search) {
      where.push(`(item_title ILIKE $${i} OR buyer_username ILIKE $${i} OR ebay_order_id ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }

    if (month) {
      // Expect format YYYY-MM
      where.push(`TO_CHAR(order_date, 'YYYY-MM') = $${i++}`);
      params.push(month);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT * FROM orders ${whereClause} ORDER BY order_date DESC LIMIT $${i} OFFSET $${i+1}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM orders ${whereClause}`, params),
    ]);

    res.json({
      orders: rows.rows,
      total: parseInt(count.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    console.error('[orders sync error]', JSON.stringify(err?.response?.data || err.message, null, 2));
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/summary
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const { month } = req.query;
    const monthFilter = month ? `AND TO_CHAR(order_date, 'YYYY-MM') = $2` : '';
    const params = month ? [req.sellerId, month] : [req.sellerId];

    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int                        AS order_count,
        COALESCE(SUM(sale_price), 0)         AS total_revenue,
        COALESCE(SUM(net_profit), 0)         AS total_profit,
        COALESCE(SUM(ebay_final_value_fee + ebay_per_order_fee + promoted_fee), 0) AS total_fees,
        COALESCE(SUM(cogs), 0)               AS total_cogs,
        COALESCE(SUM(shipping_cost), 0)      AS total_shipping_cost,
        COALESCE(AVG(net_profit), 0)         AS avg_profit_per_order
      FROM orders
      WHERE seller_id = $1 ${monthFilter}
    `, params);

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM orders WHERE seller_id = $1 AND id = $2',
      [req.sellerId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/sync
router.post('/sync', requireAuth, async (req, res) => {
  try {
    await syncOrders(req.sellerId);
    res.json({ success: true, message: 'Orders synced from eBay.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
