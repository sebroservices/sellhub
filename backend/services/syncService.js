/**
 * syncService.js
 * Pulls live data from eBay APIs and upserts into the local database.
 * Call syncAll(sellerId) on demand or schedule it via cron.
 */

const pool = require('../db/pool');
const ebay = require('./ebayClient');

// ── Fee rate lookup by eBay category name (UK rates, 2025/26) ─────────────────
const CATEGORY_FEE_RATES = {
  'Clothes, Shoes & Accessories': 0.1235,
  'Electronics':                  0.1255,
  'Toys & Games':                 0.1325,
  'Books, Comics & Magazines':    0.1500,
  'default':                      0.1325,
};

function getFeeRate(category = '') {
  for (const [key, rate] of Object.entries(CATEGORY_FEE_RATES)) {
    if (category.toLowerCase().includes(key.toLowerCase())) return rate;
  }
  return CATEGORY_FEE_RATES['default'];
}

// ── Calculate net profit for an order ────────────────────────────────────────
function calcNetProfit({ salePrice, shippingCharged, fvf, perOrderFee, promotedFee, shippingCost, cogs, otherCosts }) {
  return (
    salePrice +
    shippingCharged -
    fvf -
    perOrderFee -
    promotedFee -
    shippingCost -
    cogs -
    otherCosts
  );
}

// ── Sync orders ───────────────────────────────────────────────────────────────
async function syncOrders(sellerId) {
  console.log(`[sync] Fetching orders for seller ${sellerId}…`);

  // Fetch all statuses by running multiple calls
  let allOrders = [];
  let offset = 0;
  while (true) {
    const data = await ebay.getOrders(sellerId, { limit: 50, offset });
    if (!data.orders || data.orders.length === 0) break;
    allOrders = allOrders.concat(data.orders);
    if (data.orders.length < 50) break;
    offset += 50;
  }

  console.log(`[sync] Processing ${allOrders.length} orders…`);

  for (const o of allOrders) {
    const lineItem = o.lineItems?.[0] || {};
    const salePrice      = parseFloat(o.pricingSummary?.total?.value || 0);
    const shippingCharged= parseFloat(o.pricingSummary?.deliveryCost?.value || 0);
    const fvfPct         = getFeeRate(lineItem.categoryId);
    const fvf            = parseFloat(((salePrice + shippingCharged) * fvfPct).toFixed(2));
    const perOrderFee    = 0.30;

    // Look up buy price from our inventory table
    const inv = await pool.query(
      'SELECT buy_price, ebay_sku FROM inventory WHERE seller_id = $1 AND ebay_sku = $2',
      [sellerId, lineItem.sku]
    );
    const cogs = inv.rows[0]?.buy_price
      ? parseFloat(inv.rows[0].buy_price) * (o.quantity || 1)
      : 0;

    const netProfit = calcNetProfit({
      salePrice,
      shippingCharged,
      fvf,
      perOrderFee,
      promotedFee:  0,
      shippingCost: parseFloat(process.env.DEFAULT_SHIPPING_COST || '0'),
      cogs,
      otherCosts:   0,
    });

    await pool.query(`
      INSERT INTO orders (
        seller_id, ebay_order_id, buyer_username, order_date,
        sale_price, shipping_charged, ebay_final_value_fee, ebay_per_order_fee,
        cogs, net_profit, fulfillment_status, payment_status,
        item_title, ebay_sku, quantity, last_synced_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
      ON CONFLICT (ebay_order_id) DO UPDATE SET
        fulfillment_status  = EXCLUDED.fulfillment_status,
        payment_status      = EXCLUDED.payment_status,
        ebay_final_value_fee= EXCLUDED.ebay_final_value_fee,
        net_profit          = EXCLUDED.net_profit,
        cogs                = EXCLUDED.cogs,
        last_synced_at      = NOW()
    `, [
      sellerId,
      o.orderId,
      o.buyer?.username,
      o.creationDate,
      salePrice,
      shippingCharged,
      fvf,
      perOrderFee,
      cogs,
      netProfit,
      o.orderFulfillmentStatus,
      o.orderPaymentStatus,
      lineItem.title,
      lineItem.sku,
      lineItem.quantity || 1,
    ]);
  }

  console.log(`[sync] Orders done.`);
}

// ── Sync inventory ────────────────────────────────────────────────────────────
async function syncInventory(sellerId) {
  console.log(`[sync] Fetching inventory for seller ${sellerId}…`);

  let offset = 0;
  while (true) {
    const data = await ebay.getInventoryItems(sellerId, { limit: 100, offset });
    if (!data.inventoryItems || data.inventoryItems.length === 0) break;

    for (const item of data.inventoryItems) {
      const avail = item.availability?.shipToLocationAvailability;
      await pool.query(`
        INSERT INTO inventory (
          seller_id, ebay_sku, title, category, quantity,
          condition, image_url, last_synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
        ON CONFLICT (seller_id, ebay_sku) DO UPDATE SET
          title          = EXCLUDED.title,
          category       = EXCLUDED.category,
          quantity       = EXCLUDED.quantity,
          condition      = EXCLUDED.condition,
          image_url      = EXCLUDED.image_url,
          last_synced_at = NOW()
      `, [
        sellerId,
        item.sku,
        item.product?.title,
        item.product?.aspects?.Category?.[0] || null,
        avail?.quantity || 0,
        item.condition,
        item.product?.imageUrls?.[0] || null,
      ]);
    }

    if (data.inventoryItems.length < 100) break;
    offset += 100;
  }

  console.log(`[sync] Inventory done.`);
}

// ── Full sync ─────────────────────────────────────────────────────────────────
async function syncAll(sellerId) {
  const start = Date.now();
  await syncInventory(sellerId);
  await syncOrders(sellerId);
  console.log(`[sync] Completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

module.exports = { syncAll, syncOrders, syncInventory };
