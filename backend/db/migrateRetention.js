/**
 * backend/db/migrateRetention.js
 *
 * Adds data retention infrastructure:
 *  - orders_archive       : permanent copy of all orders, never deleted
 *  - inventory_snapshots  : daily stock-level snapshots (for "inventory at date" reports)
 *  - sync_log             : tracks every sync run, flags gaps before 90-day window closes
 *  - financial_periods    : locks down monthly figures once reconciled
 *  - vat_records          : per-transaction VAT tracking for HMRC / OSS
 *
 * Run:  node backend/db/migrateRetention.js
 */

require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Sync log — every eBay sync recorded ────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_log (
        id            SERIAL PRIMARY KEY,
        seller_id     INT REFERENCES sellers(id) ON DELETE CASCADE,
        sync_type     TEXT NOT NULL,           -- 'orders' | 'inventory' | 'finances' | 'full'
        started_at    TIMESTAMPTZ DEFAULT NOW(),
        finished_at   TIMESTAMPTZ,
        orders_synced INT DEFAULT 0,
        items_synced  INT DEFAULT 0,
        oldest_order  TIMESTAMPTZ,            -- oldest order date fetched in this run
        newest_order  TIMESTAMPTZ,
        status        TEXT DEFAULT 'running', -- 'running' | 'success' | 'error'
        error_msg     TEXT,
        ebay_api_calls INT DEFAULT 0
      )
    `);

    // ── Retention health view — shows gap risk ──────────────────────────────
    // A gap means we haven't synced recently enough and eBay data may have expired
    await client.query(`
      CREATE TABLE IF NOT EXISTS retention_alerts (
        id          SERIAL PRIMARY KEY,
        seller_id   INT REFERENCES sellers(id) ON DELETE CASCADE,
        alert_type  TEXT,     -- 'gap_risk' | 'missing_window' | 'sync_overdue'
        description TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      )
    `);

    // ── Inventory snapshots — daily stock levels at close of day ───────────
    // Lets you answer "what was my stock on 1st March?" for any past date
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_snapshots (
        id          SERIAL PRIMARY KEY,
        seller_id   INT REFERENCES sellers(id) ON DELETE CASCADE,
        snapshot_date DATE NOT NULL,
        ebay_sku    TEXT,
        title       TEXT,
        category    TEXT,
        quantity    INT,
        buy_price   NUMERIC(10,2),
        list_price  NUMERIC(10,2),
        total_value NUMERIC(10,2),   -- quantity * buy_price
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(seller_id, snapshot_date, ebay_sku)
      )
    `);

    // Index for fast date-range queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inv_snapshots_date
      ON inventory_snapshots(seller_id, snapshot_date)
    `);

    // ── VAT records — per-transaction VAT for HMRC MTD / EU OSS ───────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS vat_records (
        id              SERIAL PRIMARY KEY,
        seller_id       INT REFERENCES sellers(id) ON DELETE CASCADE,
        order_id        INT REFERENCES orders(id) ON DELETE CASCADE,
        ebay_order_id   TEXT,
        transaction_date TIMESTAMPTZ,
        tax_period      TEXT,         -- e.g. '2026-Q2'
        buyer_country   TEXT DEFAULT 'GB',
        vat_scheme      TEXT DEFAULT 'STANDARD', -- 'STANDARD' | 'FLAT_RATE' | 'OSS'
        gross_sale      NUMERIC(10,2),
        vat_rate        NUMERIC(5,2) DEFAULT 20.00,
        vat_amount      NUMERIC(10,2),
        net_sale        NUMERIC(10,2),
        ebay_fee_gross  NUMERIC(10,2),
        ebay_fee_vat    NUMERIC(10,2),  -- VAT on eBay fees (reclaimable)
        ebay_fee_net    NUMERIC(10,2),
        cogs            NUMERIC(10,2),
        is_vat_registered BOOLEAN DEFAULT false,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(seller_id, ebay_order_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vat_records_period
      ON vat_records(seller_id, tax_period)
    `);

    // ── Financial periods — locked monthly P&L snapshots ──────────────────
    // Once you reconcile a month, lock it so it doesn't change
    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_periods (
        id              SERIAL PRIMARY KEY,
        seller_id       INT REFERENCES sellers(id) ON DELETE CASCADE,
        period          TEXT NOT NULL,       -- '2026-06'
        period_type     TEXT DEFAULT 'month', -- 'month' | 'quarter' | 'year'
        gross_revenue   NUMERIC(12,2),
        shipping_revenue NUMERIC(12,2),
        total_fees      NUMERIC(12,2),
        fvf             NUMERIC(12,2),
        per_order_fees  NUMERIC(12,2),
        promoted_fees   NUMERIC(12,2),
        store_sub       NUMERIC(12,2),
        cogs            NUMERIC(12,2),
        shipping_cost   NUMERIC(12,2),
        other_costs     NUMERIC(12,2),
        net_profit      NUMERIC(12,2),
        order_count     INT,
        vat_on_sales    NUMERIC(12,2),
        vat_on_fees     NUMERIC(12,2),     -- reclaimable input VAT
        locked          BOOLEAN DEFAULT false,
        locked_at       TIMESTAMPTZ,
        locked_by       TEXT,
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(seller_id, period, period_type)
      )
    `);

    // ── Add columns to sellers for retention settings ──────────────────────
    await client.query(`
      ALTER TABLE sellers
        ADD COLUMN IF NOT EXISTS vat_registered     BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS vat_number         TEXT,
        ADD COLUMN IF NOT EXISTS vat_scheme         TEXT DEFAULT 'STANDARD',
        ADD COLUMN IF NOT EXISTS flat_rate_pct      NUMERIC(5,2) DEFAULT 7.50,
        ADD COLUMN IF NOT EXISTS company_name       TEXT,
        ADD COLUMN IF NOT EXISTS company_address    TEXT,
        ADD COLUMN IF NOT EXISTS accountant_email   TEXT,
        ADD COLUMN IF NOT EXISTS fiscal_year_start  INT DEFAULT 4,  -- April (UK tax year)
        ADD COLUMN IF NOT EXISTS last_full_sync_at  TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS earliest_order_at  TIMESTAMPTZ
    `);

    // ── Add columns to orders for retention / VAT ─────────────────────────
    await client.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS buyer_country    TEXT DEFAULT 'GB',
        ADD COLUMN IF NOT EXISTS is_archived      BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS archived_at      TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS financial_period TEXT,
        ADD COLUMN IF NOT EXISTS vat_rate         NUMERIC(5,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS vat_amount       NUMERIC(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS ebay_fee_vat     NUMERIC(10,2) DEFAULT 0
    `);

    await client.query('COMMIT');
    console.log('✅ Retention migration complete.');
    console.log('   Tables added: sync_log, retention_alerts, inventory_snapshots,');
    console.log('                 vat_records, financial_periods');
    console.log('   Columns added to: sellers, orders');
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
