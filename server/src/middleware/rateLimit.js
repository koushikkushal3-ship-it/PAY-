import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

// Scan endpoints fan out into paid model calls — a tighter budget so a stuck
// retry loop in the UI can't burn the day's Gemini quota.
export const scanLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Scan rate limit reached — wait a minute before re-scanning' },
});
