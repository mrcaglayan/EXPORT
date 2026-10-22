import { Router } from 'express';
import { authConfiguration, requireAuth, csrfProtection } from '../middleware/auth.js';
import { entityId } from '../validators/auth.validators.js';
import * as inventory from '../services/inventory-foundation.service.js';
import * as receipts from '../services/inventory-receipts.service.js';

export function inventoryRoutes() {
  const router = Router({ mergeParams: true });
  router.use(authConfiguration, requireAuth, (req, _res, next) => {
    req.inventory = { identity: req.identity, entityId: entityId(req.params.entityId), requestId: req.requestId, idempotencyKey: req.get('Idempotency-Key') };
    next();
  });
  const respond = fn => async (req, res) => res.json({ ...await fn(req), requestId: req.requestId });
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
