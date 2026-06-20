const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM suppliers WHERE seller_id=$1 ORDER BY name', [req.sellerId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, website, contact, notes } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO suppliers (seller_id, name, website, contact, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.sellerId, name, website, contact, notes]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM suppliers WHERE id=$1 AND seller_id=$2', [req.params.id, req.sellerId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
