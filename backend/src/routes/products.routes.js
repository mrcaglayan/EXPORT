import { Router } from 'express';
import { authConfiguration, requireAuth, csrfProtection } from '../middleware/auth.js';
import { entityId } from '../validators/auth.validators.js';
import * as products from '../services/products.service.js';
import * as references from '../services/product-references.service.js';
import * as attributes from '../services/product-attributes.service.js';
import * as gtip from '../services/product-gtip.service.js';
import * as aliases from '../services/product-aliases.service.js';
import { review } from '../services/product-reviews.service.js';

export function productRoutes() {
  const router = Router({ mergeParams: true });
  router.use(authConfiguration, requireAuth, (req, _res, next) => {
    req.products = { identity: req.identity, entityId: entityId(req.params.entityId),
      requestId: req.requestId, idempotencyKey: req.get('Idempotency-Key') };
    next();
  });
  const respond = fn => async (req, res) => res.json({ ...await fn(req), requestId: req.requestId });
  for (const kind of ['suppliers', 'attribute-definitions']) {
    router.get(`/${kind}`, respond(req => references.list(req.products, kind, req.query)));
    router.get(`/${kind}/:id`, respond(req => references.get(req.products, kind, req.params.id)));
    router.post(`/${kind}`, csrfProtection, respond(req => references.save(req.products, kind, req.body)));
    router.patch(`/${kind}/:id`, csrfProtection, respond(req => references.save(req.products, kind, req.body, req.params.id)));
  }
  router.get('/skus/:id/attributes', respond(req => attributes.list(req.products, req.params.id, req.query)));
  router.post('/skus/:id/attributes', csrfProtection, respond(req => attributes.save(req.products, req.params.id, req.body)));
  router.get('/skus/:id/gtip-history', respond(req => gtip.list(req.products, req.params.id, req.query)));
  router.post('/skus/:id/gtip-history', csrfProtection, respond(req => gtip.create(req.products, req.params.id, req.body)));
  router.get('/skus/:id/gtip-at-date', respond(req => gtip.atDate(req.products, req.params.id, req.query)));
  router.get('/gtip-history/:id', respond(req => gtip.get(req.products, req.params.id)));
  router.post('/gtip-history/:id/review', csrfProtection, respond(req => review(req.products, 'gtip', req.params.id, req.body)));
  router.post('/gtip-history/:id/end-date', csrfProtection, respond(req => gtip.endDate(req.products, req.params.id, req.body)));
  router.get('/aliases', respond(req => aliases.list(req.products, req.query)));
  router.get('/aliases/:id', respond(req => aliases.get(req.products, req.params.id)));
  router.post('/aliases', csrfProtection, respond(req => aliases.create(req.products, req.body)));
  router.post('/aliases/:id/review', csrfProtection, respond(req => review(req.products, 'alias', req.params.id, req.body)));
  router.post('/alias-matches', csrfProtection, respond(req => aliases.match(req.products, req.body)));
  for (const kind of ['units', 'families', 'skus']) {
    router.get(`/${kind}`, respond(req => products.list(req.products, kind, req.query)));
    router.get(`/${kind}/:id`, respond(req => products.get(req.products, kind, req.params.id)));
    router.post(`/${kind}`, csrfProtection, respond(req => products.save(req.products, kind, req.body)));
    router.patch(`/${kind}/:id`, csrfProtection, respond(req => products.save(req.products, kind, req.body, req.params.id)));
  }
  router.get('/audit-events', respond(req => products.list(req.products, 'audit-events', req.query)));
  return router;
}
