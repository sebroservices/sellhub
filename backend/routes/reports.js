const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const retention = require('../services/retentionService');

router.get('/periods', requireAuth, async (req, res) => {
  try {
    const { rows: months } = await pool.query(`SELECT DISTINCT TO_CHAR(order_date,'YYYY-MM') AS period, TO_CHAR(order_date,'Mon YYYY') AS label, COUNT(*)::int AS orders, ROUND(SUM(net_profit)::numeric,2) AS profit FROM orders WHERE seller_id=$1 GROUP BY TO_CHAR(order_date,'YYYY-MM'), TO_CHAR(order_date,'Mon YYYY') ORDER BY period DESC`, [req.sellerId]);
    const { rows: years } = await pool.query(`SELECT DISTINCT EXTRACT(YEAR FROM order_date)::int AS year FROM orders WHERE seller_id=$1 ORDER BY year DESC`, [req.sellerId]);
    res.json({ months, years: years.map(y => y.year) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/health', requireAuth, async (req, res) => {
  try {
    const health = await retention.checkRetentionHealth(req.sellerId);
    res.json(health);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/snapshot', requireAuth, async (req, res) => {
  try {
    const date = req.body.date ? new Date(req.body.date) : new Date();
    await retention.takeInventorySnapshot(req.sellerId, date);
    res.json({ success: true, date: date.toISOString().slice(0, 10) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/lock/:period', requireAuth, async (req, res) => {
  try {
    const result = await retention.lockFinancialPeriod(req.sellerId, req.params.period, req.session.username);
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/vat/build/:period', requireAuth, async (req, res) => {
  try {
    const result = await retention.buildVatRecords(req.sellerId, req.params.period);
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;