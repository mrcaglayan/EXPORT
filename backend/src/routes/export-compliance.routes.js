import {Router} from 'express';
import {authConfiguration,requireAuth,csrfProtection} from '../middleware/auth.js';
import {entityId} from '../validators/auth.validators.js';
import * as sales from '../services/export-sales.service.js';
import * as customs from '../services/export-customs.service.js';
import {sources} from '../services/export-sales.service.js';
import {query} from '../db/query.js';
import {authorize} from '../services/entity-context.js';
export function exportComplianceRoutes(){const r=Router({mergeParams:true});r.use(authConfiguration,requireAuth,(req,_res,next)=>{req.compliance={identity:req.identity,entityId:entityId(req.params.entityId),requestId:req.requestId,idempotencyKey:req.get('Idempotency-Key')};next();});const respond=fn=>async(req,res)=>res.json({...await fn(req),requestId:req.requestId});
 r.get('/document-settings',respond(req=>sales.settings(req.compliance)));r.post('/document-settings',csrfProtection,respond(req=>sales.settings(req.compliance,req.body)));
 r.get('/sales-invoices',respond(req=>sales.list(req.compliance,req.query)));r.post('/sales-invoices',csrfProtection,respond(req=>sales.importXml(req.compliance,req.body)));
 r.get('/sales-invoices/:id',respond(req=>sales.get(req.compliance,req.params.id)));r.get('/sales-invoices/:id/lines',respond(req=>sales.lines(req.compliance,req.params.id,req.query)));r.get('/sales-invoices/:id/source',respond(req=>sales.source(req.compliance,req.params.id)));r.get('/sales-invoices/:id/validation',respond(req=>sales.validation(req.compliance,req.params.id,req.query)));r.get('/sales-invoices/:id/decisions',respond(req=>sales.history(req.compliance,req.params.id,req.query)));r.get('/sales-invoices/:id/customs-sources',respond(req=>customs.outgoingSources(req.compliance,req.params.id,req.query)));r.post('/sales-invoices/:id/mappings',csrfProtection,respond(req=>sales.savePlan(req.compliance,req.params.id,req.body)));
 for(const a of ['submit','approve','reject','reopen','cancel','renew'])r.post(`/sales-invoices/:id/${a}`,csrfProtection,respond(req=>sales.act(req.compliance,req.params.id,a,req.body)));
 r.get('/cards/:id/invoice-sources',respond(async req=>{entityId(req.params.id);await authorize(req.compliance,'exports.read');return {items:await sources({query},req.compliance,req.params.id)};}));
 for(const [path,kind]of [['declarations','DECLARATION'],['clearances','CLEARANCE']])r.get('/'+path,respond(req=>customs.list(req.compliance,kind,req.query)));
 r.post('/declarations',csrfProtection,respond(req=>customs.declaration(req.compliance,req.body)));r.post('/declarations/:id/clearances',csrfProtection,respond(req=>customs.clearance(req.compliance,req.params.id,req.body)));
 r.get('/customs-documents/:id',respond(req=>customs.get(req.compliance,req.params.id)));r.get('/customs-documents/:id/lines',respond(req=>customs.lines(req.compliance,req.params.id,req.query)));r.get('/customs-documents/:id/decisions',respond(req=>customs.history(req.compliance,req.params.id,req.query)));for(const a of ['approve','reject','cancel'])r.post(`/customs-documents/:id/${a}`,csrfProtection,respond(req=>customs.act(req.compliance,req.params.id,a,req.body)));
 r.get('/gtip-choices/:id',respond(req=>customs.gtipChoices(req.compliance,req.params.id,req.query.on)));return r;}
