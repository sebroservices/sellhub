/**
 * backend/jobs/scheduler.js
 *
 * Two-layer sync strategy:
 *  1. eBay push notifications (instant) — new orders arrive in seconds
 *  2. 5-minute polling (safety net)     — catches anything missed by push
 *
 * Requires:  npm install node-cron nodemailer
 */

const cron    = require('node-cron');
const pool    = require('../db/pool');
const { syncAll, syncOrders } = require('../services/syncService');
const { sendDailySummary, sendLowStockAlert } = require('./emailAlerts');
const { isDemoMode } = require('../demo/demoMode');
const { takeInventorySnapshot, checkRetentionHealth } = require('../services/retentionService');

let schedulerStarted = false;

function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  if (isDemoMode()) {
    console.log('📅 Scheduler: demo mode — eBay sync disabled, other jobs active');
  } else {
    console.log('📅 Scheduler: starting all jobs');
  }

  // ── Every 5 minutes: sync orders (safety net for missed push notifications) ─
  cron.schedule('*/5 * * * *', async () => {
    if (isDemoMode()) return;
    console.log('[scheduler] 5-min order sync…');
    try {
      const { rows } = await pool.query('SELECT id FROM sellers');
      for (const seller of rows) {
        await syncOrders(seller.id).catch(err =>
          console.error(`[scheduler] Order sync failed for seller ${seller.id}:`, err.message)
        );
      }
    } catch (err) {
      console.error('[scheduler] 5-min sync error:', err.message);
    }
  });

  // ── Every 30 minutes: full sync (inventory + orders) ─────────────────────
  cron.schedule('*/30 * * * *', async () => {
    if (isDemoMode()) return;
    console.log('[scheduler] 30-min full sync…');
    try {
      const { rows } = await pool.query('SELECT id FROM sellers');
      for (const seller of rows) {
        await syncAll(seller.id).catch(err =>
          console.error(`[scheduler] Full sync failed for seller ${seller.id}:`, err.message)
        );
      }
    } catch (err) {
      console.error('[scheduler] Full sync error:', err.message);
    }
  });

  // ── Every day at midnight: inventory snapshot ─────────────────────────────
  cron.schedule('0 0 * * *', async () => {
    console.log('[scheduler] Daily inventory snapshot…');
    try {
      const { rows } = await pool.query('SELECT id FROM sellers');
      for (const seller of rows) {
        await takeInventorySnapshot(seller.id).catch(err =>
          console.error(`[scheduler] Snapshot failed for ${seller.id}:`, err.message)
        );
        await checkRetentionHealth(seller.id).catch(() => {});
      }
    } catch (err) {
      console.error('[scheduler] Snapshot error:', err.message);
    }
  });

  // ── Every day at 8am: daily profit summary email ──────────────────────────
  cron.schedule('0 8 * * *', async () => {
    if (!process.env.SMTP_HOST) return;
    console.log('[scheduler] Sending daily summaries…');
    try {
      const { rows } = await pool.query('SELECT id, ebay_username FROM sellers');
      for (const seller of rows) {
        await sendDailySummary(seller.id, seller.ebay_username).catch(err =>
          console.error(`[scheduler] Email failed for seller ${seller.id}:`, err.message)
        );
      }
    } catch (err) {
      console.error('[scheduler] Daily email error:', err.message);
    }
  });

  // ── Every hour: low stock alerts ──────────────────────────────────────────
  cron.schedule('0 * * * *', async () => {
    if (!process.env.SMTP_HOST) return;
    try {
      const { rows } = await pool.query('SELECT id, ebay_username FROM sellers');
      for (const seller of rows) {
        await sendLowStockAlert(seller.id, seller.ebay_username).catch(() => {});
      }
    } catch (err) {
      console.error('[scheduler] Low stock alert error:', err.message);
    }
  });

  console.log('📅 Scheduler running:');
  console.log('   • Order sync      → every 5 minutes');
  console.log('   • Full sync       → every 30 minutes');
  console.log('   • Inventory snap  → midnight daily');
  console.log('   • Daily email     → 8:00am daily');
  console.log('   • Stock alerts    → top of every hour');
}

module.exports = { startScheduler };
