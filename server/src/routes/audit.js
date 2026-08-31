import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { listEvents } from '../services/audit.service.js';

const router = Router();

const query = z.object({
  module: z.enum(['risk', 'recovery', 'agent_audit', 'finance']).optional(),
});

router.get('/audit-log', validate(query, 'query'), async (req, res, next) => {
  try {
    res.json(await listEvents({ module: req.query.module }));
  } catch (err) { next(err); }
});

export default router;
