import { Router } from 'express';
import { authConfiguration, requireAuth, csrfProtection } from '../middleware/auth.js';
import { entityId } from '../validators/auth.validators.js';
import * as inventory from '../services/inventory-foundation.service.js';
import * as receipts from '../services/inventory-receipts.service.js';
import * as reallocations from '../services/inventory-reallocations.service.js';
import * as reservations from '../services/inventory-reservations.service.js';

export function inventoryRoutes() {
  const router = Router({ mergeParams: true });
  router.use(authConfiguration, requireAuth, (req, _res, next) => {
    req.inventory = { identity: req.identity, entityId: entityId(req.params.entityId), requestId: req.requestId, idempotencyKey: req.get('Idempotency-Key') };
    next();
  });
  const respond = fn => async (req, res) => res.json({ ...await fn(req), requestId: req.requestId });
  router.get('/reservations', respond(req => reservations.listReservations(req.inventory, req.query)));
  router.post('/reservations', csrfProtection, respond(req => reservations.reserve(req.inventory, req.body)));
  router.get('/reservations/:id', respond(req => reservations.getReservation(req.inventory, req.params.id)));
  router.get('/reservations/:id/lines', respond(req => reservations.reservationLines(req.inventory, req.params.id, req.query)));
  router.get('/reservations/:id/allocations', respond(req => reservations.reservationAllocations(req.inventory, req.params.id, req.query)));
  router.get('/reservations/:id/releases', respond(req => reservations.releases(req.inventory, req.params.id, req.query)));
  router.post('/reservations/:id/release', csrfProtection, respond(req => reservations.release(req.inventory, req.params.id, req.body)));
  router.post('/reservations/:id/cancel', csrfProtection, respond(req => reservations.release(req.inventory, req.params.id, req.body, true)));
  router.post('/reservations/:id/issues', csrfProtection, respond(req => reservations.postIssue(req.inventory, req.params.id, req.body)));
  router.get('/reservation-releases/:id/lines', respond(req => reservations.releaseLines(req.inventory, req.params.id, req.query)));
  router.get('/issues', respond(req => reservations.listIssues(req.inventory, req.query)));
  router.get('/issues/:id', respond(req => reservations.getIssue(req.inventory, req.params.id)));
  router.get('/issues/:id/lines', respond(req => reservations.issueLines(req.inventory, req.params.id, req.query)));
  router.get('/allocation-preview', respond(req => reallocations.preview(req.inventory, req.query)));
  router.get('/skus', respond(req => reallocations.skus(req.inventory, req.query)));
  router.get('/skus/:id', respond(req => reallocations.skus(req.inventory, req.query, req.params.id)));
  router.get('/reallocations', respond(req => reallocations.list(req.inventory, req.query)));
  router.post('/reallocations', csrfProtection, respond(req => reallocations.create(req.inventory, req.body)));
  router.get('/reallocations/:id', respond(req => reallocations.get(req.inventory, req.params.id)));
  router.get('/reallocations/:id/lines', respond(req => reallocations.lines(req.inventory, req.params.id, req.query)));
  for (const action of ['approve', 'reject', 'execute', 'cancel']) router.post(`/reallocations/:id/${action}`, csrfProtection, respond(req => reallocations.act(req.inventory, req.params.id, action, req.body)));
  for (const kind of ['receipts', 'layers', 'physical-ledger', 'pool-ledger', 'balances', 'pool-balances']) router.get(`/${kind}`, respond(req => receipts.list(req.inventory, kind, req.query)));
  router.get('/receipts/:id', respond(req => receipts.getReceipt(req.inventory, req.params.id)));
  router.get('/receipts/:id/lines', respond(req => receipts.receiptLines(req.inventory, req.params.id, req.query)));
  if (receipts.fixturePostingEnabled()) router.post('/receipts', csrfProtection, respond(req => receipts.postFixture(req.inventory, req.body)));
  router.get('/countries', respond(req => inventory.listCountries(req.inventory, req.query)));
  router.get('/audit-events', respond(req => inventory.list(req.inventory, 'audit-events', req.query)));
  for (const kind of ['warehouses', 'pools', 'periods', 'movement-types', 'accounting-periods']) {
    router.get(`/${kind}`, respond(req => inventory.list(req.inventory, kind, req.query)));
    router.get(`/${kind}/:id`, respond(req => inventory.get(req.inventory, kind, req.params.id)));
    if (kind === 'accounting-periods') continue;
    router.post(`/${kind}`, csrfProtection, respond(req => inventory.save(req.inventory, kind, req.body)));
    if (kind !== 'periods') router.patch(`/${kind}/:id`, csrfProtection, respond(req => inventory.save(req.inventory, kind, req.body, req.params.id)));
  }
  return router;
}
