import { entityId } from '../validators/auth.validators.js';
import { review as validateReview } from '../validators/product-classification.validators.js';
import { scopeArgs, entityWrite, audit, notFound } from './entity-context.js';
import { sku, conflict } from './product-classification-context.js';
import { readReference } from './product-references.service.js';
import { readGtip, noOverlap } from './product-gtip.service.js';
import { readAlias } from './product-aliases.service.js';

const transitions = { PENDING: ['REVIEWED', 'REJECTED'], REVIEWED: ['VERIFIED', 'REJECTED'], VERIFIED: ['RETIRED'] };
export async function review(context, kind, id, body) {
  if (!['gtip', 'alias'].includes(kind)) throw notFound();
  id = entityId(id); const input = validateReview(body, kind);
  const table = kind === 'gtip' ? 'product_gtip_history' : 'product_aliases';
  const read = kind === 'gtip' ? readGtip : readAlias;
  return entityWrite(context, 'products.review', `product.${kind}.review`, { id, ...input }, async tx => {
    const before = await read(tx, context, id);
    if (!transitions[before.status]?.includes(input.decision)) throw conflict('INVALID_TRANSITION', 'This review transition is not available. Refresh the record and follow the review sequence.');
    if (['REVIEWED', 'VERIFIED'].includes(input.decision)) {
      await sku(tx, context, before.skuId, true);
      if (kind === 'alias') await readReference(tx, context, 'suppliers', before.supplierId, true);
      else await noOverlap(tx, context, before.skuId, before, id);
    }
    const updates = ['status = ?']; const args = [input.decision];
    if (input.decision === 'REVIEWED') { updates.push('reviewed_by = ?', 'reviewed_at = UTC_TIMESTAMP()'); args.push(context.identity.userId); }
    if (input.decision === 'VERIFIED') {
      updates.push('verified_by = ?', 'verified_at = UTC_TIMESTAMP()'); args.push(context.identity.userId);
      if (kind === 'gtip') { updates.push('broker_name = ?', 'verification_reference = ?', 'verified_on = ?'); args.push(input.brokerName, input.verificationReference, input.verifiedOn); }
    }
    if (kind === 'alias' && ['REJECTED', 'RETIRED'].includes(input.decision)) updates.push('current_source_id = NULL');
    await tx.query(`UPDATE ${table} SET ${updates.join(', ')} WHERE tenant_id = ? AND legal_entity_id = ? AND id = ?`, [...args, ...scopeArgs(context), id]);
    const item = await read(tx, context, id);
    await audit(tx, context, `product.${kind}.${input.decision.toLowerCase()}`, id, { before, after: item, reason: input.reason });
    return { item };
  });
}
