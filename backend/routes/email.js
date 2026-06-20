const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { sendTestEmail, sendDailySummary } = require('../jobs/emailAlerts');

router.post('/test', requireAuth, async (req, res) => {
  try {
    await sendTestEmail(req.sellerId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/send', requireAuth, async (req, res) => {
  try {
    const { type } = req.body;
    const { rows } = await require('../db/pool').query('SELECT ebay_username FROM sellers WHERE id=$1', [req.sellerId]);
    if (type === 'daily') await sendDailySummary(req.sellerId, rows[0]?.ebay_username);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
