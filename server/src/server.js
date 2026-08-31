import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { requireAnalyst } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimit.js';
import queueRoutes from './routes/queue.js';
import riskRoutes from './routes/risk.js';
import auditRoutes from './routes/audit.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const allowed = [process.env.FRONTEND_URL, 'http://localhost:5173'].filter(Boolean);
app.use(cors({
  origin: (origin, cb) => (!origin || allowed.includes(origin)
    ? cb(null, true)
    : cb(null, false)), // reject cleanly rather than throwing a 500
}));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Everything below requires a verified analyst JWT.
app.use('/api', apiLimiter, requireAnalyst, queueRoutes, riskRoutes, auditRoutes);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[error]', err.message);
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' });
});

const port = process.env.PORT ?? 4000;
app.listen(port, () => console.log(`Ops Console API on :${port}`));
