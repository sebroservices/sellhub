/**
 * backend/routes/notifications.js
 *
 * eBay Push Notifications (Platform Notifications API)
 *
 * How it works:
 *  1. You register a webhook URL with eBay (your public URL + /api/notifications/ebay)
 *  2. eBay sends POST requests to that URL the instant something happens
 *  3. We process the event and update our database immediately
 *  4. New orders appear in SellHub within seconds, not 5 minutes
 *
 * Events we subscribe to:
 *  - MARKETPLACE_ACCOUNT_DELETION  (required by eBay)
 *  - ITEM_SOLD                     → new order, instant sync
 *  - ORDER_STATUS_CHANGED          → fulfillment updates
 *  - PAYMENT_DISPUTE_OPENED        → buyer disputes
 *  - INVENTORY_ITEM_UPDATED        → stock level changes
 *
 * Setup:
 *  1. Your server must be publicly accessible (use ngrok for testing)
 *  2. Register the endpoint in your eBay developer app
 *  3. eBay will send a verification challenge first (handled below)
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const pool    = require('../db/pool');
const { syncOrders, syncInventory } = require('../services/syncService');

// ── eBay challenge verification (required when registering the endpoint) ──────
// eBay sends a GET request with a challengeCode to verify you own the endpoint
router.get('/ebay', (req, res) => {
  const { challenge_code } = req.query;
  if (!challenge_code) return res.status(400).json({ error: 'No challenge code' });

  // Hash: SHA256(challengeCode + verificationToken + endpoint)
  const endpoint         = `${process.env.APP_URL}/api/notifications/ebay`;
  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN || 'sellhub-verify-token';

  const hash = crypto.createHash('sha256')
    .update(challenge_code + verificationToken + endpoint)
    .digest('hex');

  console.log(`[notifications] eBay challenge verified`);
  res.json({ challengeResponse: hash });
});

// ── Handle incoming eBay push notifications ───────────────────────────────────
router.post('/ebay', express.raw({ type: 'application/json' }), async (req, res) => {
  // Always respond 200 quickly — eBay will retry if we don't respond fast
  res.status(200).json({ received: true });

  try {
    const body = JSON.parse(req.body.toString());
    const topic = body.metadata?.topic || body.topic || '';
    const data  = body.notification?.data || body.data || {};

    console.log(`[notifications] Received: ${topic}`);

    // Find which seller this belongs to
    const ebayUserId = data.sellerId || data.userId || null;
    let sellerId = null;

    if (ebayUserId) {
      const { rows } = await pool.query(
        'SELECT id FROM sellers WHERE ebay_user_id = $1',
        [ebayUserId]
      );
      if (rows.length) sellerId = rows[0].id;
    }

    // If we can't identify the seller, sync all sellers
    if (!sellerId) {
      const { rows } = await pool.query('SELECT id FROM sellers LIMIT 5');
      for (const s of rows) {
        await handleEvent(topic, data, s.id).catch(err =>
          console.error(`[notifications] Handler error for seller ${s.id}:`, err.message)
        );
      }
      return;
    }

    await handleEvent(topic, data, sellerId);

  } catch (err) {
    console.error('[notifications] Processing error:', err.message);
  }
});

async function handleEvent(topic, data, sellerId) {
  switch (topic) {

    case 'MARKETPLACE_ACCOUNT_DELETION':
      // Required by eBay — delete seller data
      console.log(`[notifications] Account deletion request for seller ${sellerId}`);
      await pool.query('DELETE FROM sellers WHERE id = $1', [sellerId]);
      break;

    case 'ITEM_SOLD':
    case 'ORDER_STATUS_CHANGED':
    case 'ORDER_PAYMENT_COMPLETED':
      // New order or status update — sync orders immediately
      console.log(`[notifications] Order event (${topic}) — syncing orders for seller ${sellerId}`);
      await syncOrders(sellerId);
      break;

    case 'INVENTORY_ITEM_UPDATED':
    case 'OFFER_STATUS_CHANGED':
      // Stock/listing change — sync inventory
      console.log(`[notifications] Inventory event (${topic}) — syncing inventory for seller ${sellerId}`);
      await syncInventory(sellerId);
      break;

    case 'PAYMENT_DISPUTE_OPENED':
    case 'PAYMENT_DISPUTE_STATE_CHANGED':
      // Log dispute — could add dispute tracking table later
      console.log(`[notifications] Payment dispute for seller ${sellerId}:`, data);
      await pool.query(`
        INSERT INTO retention_alerts (seller_id, alert_type, description)
        VALUES ($1, 'payment_dispute', $2)
      `, [sellerId, `Payment dispute: ${JSON.stringify(data).slice(0, 200)}`]);
      break;

    default:
      console.log(`[notifications] Unhandled topic: ${topic}`);
  }
}

// ── GET /api/notifications/status — check subscription status ────────────────
router.get('/status', async (req, res) => {
  res.json({
    endpoint:           `${process.env.APP_URL}/api/notifications/ebay`,
    verification_token: process.env.EBAY_VERIFICATION_TOKEN || 'sellhub-verify-token',
    subscribed_topics: [
      'MARKETPLACE_ACCOUNT_DELETION',
      'ITEM_SOLD',
      'ORDER_STATUS_CHANGED',
      'ORDER_PAYMENT_COMPLETED',
      'INVENTORY_ITEM_UPDATED',
      'PAYMENT_DISPUTE_OPENED',
    ],
    instructions: [
      '1. Make your server publicly accessible (see ngrok instructions below)',
      '2. Go to https://developer.ebay.com/my/notification_preferences',
      '3. Enter your endpoint URL and verification token',
      '4. Subscribe to the topics listed above',
      '5. eBay will verify your endpoint with a GET challenge request',
    ],
    ngrok_instructions: [
      '1. Download ngrok from https://ngrok.com',
      '2. Run: ngrok http 3000',
      '3. Copy the https://xxxx.ngrok.io URL',
      '4. Set APP_URL=https://xxxx.ngrok.io in your .env',
      '5. Use https://xxxx.ngrok.io/api/notifications/ebay as your eBay endpoint',
    ]
  });
});

module.exports = router;
