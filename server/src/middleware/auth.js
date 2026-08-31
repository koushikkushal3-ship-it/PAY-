import jwt from 'jsonwebtoken';

/**
 * Verifies the Supabase-issued JWT server-side. The frontend holding a session
 * is not evidence of anything — every protected route re-verifies the signature
 * here before any data is touched.
 */
export function requireAnalyst(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  try {
    const payload = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
    req.analyst = { id: payload.sub, email: payload.email ?? payload.sub };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
