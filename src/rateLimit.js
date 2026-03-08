const store = new Map();

export function createIpRateLimiter({ windowMs, max }) {
  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").toString().split(",")[0].trim();
    const state = store.get(ip) || { count: 0, resetAt: now + windowMs };

    if (now > state.resetAt) {
      state.count = 0;
      state.resetAt = now + windowMs;
    }

    state.count += 1;
    store.set(ip, state);

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - state.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(state.resetAt / 1000)));

    if (state.count > max) {
      res.status(429).json({ error: "rate_limited", message: "Too many requests" });
      return;
    }

    next();
  };
}
