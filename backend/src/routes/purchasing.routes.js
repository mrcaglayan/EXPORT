import { Router } from 'express';
import { authConfiguration, requireAuth, csrfProtection } from '../middleware/auth.js';
import { entityId } from '../validators/auth.validators.js';
import * as partners from '../services/trading-partners.service.js';
import * as documents from '../services/purchasing-documents.service.js';
import * as references from '../services/purchasing-references.service.js';

export function purchasingRoutes(){
  const router=Router({mergeParams:true});
  router.use(authConfiguration,requireAuth,(req,_res,next)=>{req.purchasing={identity:req.identity,entityId:entityId(req.params.entityId),requestId:req.requestId,idempotencyKey:req.get('Idempotency-Key')};next();});
  const respond=fn=>async(req,res)=>res.json({...await fn(req),requestId:req.requestId});
  router.get('/partners',respond(req=>partners.list(req.purchasing,req.query)));
  router.post('/partners',csrfProtection,respond(req=>partners.save(req.purchasing,req.body)));
  router.get('/partners/:id',respond(req=>partners.get(req.purchasing,req.params.id)));
  router.patch('/partners/:id',csrfProtection,respond(req=>partners.save(req.purchasing,req.body,req.params.id)));
  for(const resource of ['contracts','requests','orders']){
    router.get(`/${resource}`,respond(req=>documents.list(req.purchasing,resource,req.query)));
    router.post(`/${resource}`,csrfProtection,respond(req=>documents.create(req.purchasing,resource,req.body)));
    router.get(`/${resource}/:id`,respond(req=>documents.get(req.purchasing,resource,req.params.id)));
    if(resource!=='contracts')router.get(`/${resource}/:id/lines`,respond(req=>documents.lines(req.purchasing,resource,req.params.id,req.query)));
    for(const action of ['approve','reject','cancel'])router.post(`/${resource}/:id/${action}`,csrfProtection,respond(req=>documents.act(req.purchasing,resource,req.params.id,action,req.body)));
  }
  for(const resource of ['suppliers','skus']){
    router.get(`/${resource}`,respond(req=>references.reference(req.purchasing,resource,req.query)));
    router.get(`/${resource}/:id`,respond(req=>references.reference(req.purchasing,resource,{},req.params.id)));
  }
  router.get('/audit-events',respond(req=>references.auditEvents(req.purchasing,req.query)));
  return router;
}
