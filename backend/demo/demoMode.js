/**
 * backend/demo/demoMode.js
 * Safe to leave in production — only activates when DEMO_MODE=true
 */

const pool = require('../db/pool');

async function demoAutoLogin(req, res, next) {
  if (process.env.DEMO_MODE !== 'true') return next();
  if (req.session?.sellerId) return next();
  try {
    const { rows } = await pool.query(
      "SELECT id, ebay_username FROM sellers WHERE ebay_user_id = 'demo_seller_001' LIMIT 1"
    );
    if (rows.length) {
      req.session.sellerId = rows[0].id;
      req.session.username = rows[0].ebay_username;
    }
  } catch (_) {}
  next();
}

function demoAuthMe(req, res) {
  if (process.env.DEMO_MODE !== 'true') return null;
  if (!req.session?.sellerId) return null;
  res.json({ authenticated: true, sellerId: req.session.sellerId, username: req.session.username, demo: true });
  return true;
}

function isDemoMode() {
  return process.env.DEMO_MODE === 'true';
}

module.exports = { demoAutoLogin, demoAuthMe, isDemoMode };
