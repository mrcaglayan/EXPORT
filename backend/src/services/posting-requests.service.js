import { randomUUID } from 'node:crypto';
import { query } from '../db/query.js';
import { AppError } from '../shared/AppError.js';
import { fingerprint, jsonValue } from '../shared/idempotency.js';
import * as validate from '../validators/accounting.validators.js';
import { accountingWrite, audit, authorize, scopeArgs, notFound } from './accounting-context.js';
import { postInTransaction, validatePosting } from './journal.service.js';

async function requestDetails(tx, context, id) {
  const { rows } = await tx.query(`SELECT id, source_module AS sourceModule, source_id AS sourceId,
    status, journal_id AS journalId, error_code AS errorCode, attempts, payload
    FROM posting_requests WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?`, [...scopeArgs(context), id]);
  if (!rows[0]) throw notFound();
  return { postingRequest: { ...rows[0], payload: jsonValue(rows[0].payload) } };
}
export async function getRequest(context, id) {
  validate.entityId(id);
  await authorize(context);
  return requestDetails({ query }, context, id);
}
export async function enqueueRequest(context, body) {
  const input = validate.journal(body);
  return accountingWrite(context, 'accounting.request', 'postingRequest.enqueue', input,
    tx => enqueueInTransaction(tx, context, input));
}
// Future domain services may call this within the SAME entity-locked source
// transaction after their own permissions check. No external publication occurs.
export async function enqueueInTransaction(tx, context, input) {
  input = validate.journal(input);
  const hash = fingerprint(input);
  const { rows } = await tx.query(`SELECT id, payload_hash AS payloadHash FROM posting_requests
    WHERE tenant_id = ? AND legal_entity_id = ? AND source_module = ? AND source_id = ?`,
  [...scopeArgs(context), input.sourceModule, input.sourceId]);
  if (rows[0]) {
    if (rows[0].payloadHash !== hash) throw new AppError(409, 'SOURCE_CONFLICT', 'This source reference has different posting content.');
    return requestDetails(tx, context, rows[0].id);
  }
  const period = await validatePosting(tx, context, input);
  const id = randomUUID();
  await tx.query(`INSERT INTO posting_requests
    (id, tenant_id, legal_entity_id, period_id, source_module, source_id, payload, payload_hash, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, ...scopeArgs(context), period.id, input.sourceModule,
    input.sourceId, JSON.stringify(input), hash, context.identity.userId]);
  await audit(tx, context, 'postingRequest.enqueued', id, { sourceModule: input.sourceModule, sourceId: input.sourceId });
  return requestDetails(tx, context, id);
}
export async function processRequest(context, id, body = {}) {
  validate.entityId(id);
  validate.object(body, []);
  return accountingWrite(context, 'accounting.post', `postingRequest.process:${id}`, {}, async tx => {
    const { postingRequest: request } = await requestDetails(tx, context, id);
    if (request.status === 'POSTED') return { postingRequest: request };
    // Keep any partial journal/audit work out of a recorded FAILED outcome.
    try {
      await tx.withSavepoint(async () => {
        const input = validate.journal(request.payload);
        const { journal } = await postInTransaction(tx, context, input);
        await tx.query(`UPDATE posting_requests SET status = 'POSTED', journal_id = ?, error_code = NULL, attempts = attempts + 1
          WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?`, [journal.id, ...scopeArgs(context), id]);
        await audit(tx, context, 'postingRequest.posted', id, { journalId: journal.id });
      });
    } catch (error) {
      // Unknown SQL/network/commit failures roll back completely, leaving the
      // request durable for retry. Only known domain rejections become FAILED.
      if (!(error instanceof AppError) || ![409, 422].includes(error.status)) throw error;
      await tx.query(`UPDATE posting_requests SET status = 'FAILED', error_code = ?, attempts = attempts + 1
        WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?`, [error.code, ...scopeArgs(context), id]);
      await audit(tx, context, 'postingRequest.failed', id, { errorCode: error.code });
    }
    return requestDetails(tx, context, id);
  });
}
