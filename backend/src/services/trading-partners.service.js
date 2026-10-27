import { randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { entityId } from '../validators/auth.validators.js';
import * as validate from '../validators/purchasing.validators.js';
import { scopeArgs, authorize, entityWrite, audit, notFound } from './entity-context.js';
import { fail, own, pattern, pageRows } from './purchasing-context.js';

const fields=`p.id,p.code,p.name,p.kind,p.supplier_id AS supplierId,s.code AS supplierCode,s.name AS supplierName,s.active AS supplierActive,
  p.country_code AS countryCode,p.tax_identifier AS taxIdentifier,p.tax_office AS taxOffice,p.address,p.email,p.phone,p.active`;
const from='trading_partners p LEFT JOIN product_suppliers s ON s.tenant_id=p.tenant_id AND s.legal_entity_id=p.legal_entity_id AND s.id=p.supplier_id';
const shape = row => ({...row,active:Boolean(row.active),supplierActive:row.supplierActive===null?null:Boolean(row.supplierActive)});
export async function readPartner(tx,context,id,activeSupplier=false) {
  const {rows}=await tx.query(`SELECT ${fields} FROM ${from} WHERE ${own('p')} AND p.id=?`,[...scopeArgs(context),id]);
  if(!rows.length)throw notFound();const item=shape(rows[0]);
  if(activeSupplier&&(!item.active||!item.supplierId||!item.supplierActive))throw fail('INACTIVE_SUPPLIER','Select an active supplier partner and catalogue supplier.');
  return item;
}
export async function get(context,id){await authorize(context,'purchasing.read');return {item:await readPartner({query},context,entityId(id))};}
export async function list(context,input){
  await authorize(context,'purchasing.read');const p=validate.listing(input,['q','active','kind']),args=scopeArgs(context);let where=own('p');
  if(p.q){where+=" AND (p.code LIKE ? ESCAPE '!' OR p.name LIKE ? ESCAPE '!' OR p.tax_identifier LIKE ? ESCAPE '!')";args.push(...Array(3).fill(pattern(p.q)));}
  if(p.active!==undefined){where+=' AND p.active=?';args.push(p.active);}
  if(p.kind){where+=p.kind==='BOTH'?" AND p.kind='BOTH'":" AND p.kind IN (?,'BOTH')";if(p.kind!=='BOTH')args.push(p.kind);}
  const result=await pageRows(fields,from,where,args,p,'p.code,p.id');return {...result,items:result.items.map(shape)};
}
export async function save(context,body,id){
  if(id!==undefined)id=entityId(id);const input=validate.partner(body,id!==undefined);
  return entityWrite(context,'purchasing.manage',`purchasing.partner.${id?'update':'create'}`,{id:id??null,...input},async tx=>{
    const before=id?await readPartner(tx,context,id):null,scope=scopeArgs(context),savedId=id??randomUUID();
    if(id){
      if(!input.active&&(await tx.query(`SELECT id FROM purchasing_documents WHERE tenant_id=? AND legal_entity_id=? AND partner_id=? AND status IN ('REQUESTED','APPROVED') LIMIT 1`,[...scope,id])).rows.length)throw fail('PARTNER_IN_USE','Cancel open contracts and orders before deactivating this partner.');
      await tx.query('UPDATE trading_partners SET name=?,country_code=?,tax_identifier=?,tax_office=?,address=?,email=?,phone=?,active=? WHERE tenant_id=? AND legal_entity_id=? AND id=?',[input.name,input.countryCode,input.taxIdentifier,input.taxOffice,input.address,input.email,input.phone,input.active,...scope,id]);
    }else{
      let supplierId=input.supplierId;
      if(input.kind!=='CUSTOMER'){
        if(supplierId){const {rows}=await tx.query('SELECT active FROM product_suppliers WHERE tenant_id=? AND legal_entity_id=? AND id=?',[...scope,supplierId]);if(!rows.length)throw notFound();if(!rows[0].active)throw fail('INACTIVE_SUPPLIER','Select an active catalogue supplier.');}
        else{supplierId=randomUUID();await tx.query('INSERT INTO product_suppliers (id,tenant_id,legal_entity_id,code,name) VALUES (?,?,?,?,?)',[supplierId,...scope,input.code,input.name]);}
      }
      await tx.query('INSERT INTO trading_partners (id,tenant_id,legal_entity_id,code,name,kind,supplier_id,country_code,tax_identifier,tax_office,address,email,phone) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[savedId,...scope,input.code,input.name,input.kind,supplierId,input.countryCode,input.taxIdentifier,input.taxOffice,input.address,input.email,input.phone]);
    }
    const item=await readPartner(tx,context,savedId);await audit(tx,context,`purchasing.partner.${id?'updated':'created'}`,savedId,{before,after:item});return {item};
  });
}
