/**
 * routes/inventory.js
 * GET    /api/inventory          → list all items
 * POST   /api/inventory          → add item manually
 * PUT    /api/inventory/:id      → update item (buy price, notes, etc.)
 * DELETE /api/inventory/:id      → remove item
 * POST   /api/inventory/sync     → pull from eBay Inventory API
 * GET    /api/inventory/alerts   → low stock items
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth }   = require('../middleware/auth');
const { syncInventory } = require('../services/syncService');

// GET /api/inventory
router.get('/', requireAuth, async (req, res) => {
  try {
    const { search, category, lowStock, limit = 100, offset = 0 } = req.query;

    let where = ['i.seller_id = $1'];
    let params = [req.sellerId];
    let i = 2;

    if (search) {
      where.push(`(i.title ILIKE $${i} OR i.ebay_sku ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }
    if (category) {
      where.push(`i.category = $${i++}`);
      params.push(category);
    }
    if (lowStock === 'true') {
      where.push(`i.quantity <= (SELECT low_stock_threshold FROM sellers WHERE id = $1)`);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const { rows } = await pool.query(`
      SELECT i.*,
        CASE WHEN i.list_price > 0 AND i.buy_price > 0
          THEN ROUND(((i.list_price - i.buy_price) / i.list_price) * 100, 1)
          ELSE NULL
        END AS margin_pct
      FROM inventory i
      ${whereClause}
      ORDER BY i.quantity ASC, i.title ASC
      LIMIT $${i} OFFSET $${i+1}
    `, [...params, limit, offset]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/alerts
router.get('/alerts', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT i.*, s.low_stock_threshold
      FROM inventory i
      JOIN sellers s ON s.id = i.seller_id
      WHERE i.seller_id = $1 AND i.quantity <= s.low_stock_threshold
      ORDER BY i.quantity ASC
    `, [req.sellerId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory
router.post('/', requireAuth, async (req, res) => {
  try {
    const { ebay_sku, title, category, buy_price, list_price, quantity, condition, supplier, notes } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO inventory (seller_id, ebay_sku, title, category, buy_price, list_price, quantity, condition, supplier, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [req.sellerId, ebay_sku, title, category, buy_price, list_price, quantity, condition, supplier, notes]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/inventory/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { buy_price, list_price, quantity, supplier, notes, location } = req.body;
    const { rows } = await pool.query(`
      UPDATE inventory
      SET buy_price = COALESCE($1, buy_price),
          list_price = COALESCE($2, list_price),
          quantity = COALESCE($3, quantity),
          supplier = COALESCE($4, supplier),
          notes = COALESCE($5, notes),
          location = COALESCE($6, location),
          updated_at = NOW()
      WHERE id = $7 AND seller_id = $8
      RETURNING *
    `, [buy_price, list_price, quantity, supplier, notes, location, req.params.id, req.sellerId]);
    if (!rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM inventory WHERE id = $1 AND seller_id = $2',
      [req.params.id, req.sellerId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/sync
router.post('/sync', requireAuth, async (req, res) => {
  try {
    await syncInventory(req.sellerId);
    res.json({ success: true, message: 'Inventory synced from eBay.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// POST /api/inventory/apply-cogs — update cogs on all orders matching a SKU
router.post('/apply-cogs', requireAuth, async (req, res) => {
  try {
    const { inventory_id, buy_price } = req.body;
    const { rows: inv } = await pool.query(
      'SELECT ebay_sku FROM inventory WHERE id=$1 AND seller_id=$2',
      [inventory_id, req.sellerId]
    );
    if (!inv.length) return res.status(404).json({ error: 'Item not found' });

    const sku = inv[0].ebay_sku;
    if (!sku) return res.json({ updated: 0 });

    // Update all orders with this SKU where cogs = 0
    const result = await pool.query(`
      UPDATE orders
      SET cogs = $1,
          net_profit = sale_price + shipping_charged
            - ebay_final_value_fee - ebay_per_order_fee - promoted_fee
            - shipping_cost - $1 - other_costs
      WHERE seller_id = $2 AND ebay_sku = $3 AND cogs = 0
    `, [buy_price, req.sellerId, sku]);

    res.json({ updated: result.rowCount, sku });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
