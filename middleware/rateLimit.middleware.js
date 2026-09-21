
function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 20, message = 'Too many requests. Please try again later.' } = {}) {
  const buckets = new Map();

  return (req, res, next) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = String(forwarded || req.ip || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const key = `${ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const current = buckets.get(key);

    if (!current || now - current.startedAt >= windowMs) {
      buckets.set(key, { startedAt: now, count: 1 });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (now - current.startedAt)) / 1000)));
      return res.status(429).json({ message });
    }

    return next();
  };
}

module.exports = { createRateLimiter };
