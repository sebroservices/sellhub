require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');

const code = process.argv[2];
if (!code) { console.error('Usage: node saveTokens.js YOUR_CODE'); process.exit(1); }

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

async function main() {
  const creds = Buffer.from(process.env.EBAY_CLIENT_ID + ':' + process.env.EBAY_CLIENT_SECRET).toString('base64');
  
  console.log('Exchanging code for tokens...');
  const r = await axios.post('https://api.ebay.com/identity/v1/oauth2/token',
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: process.env.EBAY_REDIRECT_URI }).toString(),
    { headers: { 'Authorization': 'Basic ' + creds, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  
  const at = r.data.access_token;
  const rt = r.data.refresh_token;
  const exp = new Date(Date.now() + r.data.expires_in * 1000);
  
  console.log('Getting eBay identity...');
  const id2 = await axios.get('https://apiz.ebay.com/commerce/identity/v1/user/', 
    { headers: { Authorization: 'Bearer ' + at } }
  );
  
  console.log('Saving to database...');
  const res = await pool.query(`
    INSERT INTO sellers (ebay_user_id, ebay_username, access_token, refresh_token, token_expires_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (ebay_user_id) DO UPDATE SET
      access_token = $3, refresh_token = $4,
      token_expires_at = $5, ebay_username = $2
    RETURNING id, ebay_username
  `, [id2.data.userId, id2.data.username, at, rt, exp]);
  
  console.log('SUCCESS! Saved seller:', res.rows[0]);
  pool.end();
}

main().catch(e => { console.error('ERROR:', e.response?.data || e.message); pool.end(); });
