/**
 * auth.js middleware
 * Protects API routes — requires a valid seller session.
 */

function requireAuth(req, res, next) {
  if (!req.session?.sellerId) {
    return res.status(401).json({ error: 'Not authenticated. Please connect your eBay account.' });
  }
  req.sellerId = req.session.sellerId;
  next();
}

module.exports = { requireAuth };
