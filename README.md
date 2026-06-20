# SellHub — eBay Seller Management Platform

A full-stack eBay seller management app with live data via the official eBay REST APIs.

## Features
- **Dashboard** — revenue, profit, fees, low stock alerts
- **Orders** — searchable order table with per-order profit & fee breakdown
- **Inventory** — synced from eBay, with buy prices and margin tracking
- **Profit analysis** — full P&L, monthly trends, top items by ROI
- **Fee calculator** — live calculation with max buy price for target ROI
- **Settings** — marketplace, store tier, thresholds

---

## Setup

### 1. Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 2. Clone & install
```bash
git clone <your-repo>
cd sellhub
npm install
```

### 3. Create the database
```bash
createdb sellhub
```

### 4. Configure environment
```bash
cp .env.example .env
# Edit .env with your values
```

### 5. eBay Developer App
1. Go to https://developer.ebay.com/my/keys
2. Create a new application
3. Under **Auth Accepted URL**, add: `http://localhost:3000/auth/ebay/callback`
4. Copy your **App ID (Client ID)** and **Dev ID / Secret** into `.env`

### 6. Run migrations
```bash
npm run db:migrate
```

### 7. Start the server
```bash
npm run dev        # development (auto-reload)
npm start          # production
```

Open http://localhost:3000 and click **Connect with eBay**.

---

## eBay APIs Used

| API | Purpose |
|-----|---------|
| `Commerce Identity API` | Get eBay username / user ID on login |
| `Fulfillment API` | Pull orders, fulfilment status |
| `Inventory API` | Pull listings, stock levels, SKUs |
| `Finances API` | Pull payouts, transactions, fee details |
| `Analytics API` | Traffic, impressions, seller performance |

OAuth scopes requested:
- `sell.inventory.readonly`
- `sell.fulfillment.readonly`
- `sell.finances`
- `sell.analytics.readonly`
- `commerce.identity.readonly`

---

## Project Structure

```
sellhub/
├── backend/
│   ├── server.js              ← Express app entry point
│   ├── db/
│   │   ├── pool.js            ← PostgreSQL connection pool
│   │   └── migrate.js         ← Creates all tables
│   ├── middleware/
│   │   └── auth.js            ← Session auth middleware
│   ├── routes/
│   │   ├── auth.js            ← eBay OAuth flow
│   │   ├── orders.js          ← Orders API
│   │   ├── inventory.js       ← Inventory API
│   │   ├── profit.js          ← Profit / fee calculator API
│   │   └── settings.js        ← Settings + sync trigger
│   └── services/
│       ├── ebayAuth.js        ← OAuth token exchange & refresh
│       ├── ebayClient.js      ← eBay REST API wrapper
│       └── syncService.js     ← Pulls eBay data → upserts to DB
└── frontend/
    ├── index.html
    ├── css/app.css
    └── js/
        ├── api.js             ← Fetch wrapper for all API calls
        ├── ui.js              ← Shared UI helpers
        ├── app.js             ← Router & auth check
        └── pages/
            ├── dashboard.js
            ├── orders.js
            ├── inventory.js
            ├── profit.js
            ├── calculator.js  ← also contains settings.js
            └── settings.js
```

---

## Next Steps

- [ ] Add scheduled sync (node-cron every 15 min)
- [ ] Add multi-seller support
- [ ] Add eBay promoted listings data
- [ ] Add email alerts for low stock
- [ ] Add CSV import for bulk buy prices
- [ ] Deploy to VPS with nginx + PM2
