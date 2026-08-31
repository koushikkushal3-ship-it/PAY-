import { Router } from 'express';
import { scanFlags } from '../services/freezeRisk.service.js';
import { runEvaluation } from '../evaluation/evaluate.js';
import { scanLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/risk/scan', scanLimiter, async (req, res, next) => {
  try {
    res.json({ scanned: await scanFlags({ limit: 25 }) });
  } catch (err) { next(err); }
});

// The number the pitch leads with. Replays the held-out labelled slice through
// the live scoring path and reports how it actually did — plus the naive
// baseline it has to beat to be worth anything.
router.get('/risk/metrics', scanLimiter, async (req, res, next) => {
  try {
    res.json(await runEvaluation());
  } catch (err) { next(err); }
});

export default router;
