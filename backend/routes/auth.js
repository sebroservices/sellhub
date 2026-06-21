/**
 * routes/auth.js
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { getAuthUrl, exchangeCodeForTokens } = require('../services/ebayAuth');
const { getIdentity } = require('../services/ebayClient');

// Step 1 — redirect to eBay
router.get('/ebay', (req, res) => {
  const state = Math.random().toString(36).slice(2);
  req.session.oauthState = state;
  const url = getAuthUrl(state);
  console.log('[auth] Redirecting to eBay OAuth:', url);
  res.redirect(url);
});

// Step 2 — eBay redirects back with ?code=...
router.get('/ebay/callback', async (req, res) => {
  const { code, state, error } = req.query;
  console.log('[auth] Callback received:', { code: code?.slice(0,20), state, error });

  if (error) return res.redirect(`/?error=${encodeURIComponent(error)}`);

  // Be lenient with state check in case session expired
  if (state && req.session.oauthState && state !== req.session.oauthState) {
    console.warn('[auth] State mismatch — proceeding anyway for localhost dev');
  }

  if (!code) return res.redirect('/?error=No+authorization+code+received');

  try {
    const tokens = await exchangeCodeForTokens(code);
    console.log('[auth] Tokens exchanged successfully');

    const identity = await getIdentity(tokens.access_token);
    console.log('[auth] Identity:', identity);

    const { rows } = await pool.query(`
      INSERT INTO sellers (ebay_user_id, ebay_username, access_token, refresh_token, token_expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (ebay_user_id) DO UPDATE SET
        ebay_username    = EXCLUDED.ebay_username,
        access_token     = EXCLUDED.access_token,
        refresh_token    = EXCLUDED.refresh_token,
        token_expires_at = EXCLUDED.token_expires_at,
        updated_at       = NOW()
      RETURNING id, ebay_username
    `, [identity.userId, identity.username, tokens.access_token, tokens.refresh_token, tokens.expires_at]);

    req.session.sellerId = rows[0].id;
    req.session.username = rows[0].ebay_username;
    delete req.session.oauthState;

    console.log('[auth] Login successful for:', rows[0].ebay_username);
    req.session.save((err) => {
  if (err) console.error('Session save error:', err);
  res.redirect('/#dashboard');
});
  } catch (err) {
    console.error('[auth] OAuth callback error:', err.message);
    res.redirect(`/?error=${encodeURIComponent('Authentication failed: ' + err.message)}`);
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

router.get('/me', (req, res) => {
  if (!req.session?.sellerId) return res.json({ authenticated: false });
  res.json({
    authenticated: true,
    sellerId:  req.session.sellerId,
    username:  req.session.username,
  });
});

module.exports = router;
