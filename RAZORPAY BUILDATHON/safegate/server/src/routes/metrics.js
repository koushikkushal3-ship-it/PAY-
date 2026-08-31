import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { runEval, RESULTS_PATH } from '../eval/runEval.js';

export const metricsRouter = Router();

metricsRouter.get('/metrics', async (_req, res, next) => {
  try {
    const raw = await readFile(RESULTS_PATH, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({
        error: 'No evaluation run yet. Run `npm run eval` in server/, or POST /api/eval/run.',
      });
    }
    next(err);
  }
});

// Synchronous on purpose: the holdout set is ~18 cases and the UI shows a
// spinner. If it grows past a minute this should become a background job.
metricsRouter.post('/eval/run', async (_req, res, next) => {
  try {
    const report = await runEval();
    res.json(report);
  } catch (err) {
    next(err);
  }
});
