import { Router } from 'express';
import { authConfiguration, requireAuth, csrfProtection } from '../middleware/auth.js';
import { entityId } from '../validators/accounting.validators.js';
import * as setup from '../services/accounting-setup.service.js';
import { getJournal, postJournal } from '../services/journal.service.js';
import { getRequest, enqueueRequest, processRequest } from '../services/posting-requests.service.js';

export function accountingRoutes() {
  const router = Router({ mergeParams: true });
  router.use(authConfiguration, requireAuth, (req, _res, next) => {
    req.accounting = { identity: req.identity, entityId: entityId(req.params.entityId),
      requestId: req.requestId, idempotencyKey: req.get('Idempotency-Key') };
    next();
  });
  const respond = fn => async (req, res) => {
    res.json({ ...await fn(req), requestId: req.requestId });
  };
  router.get('/settings', respond(req => setup.getSettings(req.accounting)));
  router.post('/settings', csrfProtection, respond(req => setup.configure(req.accounting, req.body)));
  for (const [path, table] of [['accounts', 'accounts'], ['fiscal-years', 'fiscal_years'],
    ['periods', 'accounting_periods'], ['journals', 'journals'], ['posting-requests', 'posting_requests'], ['audit-events', 'audit_events']]) {
    router.get(`/${path}`, respond(req => setup.list(req.accounting, table, req.query)));
  }
  router.post('/accounts', csrfProtection, respond(req => setup.createAccount(req.accounting, req.body)));
  router.patch('/accounts/:id', csrfProtection, respond(req => setup.updateAccount(req.accounting, req.params.id, req.body)));
  router.post('/fiscal-years', csrfProtection, respond(req => setup.createYear(req.accounting, req.body)));
  router.post('/periods', csrfProtection, respond(req => setup.createPeriod(req.accounting, req.body)));
  router.post('/periods/:id/close', csrfProtection, respond(req => setup.closePeriod(req.accounting, req.params.id, req.body)));
  router.get('/journals/:id', respond(req => getJournal(req.accounting, req.params.id)));
  router.post('/journals', csrfProtection, respond(req => postJournal(req.accounting, req.body)));
  router.get('/posting-requests/:id', respond(req => getRequest(req.accounting, req.params.id)));
  router.post('/posting-requests', csrfProtection, respond(req => enqueueRequest(req.accounting, req.body)));
  router.post('/posting-requests/:id/process', csrfProtection, respond(req => processRequest(req.accounting, req.params.id, req.body)));
  return router;
}
