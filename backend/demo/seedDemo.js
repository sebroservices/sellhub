/**
 * backend/demo/seedDemo.js
 * Seeds the database with realistic demo data so the full app
 * works and looks real without an eBay connection.
 *
 * Run:  node backend/demo/seedDemo.js
 */

require('dotenv').config();
const pool = require('../db/pool');

const DEMO_SELLER = {
  ebay_user_id:     'demo_seller_001',
  ebay_username:    'sellhub_demo',
  access_token:     'DEMO_TOKEN',
  refresh_token:    'DEMO_REFRESH',
  token_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  marketplace:      'EBAY_GB',
  store_subscription: 'BASIC',
  target_roi:       30,
  default_shipping_cost: 3.50,
  low_stock_threshold:   3,
};

const INVENTORY_ITEMS = [
  { sku: 'NK-AM90-BK10', title: 'Nike Air Max 90 Black UK10',         category: 'Footwear',     buy: 42.00,  list: 89.99,  qty: 1,  supplier: 'Sports Direct' },
  { sku: 'NK-AM90-WH09', title: 'Nike Air Max 90 White UK9',          category: 'Footwear',     buy: 40.00,  list: 85.00,  qty: 4,  supplier: 'Sports Direct' },
  { sku: 'AD-SS-WH09',   title: 'Adidas Stan Smith White UK9',        category: 'Footwear',     buy: 28.00,  list: 62.00,  qty: 7,  supplier: 'Adidas Outlet' },
  { sku: 'AD-UB-BK08',   title: 'Adidas Ultraboost 22 Black UK8',     category: 'Footwear',     buy: 55.00,  list: 119.99, qty: 3,  supplier: 'Adidas Outlet' },
  { sku: 'SN-XM5-BK',   title: 'Sony WH-1000XM5 Wireless Headphones',category: 'Electronics',  buy: 98.00,  list: 179.99, qty: 5,  supplier: 'CeX' },
  { sku: 'AP-APP2',      title: 'Apple AirPods Pro 2nd Gen',          category: 'Electronics',  buy: 68.00,  list: 149.99, qty: 9,  supplier: 'eBay Resale' },
  { sku: 'SM-S24U',      title: 'Samsung Galaxy S24 Ultra 256GB',     category: 'Electronics',  buy: 540.00, list: 749.99, qty: 2,  supplier: 'CEX Wholesale' },
  { sku: 'LG-TC-42150',  title: 'Lego Technic 42150 Monster Jam',     category: 'Toys',         buy: 21.00,  list: 44.99,  qty: 2,  supplier: 'The Range' },
  { sku: 'LG-SW-75192',  title: 'Lego Star Wars 75192 Millennium Falcon', category: 'Toys',    buy: 380.00, list: 649.99, qty: 1,  supplier: 'eBay Resale' },
  { sku: 'VN-DJ-M',      title: 'Vintage Levi\'s Denim Jacket M',     category: 'Clothing',     buy: 8.00,   list: 34.99,  qty: 2,  supplier: 'Charity Shop' },
  { sku: 'VN-RL-L',      title: 'Ralph Lauren Polo Shirt L Navy',     category: 'Clothing',     buy: 5.00,   list: 24.99,  qty: 6,  supplier: 'Charity Shop' },
  { sku: 'VN-BM-XL',     title: 'Burberry Check Shirt XL',            category: 'Clothing',     buy: 22.00,  list: 79.99,  qty: 3,  supplier: 'Vinted' },
  { sku: 'BK-HP-SET',    title: 'Harry Potter Complete Box Set',      category: 'Books',        buy: 18.00,  list: 39.99,  qty: 4,  supplier: 'Charity Shop' },
  { sku: 'HG-DYV11',     title: 'Dyson V11 Cordless Vacuum',          category: 'Home',         buy: 85.00,  list: 169.99, qty: 0,  supplier: 'eBay Resale' },
  { sku: 'HG-INS-FRM',   title: 'Instant Pot Duo 7-in-1 6L',         category: 'Home',         buy: 35.00,  list: 69.99,  qty: 8,  supplier: 'Argos Clearance' },
];

// Generate realistic orders over the past 6 months
function generateOrders(sellerId, inventoryRows) {
  const orders = [];
  const now = new Date();

  const skuMap = {};
  inventoryRows.forEach(r => { skuMap[r.ebay_sku] = r; });

  let orderNum = 28000000;

  for (let daysAgo = 180; daysAgo >= 0; daysAgo--) {
    // 0–5 orders per day, weighted toward recent
    const weight = 1 + (180 - daysAgo) / 60;
    const numOrders = Math.random() < 0.3 ? 0 : Math.floor(Math.random() * weight * 2);

    for (let o = 0; o < numOrders; o++) {
      const item = inventoryRows[Math.floor(Math.random() * inventoryRows.length)];
      if (!item) continue;

      const salePrice      = parseFloat(item.list_price);
      const shippingCharged = Math.random() > 0.4 ? 3.99 : 0;
      const fvfRate        = item.category === 'Books' ? 0.15 : item.category === 'Footwear' ? 0.1235 : 0.1325;
      const storeDiscount  = 0.003;
      const effectiveFvf   = Math.max(0, fvfRate - storeDiscount);
      const fvf            = parseFloat(((salePrice + shippingCharged) * effectiveFvf).toFixed(2));
      const perOrderFee    = 0.30;
      const shippingCost   = 3.50;
      const cogs           = parseFloat(item.buy_price);
      const otherCosts     = 0.50;
      const netProfit      = parseFloat((salePrice - fvf - perOrderFee - (shippingCost - shippingCharged) - cogs - otherCosts).toFixed(2));

      const orderDate = new Date(now);
      orderDate.setDate(orderDate.getDate() - daysAgo);
      orderDate.setHours(Math.floor(Math.random() * 14) + 7);

      const statuses = daysAgo > 5
        ? ['FULFILLED']
        : ['FULFILLED', 'IN_PROGRESS', 'NOT_STARTED'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      const buyers = ['tech_bargains_uk','sneakerhead_ldn','retro_finds_1984','bargain_hunter99',
        'collectibles_dave','gadget_pro_uk','fashion_resell','the_lego_store','book_worm_77','home_essentials_co'];

      orders.push({
        seller_id:            sellerId,
        ebay_order_id:        `${++orderNum}-${Math.floor(Math.random()*90000+10000)}-${Math.floor(Math.random()*90000+10000)}`,
        buyer_username:       buyers[Math.floor(Math.random() * buyers.length)],
        order_date:           orderDate.toISOString(),
        sale_price:           salePrice,
        shipping_charged:     shippingCharged,
        ebay_final_value_fee: fvf,
        ebay_per_order_fee:   perOrderFee,
        promoted_fee:         Math.random() > 0.7 ? parseFloat((salePrice * 0.03).toFixed(2)) : 0,
        shipping_cost:        shippingCost,
        cogs,
        other_costs:          otherCosts,
        net_profit:           netProfit,
        fulfillment_status:   status,
        payment_status:       'PAID',
        item_title:           item.title,
        ebay_sku:             item.ebay_sku,
        quantity:             1,
      });
    }
  }

  return orders;
}

async function seedDemo() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert demo seller
    const { rows: sellerRows } = await client.query(`
      INSERT INTO sellers (ebay_user_id, ebay_username, access_token, refresh_token, token_expires_at,
        marketplace, store_subscription, target_roi, default_shipping_cost, low_stock_threshold)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (ebay_user_id) DO UPDATE SET
        ebay_username = EXCLUDED.ebay_username,
        updated_at    = NOW()
      RETURNING id
    `, [
      DEMO_SELLER.ebay_user_id, DEMO_SELLER.ebay_username,
      DEMO_SELLER.access_token, DEMO_SELLER.refresh_token, DEMO_SELLER.token_expires_at,
      DEMO_SELLER.marketplace,  DEMO_SELLER.store_subscription,
      DEMO_SELLER.target_roi,   DEMO_SELLER.default_shipping_cost, DEMO_SELLER.low_stock_threshold,
    ]);
    const sellerId = sellerRows[0].id;
    console.log(`✅ Demo seller created (id: ${sellerId})`);

    // Clear old demo data
    await client.query('DELETE FROM orders    WHERE seller_id = $1', [sellerId]);
    await client.query('DELETE FROM inventory WHERE seller_id = $1', [sellerId]);

    // Insert inventory
    const invRows = [];
    for (const item of INVENTORY_ITEMS) {
      const { rows } = await client.query(`
        INSERT INTO inventory (seller_id, ebay_sku, title, category, buy_price, list_price, quantity, supplier, last_synced_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        RETURNING *
      `, [sellerId, item.sku, item.title, item.category, item.buy, item.list, item.qty, item.supplier]);
      invRows.push(rows[0]);
    }
    console.log(`✅ ${INVENTORY_ITEMS.length} inventory items seeded`);

    // Generate & insert orders
    const orders = generateOrders(sellerId, invRows);
    for (const o of orders) {
      await client.query(`
        INSERT INTO orders (
          seller_id, ebay_order_id, buyer_username, order_date,
          sale_price, shipping_charged, ebay_final_value_fee, ebay_per_order_fee,
          promoted_fee, shipping_cost, cogs, other_costs, net_profit,
          fulfillment_status, payment_status, item_title, ebay_sku, quantity
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (ebay_order_id) DO NOTHING
      `, [
        o.seller_id, o.ebay_order_id, o.buyer_username, o.order_date,
        o.sale_price, o.shipping_charged, o.ebay_final_value_fee, o.ebay_per_order_fee,
        o.promoted_fee, o.shipping_cost, o.cogs, o.other_costs, o.net_profit,
        o.fulfillment_status, o.payment_status, o.item_title, o.ebay_sku, o.quantity,
      ]);
    }
    console.log(`✅ ${orders.length} demo orders seeded (6 months of data)`);

    await client.query('COMMIT');
    console.log(`\n🎉 Demo data ready! Start the server and visit http://localhost:3000`);
    console.log(`   The app will auto-login as the demo seller.\n`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

seedDemo();
