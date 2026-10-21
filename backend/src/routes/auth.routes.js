import { Router } from 'express';
import { authConfiguration, requireAuth, csrfProtection } from '../middleware/auth.js';
import * as identity from '../services/identity.service.js';
import { readSession, issueCsrf, setSessionCookie, cookieOptions } from '../services/session-security.js';
import * as validate from '../validators/auth.validators.js';

export function authRoutes() {
  const router = Router();
  router.use(authConfiguration);
  router.get('/csrf', (req, res) => {
    res.json({ csrfToken: issueCsrf(req, res, req.authConfig), requestId: req.requestId });
  });
  router.post('/login', csrfProtection, async (req, res) => {
    const credentials = validate.login(req.body);
    try { await identity.limitLogin(req.ip, credentials); } catch (error) {
      if (error.status === 429) res.set('Retry-After', '900');
      throw error;
    }
    let oldPayload;
    try { oldPayload = readSession(req, req.authConfig); } catch { /* anonymous */ }
    const session = await identity.login(credentials, req.authConfig, oldPayload);
    const current = await identity.authenticate({ jti: session.id, tid: session.tenantId, sub: session.userId });
    const result = await identity.profile(current);
    setSessionCookie(res, session, req.authConfig);
    res.json({ ...result, csrfToken: issueCsrf(req, res, req.authConfig, session.id), requestId: req.requestId });
  });
  router.post('/logout', requireAuth, csrfProtection, async (req, res) => {
    await identity.logout(req.identity);
    res.clearCookie(req.authConfig.sessionCookie, cookieOptions(req.authConfig));
    res.clearCookie(req.authConfig.csrfCookie, cookieOptions(req.authConfig));
    res.status(204).end();
  });
  router.post('/context', requireAuth, csrfProtection, async (req, res) => {
    validate.object(req.body, ['legalEntityId']);
    const result = await identity.selectEntity(req.identity, validate.entityId(req.body.legalEntityId));
    res.json({ ...result, requestId: req.requestId });
  });
  return router;
}
