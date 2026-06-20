/**
 * backend/routes/import.js
 *
 * POST /api/import/buy-prices   → CSV with columns: sku, buy_price
 * POST /api/import/inventory    → CSV with full inventory columns
 * GET  /api/import/template     → download a blank CSV template
 *
 * Uses multer for file upload + csv-parse for parsing.
 * Install: npm install multer csv-parse
 */

const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const { parse } = require('csv-parse/sync');
const pool      = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(csv|txt)$/i)) {
      return cb(new Error('Only CSV files are accepted'));
    }
    cb(null, true);
  },
});

// ── GET /api/import/template — download blank CSV ──────────────────────────
router.get('/template', requireAuth, (req, res) => {
  const csv = [
    'sku,title,category,buy_price,list_price,quantity,supplier,notes',
    'NK-AM90-BK10,Nike Air Max 90 Black UK10,Footwear,42.00,89.99,5,Sports Direct,',
    'SN-XM5-BK,Sony WH-1000XM5,Electronics,98.00,179.99,3,CeX,',
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sellhub-inventory-template.csv"');
  res.send(csv);
});

// ── GET /api/import/buy-prices-template ────────────────────────────────────
router.get('/buy-prices-template', requireAuth, (req, res) => {
  const csv = ['sku,buy_price', 'NK-AM90-BK10,42.00', 'SN-XM5-BK,98.00'].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sellhub-buy-prices-template.csv"');
  res.send(csv);
});

// ── POST /api/import/buy-prices ────────────────────────────────────────────
router.post('/buy-prices', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const records = parse(req.file.buffer.toString('utf8'), {
      columns:          true,
      skip_empty_lines: true,
      trim:             true,
    });

    const required = ['sku', 'buy_price'];
    const missing  = required.filter(c => !Object.keys(records[0] || {}).includes(c));
    if (missing.length) {
      return res.status(400).json({ error: `Missing columns: ${missing.join(', ')}. Required: sku, buy_price` });
    }

    let updated = 0, skipped = 0, errors = [];

    for (const row of records) {
      const sku      = row.sku?.trim();
      const buyPrice = parseFloat(row.buy_price);

      if (!sku || isNaN(buyPrice) || buyPrice < 0) {
        errors.push(`Row skipped: invalid data (sku="${sku}", buy_price="${row.buy_price}")`);
        skipped++;
        continue;
      }

      const result = await pool.query(
        'UPDATE inventory SET buy_price=$1, updated_at=NOW() WHERE seller_id=$2 AND ebay_sku=$3',
        [buyPrice, req.sellerId, sku]
      );

      if (result.rowCount > 0) updated++;
      else {
        errors.push(`SKU not found: ${sku}`);
        skipped++;
      }
    }

    res.json({
      success: true,
      total:   records.length,
      updated,
      skipped,
      errors:  errors.slice(0, 20), // cap at 20 error messages
    });

  } catch (err) {
    res.status(400).json({ error: 'CSV parse error: ' + err.message });
  }
});

// ── POST /api/import/inventory — full inventory upload ──────────────────────
router.post('/inventory', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const records = parse(req.file.buffer.toString('utf8'), {
      columns:          true,
      skip_empty_lines: true,
      trim:             true,
    });

    if (!records.length) return res.status(400).json({ error: 'CSV is empty' });

    const required = ['sku', 'title'];
    const cols     = Object.keys(records[0]);
    const missing  = required.filter(c => !cols.includes(c));
    if (missing.length) {
      return res.status(400).json({ error: `Missing required columns: ${missing.join(', ')}` });
    }

    let created = 0, updated = 0, errors = [];

    for (const row of records) {
      try {
        await pool.query(`
          INSERT INTO inventory (seller_id, ebay_sku, title, category, buy_price, list_price, quantity, supplier, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (seller_id, ebay_sku) DO UPDATE SET
            title      = EXCLUDED.title,
            category   = COALESCE(EXCLUDED.category, inventory.category),
            buy_price  = COALESCE(EXCLUDED.buy_price, inventory.buy_price),
            list_price = COALESCE(EXCLUDED.list_price, inventory.list_price),
            quantity   = COALESCE(EXCLUDED.quantity, inventory.quantity),
            supplier   = COALESCE(EXCLUDED.supplier, inventory.supplier),
            notes      = COALESCE(EXCLUDED.notes, inventory.notes),
            updated_at = NOW()
        `, [
          req.sellerId,
          row.sku?.trim(),
          row.title?.trim(),
          row.category?.trim() || null,
          row.buy_price  ? parseFloat(row.buy_price)  : null,
          row.list_price ? parseFloat(row.list_price) : null,
          row.quantity   ? parseInt(row.quantity)      : 0,
          row.supplier?.trim() || null,
          row.notes?.trim()    || null,
        ]);
        // Rough check — could be more precise with INSERT vs UPDATE tracking
        created++;
      } catch (err) {
        errors.push(`Row error (sku=${row.sku}): ${err.message}`);
      }
    }

    res.json({ success: true, total: records.length, created, errors: errors.slice(0, 20) });

  } catch (err) {
    res.status(400).json({ error: 'CSV parse error: ' + err.message });
  }
});

module.exports = router;
