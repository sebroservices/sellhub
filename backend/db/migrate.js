/**
 * Run with:  npm run db:migrate
 *
 * Creates all SellHub tables. Safe to re-run — uses IF NOT EXISTS.
 */

require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Sellers (one row per connected eBay account) ─────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sellers (
        id                SERIAL PRIMARY KEY,
        ebay_user_id      TEXT UNIQUE NOT NULL,
        ebay_username     TEXT,
        access_token      TEXT,
        refresh_token     TEXT,
        token_expires_at  TIMESTAMPTZ,
        marketplace       TEXT DEFAULT 'EBAY_GB',
        store_subscription TEXT DEFAULT 'NONE',
        target_roi        NUMERIC(5,2) DEFAULT 30,
        default_shipping_cost NUMERIC(8,2) DEFAULT 3.50,
        low_stock_threshold INT DEFAULT 3,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Inventory items ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id              SERIAL PRIMARY KEY,
        seller_id       INT REFERENCES sellers(id) ON DELETE CASCADE,
        ebay_sku        TEXT,
        ebay_listing_id TEXT,
        title           TEXT NOT NULL,
        category        TEXT,
        buy_price       NUMERIC(10,2),
        list_price      NUMERIC(10,2),
        quantity        INT DEFAULT 0,
        quantity_sold   INT DEFAULT 0,
        condition       TEXT DEFAULT 'USED_EXCELLENT',
        image_url       TEXT,
        notes           TEXT,
        supplier        TEXT,
        location        TEXT,
        last_synced_at  TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(seller_id, ebay_sku)
      )
    `);

    // ── Orders ───────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id                SERIAL PRIMARY KEY,
        seller_id         INT REFERENCES sellers(id) ON DELETE CASCADE,
        ebay_order_id     TEXT UNIQUE NOT NULL,
        buyer_username    TEXT,
        buyer_email       TEXT,
        order_date        TIMESTAMPTZ,
        sale_price        NUMERIC(10,2),
        shipping_charged  NUMERIC(10,2) DEFAULT 0,
        ebay_final_value_fee NUMERIC(10,2) DEFAULT 0,
        ebay_per_order_fee   NUMERIC(10,2) DEFAULT 0.30,
        promoted_fee      NUMERIC(10,2) DEFAULT 0,
        shipping_cost     NUMERIC(10,2) DEFAULT 0,
        cogs              NUMERIC(10,2) DEFAULT 0,
        other_costs       NUMERIC(10,2) DEFAULT 0,
        net_profit        NUMERIC(10,2),
        fulfillment_status TEXT DEFAULT 'NOT_STARTED',
        payment_status    TEXT DEFAULT 'UNPAID',
        tracking_number   TEXT,
        carrier           TEXT,
        item_title        TEXT,
        ebay_sku          TEXT,
        quantity          INT DEFAULT 1,
        last_synced_at    TIMESTAMPTZ,
        created_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── eBay fee snapshots (for historical accuracy) ──────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ebay_fees (
        id          SERIAL PRIMARY KEY,
        seller_id   INT REFERENCES sellers(id) ON DELETE CASCADE,
        period      TEXT,              -- e.g. '2026-06'
        total_fees  NUMERIC(10,2),
        fvf         NUMERIC(10,2),
        per_order   NUMERIC(10,2),
        promoted    NUMERIC(10,2),
        store_sub   NUMERIC(10,2),
        raw_json    JSONB,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Suppliers ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id          SERIAL PRIMARY KEY,
        seller_id   INT REFERENCES sellers(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        website     TEXT,
        contact     TEXT,
        notes       TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query('COMMIT');
    console.log('✅ Migration complete — all tables created.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
