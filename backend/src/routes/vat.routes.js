import * as claims from '../services/vat-claim.service.js';
import {download} from '../services/vat-claim-download.js';
import {Router} from 'express';
import {authConfiguration,requireAuth,csrfProtection} from '../middleware/auth.js';
import {entityId} from '../validators/auth.validators.js';
import * as sources from '../services/vat-sources.service.js';
import * as attribution from '../services/vat-attributions.service.js';
import * as refunds from '../services/vat-refund.service.js';
import * as costs from '../services/vat-cost.service.js';
export function vatRoutes(){const r=Router({mergeParams:true});r.use(authConfiguration,requireAuth,(req,_res,next)=>{req.vat={identity:req.identity,entityId:entityId(req.params.entityId),requestId:req.requestId,idempotencyKey:req.get('Idempotency-Key')};next();});const respond=fn=>async(req,res)=>res.json({...await fn(req),requestId:req.requestId});
 r.post('/claim-packages/sources',csrfProtection,respond(req=>claims.sources(req.vat,req.body)));
 r.get('/claim-packages/:id/download',async(req,res)=>{const file=await download(req.vat,req.params.id);res.set({'Content-Type':'application/zip','Content-Disposition':'attachment; filename="'+file.name+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(file.bytes);});
 r.get('/claim-packages/:id/requests',respond(req=>claims.requests(req.vat,req.params.id,req.query)));
 r.get('/claim-packages/:id/rows/:kind',respond(req=>claims.rows(req.vat,req.params.id,req.params.kind,req.query)));
 for(const [path,kind] of [['claim-packages','package'],['claim-tracking','tracking']]){
  r.get('/'+path,respond(req=>claims.list(req.vat,kind,req.query)));r.post('/'+path+'/preview',csrfProtection,respond(req=>claims.preview(req.vat,kind,req.body)));r.post('/'+path,csrfProtection,respond(req=>claims.request(req.vat,kind,req.body)));r.get('/'+path+'/:id',respond(req=>claims.get(req.vat,kind,req.params.id)));r.get('/'+path+'/:id/decisions',respond(req=>claims.history(req.vat,kind,req.params.id,req.query)));
  for(const action of kind==='package'?['approve','reject','cancel','request-void','approve-void','reject-void']:['approve','reject','cancel'])r.post('/'+path+'/:id/'+action,csrfProtection,respond(req=>claims.act(req.vat,kind,req.params.id,action,req.body)));
 }
 for(const [path,kind] of [['deductions','deduction'],['reconciliations','reconciliation'],['refund-requests','refund']]){
  r.get('/'+path,respond(req=>refunds.list(req.vat,kind,req.query)));r.post('/'+path+'/preview',csrfProtection,respond(req=>refunds.preview(req.vat,kind,req.body)));r.post('/'+path,csrfProtection,respond(req=>refunds.request(req.vat,kind,req.body)));r.get('/'+path+'/:id',respond(req=>refunds.get(req.vat,kind,req.params.id)));r.get('/'+path+'/:id/decisions',respond(req=>refunds.history(req.vat,kind,req.params.id,req.query)));
  if(kind!=='deduction')r.get('/'+path+'/:id/lines',respond(req=>refunds.lines(req.vat,kind,req.params.id,req.query)));
  for(const action of ['approve','reject','cancel','request-void','approve-void','reject-void'])r.post('/'+path+'/:id/'+action,csrfProtection,respond(req=>refunds.act(req.vat,kind,req.params.id,action,req.body)));
 }
 r.get('/refund-periods',respond(req=>refunds.periods(req.vat,req.query)));
 r.get('/reconciliations/:id/candidates',respond(req=>refunds.candidates(req.vat,req.params.id,req.query)));
 r.get('/cost-invoice-lines',respond(req=>costs.invoiceLines(req.vat,req.query)));r.get('/cost-invoice-lines/:id/journal-lines',respond(req=>costs.journalLines(req.vat,req.params.id,req.query)));
 for(const [path,kind] of [['cost-sources','source'],['allocation-bases','basis'],['cost-allocations','allocation']]){
  r.get('/'+path,respond(req=>costs.list(req.vat,kind,req.query)));r.post('/'+path+'/preview',csrfProtection,respond(req=>costs.preview(req.vat,kind,req.body)));r.post('/'+path,csrfProtection,respond(req=>costs.request(req.vat,kind,req.body)));r.get('/'+path+'/:id',respond(req=>costs.get(req.vat,kind,req.params.id)));r.get('/'+path+'/:id/decisions',respond(req=>costs.history(req.vat,kind,req.params.id,req.query)));
  if(kind!=='source')r.get('/'+path+'/:id/lines',respond(req=>costs.lines(req.vat,kind,req.params.id,req.query)));
  for(const action of ['approve','reject','cancel','request-void','approve-void','reject-void'])r.post('/'+path+'/:id/'+action,csrfProtection,respond(req=>costs.act(req.vat,kind,req.params.id,action,req.body)));
 }
 r.get('/purchase-lines',respond(req=>sources.available(req.vat,req.query)));r.get('/sources',respond(req=>sources.list(req.vat,req.query)));r.post('/sources',csrfProtection,respond(req=>sources.enroll(req.vat,req.body)));r.get('/sources/:id',respond(req=>sources.get(req.vat,req.params.id)));r.get('/sources/:id/history',respond(req=>sources.history(req.vat,req.params.id,req.query)));
 r.get('/clearances',respond(req=>attribution.clearances(req.vat,req.query)));r.get('/clearances/:id/lines',respond(req=>attribution.clearanceLines(req.vat,req.params.id,req.query)));
 r.post('/attributions/preview',csrfProtection,respond(req=>attribution.preview(req.vat,req.body)));r.get('/attributions',respond(req=>attribution.list(req.vat,req.query)));r.post('/attributions',csrfProtection,respond(req=>attribution.request(req.vat,req.body)));r.get('/attributions/:id',respond(req=>attribution.get(req.vat,req.params.id)));r.get('/attributions/:id/lines',respond(req=>attribution.lines(req.vat,req.params.id,req.query)));r.get('/attributions/:id/decisions',respond(req=>attribution.history(req.vat,req.params.id,req.query)));for(const a of ['approve','reject','cancel','request-void','approve-void','reject-void'])r.post(`/attributions/:id/${a}`,csrfProtection,respond(req=>attribution.act(req.vat,req.params.id,a,req.body)));r.get('/audit-events',respond(req=>attribution.auditTrail(req.vat,req.query)));return r;
}
