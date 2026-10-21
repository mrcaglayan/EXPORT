import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../db/query.js';
import { requirePermission } from './identity.service.js';
import { entityId, key } from '../validators/accounting.validators.js';
import { idempotent } from '../shared/idempotency.js';
import { AppError } from '../shared/AppError.js';

export const scopeArgs = context => [context.identity.tenantId, context.entityId];
export const notFound = () => new AppError(404, 'NOT_FOUND', 'Record not found in this entity.');
export async function authorize(context, permission, tx = { query }) {
  entityId(context.entityId);
  await requirePermission(context.identity, context.entityId, permission, tx);
}
export async function entityWrite(context, permission, operation, payload, work) {
  key(context.idempotencyKey);
  await authorize(context, permission);
  try {
    return await withTransaction(async tx => {
      // Deliberately serialize entity mutations per entity in the foundation.
      // Lock before the first consistent read; every writer uses this same order.
      const { rows } = await tx.query('SELECT id FROM legal_entities WHERE tenant_id = ? AND id = ? AND active = 1 FOR UPDATE', scopeArgs(context));
      if (!rows.length) throw notFound();
      await authorize(context, permission, tx);
      return idempotent(tx, context, operation, payload, () => work(tx));
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new AppError(409, 'DUPLICATE_CODE', 'This code or source reference already exists in the selected entity.');
    throw error;
  }
}
export async function audit(tx, context, action, resourceId, details) {
  await tx.query(`INSERT INTO audit_events
    (id, tenant_id, legal_entity_id, actor_id, action, resource_id, request_id, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [randomUUID(), ...scopeArgs(context), context.identity.userId, action,
    resourceId, context.requestId ?? 'internal', JSON.stringify(details)]);
}
