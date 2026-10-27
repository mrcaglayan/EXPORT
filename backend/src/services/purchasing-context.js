import { query } from '../db/query.js';
import { AppError } from '../shared/AppError.js';
import { scopeArgs, notFound } from './entity-context.js';
export const fail = (code,message,status=409) => new AppError(status,code,message);
export const own = alias => `${alias}.tenant_id = ? AND ${alias}.legal_entity_id = ?`;
export const pattern = value => `%${value.replace(/[!%_]/g,c=>'!'+c)}%`;
export const serialize = row => Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Date?value.toISOString():value]));
export async function pageRows(fields,from,where,args,page,order,tx={query}) {
  const {rows:count}=await tx.query(`SELECT COUNT(*) AS total FROM ${from} WHERE ${where}`,args);
  const {rows}=await tx.query(`SELECT ${fields} FROM ${from} WHERE ${where} ORDER BY ${order} LIMIT ${page.limit} OFFSET ${page.offset}`,args);
  return {items:rows.map(serialize),total:count[0].total,limit:page.limit,offset:page.offset};
}
export async function insertRows(tx,table,columns,rows) {
  for(let offset=0;offset<rows.length;offset+=250){const batch=rows.slice(offset,offset+250);await tx.query(`INSERT INTO ${table} (${columns}) VALUES ${batch.map(()=>`(${batch[0].map(()=>'?').join(',')})`).join(',')}`,batch.flat());}
}
export async function skuReferences(tx,context,ids) {
  const unique=[...new Set(ids)].sort(),result=new Map();
  for(let offset=0;offset<unique.length;offset+=250){const batch=unique.slice(offset,offset+250);
    const {rows}=await tx.query(`SELECT s.id,s.code,s.name,s.base_unit_id AS unitId,u.code AS unitCode,u.quantity_precision AS quantityPrecision,(s.active AND f.active AND u.active) AS active
      FROM product_skus s JOIN product_families f ON f.id=s.family_id AND f.tenant_id=s.tenant_id AND f.legal_entity_id=s.legal_entity_id
      JOIN unit_of_measure u ON u.id=s.base_unit_id AND u.tenant_id=s.tenant_id AND u.legal_entity_id=s.legal_entity_id
      WHERE ${own('s')} AND s.id IN (${batch.map(()=>'?').join(',')})`,[...scopeArgs(context),...batch]);
    for(const row of rows)result.set(row.id,row);
  }
  for(const id of unique){const sku=result.get(id);if(!sku)throw notFound();if(!sku.active)throw fail('INACTIVE_REFERENCE','Choose an active SKU, family and base unit.');}
  return result;
}
export function checkPrecision(quantity,sku) {if(/[1-9]/.test(quantity.split('.')[1].slice(sku.quantityPrecision)))throw fail('QUANTITY_PRECISION','Quantity must respect the SKU base-unit precision.',422);}
