const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT goals FROM sellers WHERE id=$1', [req.sellerId]);
    res.json(rows[0]?.goals || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE sellers SET goals=$1 WHERE id=$2', [JSON.stringify(req.body), req.sellerId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
