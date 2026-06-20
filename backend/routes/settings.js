/**
 * routes/settings.js
 * GET  /api/settings   → fetch seller settings
 * PUT  /api/settings   → update seller settings
 * POST /api/sync/all   → trigger full eBay sync
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { syncAll }     = require('../services/syncService');

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ebay_username, marketplace, store_subscription, target_roi,
              default_shipping_cost, low_stock_threshold
       FROM sellers WHERE id = $1`,
      [req.sellerId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const {
      marketplace, store_subscription, target_roi,
      default_shipping_cost, low_stock_threshold,
    } = req.body;

    const { rows } = await pool.query(`
      UPDATE sellers SET
        marketplace           = COALESCE($1, marketplace),
        store_subscription    = COALESCE($2, store_subscription),
        target_roi            = COALESCE($3, target_roi),
        default_shipping_cost = COALESCE($4, default_shipping_cost),
        low_stock_threshold   = COALESCE($5, low_stock_threshold),
        updated_at            = NOW()
      WHERE id = $6
      RETURNING *
    `, [marketplace, store_subscription, target_roi, default_shipping_cost, low_stock_threshold, req.sellerId]);

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/all
router.post('/sync/all', requireAuth, async (req, res) => {
  try {
    res.json({ success: true, message: 'Sync started in background.' });
    syncAll(req.sellerId).catch(err => console.error('Background sync error:', err));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
