/**
 * ebayClient.js
 * Thin wrapper around eBay REST APIs.
 * Automatically refreshes the access token if expired.
 */

const axios  = require('axios');
const pool   = require('../db/pool');
const { refreshAccessToken } = require('./ebayAuth');

const API_BASE = process.env.EBAY_ENV === 'sandbox'
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com';

// ── Get a valid access token for a seller, refreshing if needed ───────────────
async function getValidToken(sellerId) {
  const { rows } = await pool.query(
    'SELECT access_token, refresh_token, token_expires_at FROM sellers WHERE id = $1',
    [sellerId]
  );
  if (!rows.length) throw new Error('Seller not found');

  const seller = rows[0];
  const isExpired = new Date(seller.token_expires_at) < new Date(Date.now() + 60_000);

  if (isExpired) {
    const { access_token, expires_at } = await refreshAccessToken(seller.refresh_token);
    await pool.query(
      'UPDATE sellers SET access_token = $1, token_expires_at = $2 WHERE id = $3',
      [access_token, expires_at, sellerId]
    );
    return access_token;
  }

  return seller.access_token;
}

// ── Generic authenticated GET ─────────────────────────────────────────────────
async function ebayGet(sellerId, path, params = {}) {
  const token = await getValidToken(sellerId);
  const res = await axios.get(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS  (Fulfillment API)
// ─────────────────────────────────────────────────────────────────────────────

async function getOrders(sellerId, { limit = 50, offset = 0, filter = '' } = {}) {
  return ebayGet(sellerId, '/sell/fulfillment/v1/order', {
    limit,
    offset,
    filter: filter || 'orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}',
  });
}

async function getOrder(sellerId, orderId) {
  return ebayGet(sellerId, `/sell/fulfillment/v1/order/${orderId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY  (Inventory API)
// ─────────────────────────────────────────────────────────────────────────────

async function getInventoryItems(sellerId, { limit = 100, offset = 0 } = {}) {
  return ebayGet(sellerId, '/sell/inventory/v1/inventory_item', { limit, offset });
}

async function getInventoryItem(sellerId, sku) {
  return ebayGet(sellerId, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCES  (Finances API)
// ─────────────────────────────────────────────────────────────────────────────

async function getTransactions(sellerId, { limit = 200, filter = '' } = {}) {
  return ebayGet(sellerId, '/sell/finances/v1/transaction', {
    limit,
    filter: filter || `transactionType:{SALE|REFUND|CREDIT}`,
  });
}

async function getSellerFundsSummary(sellerId) {
  return ebayGet(sellerId, '/sell/finances/v1/seller_funds_summary');
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS  (Analytics API)
// ─────────────────────────────────────────────────────────────────────────────

async function getTrafficReport(sellerId, { dimension = 'DAY', metricKeys } = {}) {
  return ebayGet(sellerId, '/sell/analytics/v1/traffic_report', {
    dimension,
    metric_keys: metricKeys || 'CLICK_THROUGH_RATE,LISTING_IMPRESSION_TOTAL,TRANSACTION',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY  (who just connected?)
// ─────────────────────────────────────────────────────────────────────────────

async function getIdentity(accessToken) {
  const res = await axios.get(`${API_BASE}/commerce/identity/v1/user/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data;
}

module.exports = {
  getOrders,
  getOrder,
  getInventoryItems,
  getInventoryItem,
  getTransactions,
  getSellerFundsSummary,
  getTrafficReport,
  getIdentity,
};
