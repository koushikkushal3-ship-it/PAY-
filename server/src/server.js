import express from 'express';
import cors from 'cors';
import { env } from './lib/env.js';
import { queueRouter } from './routes/queue.js';
import { casesRouter } from './routes/cases.js';
import { metricsRouter } from './routes/metrics.js';

const app = express();

app.use(cors({ origin: [env.frontendUrl, 'http://localhost:5173'] }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: env.geminiModel });
});

app.use('/api', queueRouter);
app.use('/api', casesRouter);
app.use('/api', metricsRouter);

// Surface the real message instead of a generic 500 — this is an internal tool
// and a swallowed error costs more time than it saves.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message ?? 'unknown error' });
});

app.listen(env.port, () => {
  console.log(`SafeGate API on http://localhost:${env.port}  (model: ${env.geminiModel})`);
});
