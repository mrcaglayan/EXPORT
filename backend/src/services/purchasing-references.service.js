import { query } from '../db/query.js';
import { entityId } from '../validators/auth.validators.js';
import { listing } from '../validators/purchasing.validators.js';
import { scopeArgs, authorize, notFound } from './entity-context.js';
import { own, pattern, pageRows } from './purchasing-context.js';
const resources={
  skus:{fields:'r.id,r.code,r.name,r.base_unit_id AS unitId,u.code AS unitCode,u.quantity_precision AS quantityPrecision,(r.active AND f.active AND u.active) AS active',from:'product_skus r JOIN unit_of_measure u ON u.id=r.base_unit_id AND u.tenant_id=r.tenant_id AND u.legal_entity_id=r.legal_entity_id JOIN product_families f ON f.id=r.family_id AND f.tenant_id=r.tenant_id AND f.legal_entity_id=r.legal_entity_id',active:'(r.active AND f.active AND u.active)'},
  suppliers:{fields:'r.id,r.code,r.name,r.active',from:'product_suppliers r',active:'r.active'},
};
export async function reference(context,resource,input,id){
  await authorize(context,'purchasing.read');const config=resources[resource];if(!config)throw notFound();
  const args=scopeArgs(context);let where=own('r');
  if(id){args.push(entityId(id));const {rows}=await query(`SELECT ${config.fields} FROM ${config.from} WHERE ${where} AND r.id=?`,args);if(!rows.length)throw notFound();return {item:{...rows[0],active:Boolean(rows[0].active)}};}
  const p=listing(input,['q','active']);
  if(p.q){where+=" AND (r.code LIKE ? ESCAPE '!' OR r.name LIKE ? ESCAPE '!')";args.push(pattern(p.q),pattern(p.q));}
  if(p.active!==undefined){where+=` AND ${config.active}=?`;args.push(p.active);}
  const result=await pageRows(config.fields,config.from,where,args,p,'r.code,r.id');return {...result,items:result.items.map(r=>({...r,active:Boolean(r.active)}))};
}
export async function auditEvents(context,input){
  await authorize(context,'purchasing.audit.read');const p=listing(input,['q']),args=scopeArgs(context);let where=own('a')+" AND a.action LIKE 'purchasing.%'";
  if(p.q){where+=" AND (a.action LIKE ? ESCAPE '!' OR a.resource_id LIKE ? ESCAPE '!')";args.push(pattern(p.q),pattern(p.q));}
  return pageRows('a.id,a.action,a.resource_id AS resourceId,a.actor_id AS actorId,u.display_name AS actorName,a.created_at AS createdAt,a.request_id AS requestId,a.details',
    'audit_events a LEFT JOIN users u ON u.tenant_id=a.tenant_id AND u.id=a.actor_id',where,args,p,'a.created_at DESC,a.id');
}
