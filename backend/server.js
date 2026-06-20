/**
 * server.js — SellHub entry point
 * Run:  npm start  (or  npm run dev  for auto-reload)
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');
const { demoAutoLogin } = require('./demo/demoMode');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret:            process.env.SESSION_SECRET || 'changeme',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   7 * 24 * 60 * 60 * 1000,
  },
}));

// Demo mode: auto-login without eBay OAuth
app.use(demoAutoLogin);

// ── Static frontend ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/auth',           require('./routes/auth'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/inventory',  require('./routes/inventory'));
app.use('/api/profit',     require('./routes/profit'));
app.use('/api/settings',   require('./routes/settings'));
app.use('/api/import',        require('./routes/import'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/suppliers',     require('./routes/suppliers'));
app.use('/api/goals',        require('./routes/goals'));
app.use('/api/email',        require('./routes/email'));
app.use('/api/notifications', require('./routes/notifications'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:    'ok',
    version:   '1.0.0',
    demo_mode: process.env.DEMO_MODE === 'true',
    timestamp: new Date().toISOString(),
  });
});

// ── Catch-all → serve frontend SPA ───────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Scheduler ─────────────────────────────────────────────────────────────────
try {
  const { startScheduler } = require('./jobs/scheduler');
  startScheduler();
} catch (e) {
  console.log('⚠️  Scheduler not started (run: npm install node-cron nodemailer)');
}

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 SellHub running at http://localhost:${PORT}`);
  console.log(`   Demo mode: ${process.env.DEMO_MODE === 'true' ? '✅ ON' : '❌ OFF'}`);
  console.log(`   eBay env:  ${process.env.EBAY_ENV || 'production'}\n`);
});
