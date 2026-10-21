import { Router } from 'express';
import { authConfiguration, requireAuth, csrfProtection, permissionGuard } from '../middleware/auth.js';
import * as identity from '../services/identity.service.js';
import * as validate from '../validators/auth.validators.js';

export function identityRoutes() {
  const router = Router();
  router.get('/me', authConfiguration, requireAuth, async (req, res) => {
    res.json({ ...await identity.profile(req.identity), requestId: req.requestId });
  });
  router.use('/organizations', authConfiguration, requireAuth);
  router.get('/organizations', async (req, res) => {
    // Assigned entities only; no caller-controlled tenant parameter.
    validate.object(req.query, ['offset', 'limit']);
    const offset = Number(req.query.offset ?? 0);
    const limit = Number(req.query.limit ?? 50);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw validate.invalid();
    res.json({ ...await identity.listOrganizations(req.identity, offset, limit), requestId: req.requestId });
  });
  router.use('/organizations/:id', (req, _res, next) => {
    validate.entityId(req.params.id);
    next();
  });
  router.get('/organizations/:id', async (req, res) => {
    res.json({ organization: await identity.readEntity(req.identity, req.params.id), requestId: req.requestId });
  });
  router.patch('/organizations/:id', csrfProtection, permissionGuard('organizations.update'), async (req, res) => {
    validate.object(req.body, ['name']);
    res.json({ organization: await identity.updateEntity(req.identity, req.params.id, validate.text(req.body.name, 160)), requestId: req.requestId });
  });
  return router;
}
