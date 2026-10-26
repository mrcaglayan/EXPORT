import { object, text, entityId, invalid } from './auth.validators.js';
import { page } from './accounting.validators.js';

export function reason(body) { object(body, ['reason']); return { reason: text(body.reason, 255) }; }
export function mapping(body) {
  object(body, ['accountIds', 'reason']);
  if (!Array.isArray(body.accountIds) || !body.accountIds.length) throw invalid();
  const accountIds = body.accountIds.map(entityId).sort();
  if (new Set(accountIds).size !== accountIds.length) throw invalid();
  return { accountIds, reason: text(body.reason, 255) };
}
export function report(input) {
  object(input, ['periodId', 'snapshotId', 'grain', 'groupBy', 'warehouseId', 'skuId', 'familyId', 'poolId', 'layerId', 'limit', 'offset']);
  const grain = input.grain ?? 'PHYSICAL', groupBy = input.groupBy ?? 'layer';
  if (!['PHYSICAL', 'POOL'].includes(grain) || !['layer', 'sku', 'family', 'warehouse', 'pool'].includes(groupBy)
    || (grain === 'PHYSICAL' && (groupBy === 'pool' || input.poolId))) throw invalid();
  return { periodId: entityId(input.periodId), grain, groupBy, ...page({ limit: input.limit, offset: input.offset }),
    ...Object.fromEntries(['snapshotId', 'warehouseId', 'skuId', 'familyId', 'poolId', 'layerId'].filter(k => input[k]).map(k => [k, entityId(input[k])])) };
}
export function pagination(input) { object(input, ['limit', 'offset']); return page(input); }
