/**
 * backend/services/ebayAuth.js
 * Handles eBay OAuth 2.0 — authorization URL, token exchange, token refresh.
 */

const axios = require('axios');
require('dotenv').config();

const ENV      = process.env.EBAY_ENV === 'sandbox' ? 'sandbox' : 'production';
const BASE_URL = ENV === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
const AUTH_URL = ENV === 'sandbox'
  ? 'https://auth.sandbox.ebay.com/oauth2/authorize'
  : 'https://auth.ebay.com/oauth2/authorize';
const TOKEN_URL = ENV === 'sandbox'
  ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
  : 'https://api.ebay.com/identity/v1/oauth2/token';

const CLIENT_ID     = process.env.EBAY_CLIENT_ID;
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const REDIRECT_URI  = process.env.EBAY_REDIRECT_URI; // RuName from eBay developer portal

const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
  'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
].join(' ');

// Step 1 — Build authorization URL
function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// Step 2 — Exchange authorization code for tokens
async function exchangeCodeForTokens(code) {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const { data } = await axios.post(TOKEN_URL,
    new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
    {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
    }
  );
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    new Date(Date.now() + data.expires_in * 1000),
  };
}

// Step 3 — Refresh access token using refresh token
async function refreshAccessToken(refreshToken) {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const { data } = await axios.post(TOKEN_URL,
    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      scope:         SCOPES,
    }).toString(),
    {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
    }
  );
  return {
    access_token: data.access_token,
    expires_at:   new Date(Date.now() + data.expires_in * 1000),
  };
}

module.exports = { getAuthUrl, exchangeCodeForTokens, refreshAccessToken, BASE_URL };
