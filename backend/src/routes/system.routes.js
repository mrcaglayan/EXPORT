import { Router } from 'express';
import { checkReadiness as defaultCheck } from '../services/readiness.js';

export function systemRoutes(checkReadiness = defaultCheck) {
  const router = Router();
  router.get('/ready', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const result = await checkReadiness();
    res.json({ ...result, requestId: req.requestId });
  });
  return router;
}
