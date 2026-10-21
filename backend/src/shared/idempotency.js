import { createHash } from 'node:crypto';
import { AppError } from './AppError.js';
import { key } from '../validators/accounting.validators.js';

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const fingerprint = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
export const jsonValue = value => typeof value === 'string' ? JSON.parse(value) : value;

// Caller must hold the legal-entity accounting lock for the whole transaction.
export async function idempotent(tx, context, operation, payload, work) {
  const idempotencyKey = key(context.idempotencyKey);
  const hash = fingerprint({ operation, actorId: context.identity.userId, payload });
  const { rows } = await tx.query(`SELECT payload_hash, response FROM idempotency_records
    WHERE tenant_id = ? AND legal_entity_id = ? AND idempotency_key = ? FOR UPDATE`,
  [context.identity.tenantId, context.entityId, idempotencyKey]);
  if (rows.length) {
    if (rows[0].payload_hash !== hash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This key was already used for a different request.');
    return jsonValue(rows[0].response);
  }
  const result = await work();
  await tx.query(`INSERT INTO idempotency_records
    (tenant_id, legal_entity_id, idempotency_key, actor_id, operation, payload_hash, response)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [context.identity.tenantId, context.entityId, idempotencyKey,
    context.identity.userId, operation, hash, JSON.stringify(result)]);
  return result;
}
