import {query} from '../db/query.js';
import {entityId} from '../validators/auth.validators.js';
import {listing} from '../validators/exports.validators.js';
import {authorize,scopeArgs,notFound} from './entity-context.js';
import {pageRows,own,pattern} from './purchasing-context.js';
const specs={
 customers:['trading_partners','id,code,name,active',"kind IN ('CUSTOMER','BOTH')"],
 warehouses:['warehouses','id,code,name,active','1=1'],
 pools:['inventory_pools','id,code,name,active,country_code AS countryCode',"kind='COUNTRY' AND country_code<>'TR'"],
 skus:['product_skus','s.id,s.code,s.name,(s.active AND f.active AND u.active) AS active,u.code AS unitCode,s.base_unit_id AS unitId','1=1'],
 'movement-types':['inventory_movement_types','id,code,name,active',"effect='ISSUE'"],
};
export async function references(c,resource,input,id){await authorize(c,'exports.read');const spec=specs[resource];if(!spec)throw notFound();const [table,fields,condition]=spec;if(id!==undefined)entityId(id);const p=id?{limit:1,offset:0}:listing(input,['q','active']),sku=resource==='skus',from=sku?'product_skus s JOIN product_families f ON f.id=s.family_id AND f.tenant_id=s.tenant_id AND f.legal_entity_id=s.legal_entity_id JOIN unit_of_measure u ON u.id=s.base_unit_id AND u.tenant_id=s.tenant_id AND u.legal_entity_id=s.legal_entity_id':table,alias=sku?'s':table,args=scopeArgs(c);let where=own(alias)+' AND '+condition;
 if(id){where+=` AND ${alias}.id=?`;args.push(id);}if(p.active!==undefined){where+=sku?' AND (s.active AND f.active AND u.active)=?':` AND ${alias}.active=?`;args.push(p.active);}if(p.q){where+=` AND (${alias}.code LIKE ? ESCAPE '!' OR ${alias}.name LIKE ? ESCAPE '!')`;args.push(pattern(p.q),pattern(p.q));}const result=await pageRows(fields,from,where,args,p,`${alias}.code,${alias}.id`);if(id){if(!result.items.length)throw notFound();return {item:result.items[0]};}return result;}
export async function auditEvents(c,input){await authorize(c,'exports.audit.read');const p=listing(input);return pageRows('a.id,a.action,a.resource_id AS resourceId,a.created_at AS createdAt,a.details,u.display_name AS actorName','audit_events a JOIN users u ON u.id=a.actor_id AND u.tenant_id=a.tenant_id',`${own('a')} AND a.action LIKE 'exports.%'`,scopeArgs(c),p,'a.created_at DESC,a.id DESC');}
