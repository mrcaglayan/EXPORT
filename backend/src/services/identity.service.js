import { randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { query, withTransaction } from '../db/query.js';
import { AppError } from '../shared/AppError.js';
import { unauthorized } from './session-security.js';

export const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have access to this legal entity or action.');
const missing = () => new AppError(404, 'NOT_FOUND', 'Legal entity not found.');
let dummyHash;
const dummy = () => dummyHash ??= bcrypt.hash(randomUUID(), 12);

export async function limitLogin(ip, credentials) {
  const keys = [
    [`ip:${ip}`, 100],
    [`account:${credentials.tenantCode}:${credentials.email}`, 20],
  ].map(([key, limit]) => [createHash('sha256').update(key).digest('hex'), limit]).sort(([a], [b]) => a.localeCompare(b));
  const limited = await withTransaction(async tx => {
    let blocked = false;
    for (const [key, limit] of keys) {
      await tx.query(`INSERT INTO auth_rate_limits (bucket_key, hits, expires_at)
        VALUES (?, 1, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))
        ON DUPLICATE KEY UPDATE
          hits = IF(expires_at <= UTC_TIMESTAMP(), 1, LEAST(hits + 1, 1000000)),
          expires_at = IF(expires_at <= UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), expires_at)`, [key]);
      const { rows } = await tx.query('SELECT hits FROM auth_rate_limits WHERE bucket_key = ?', [key]);
      if (rows[0].hits > limit) blocked = true;
    }
    // Bounded opportunistic cleanup; counters survive process restarts.
    await tx.query('DELETE FROM auth_rate_limits WHERE expires_at < UTC_TIMESTAMP() LIMIT 100');
    return blocked;
  });
  if (limited) throw new AppError(429, 'LOGIN_RATE_LIMITED', 'Too many sign-in attempts. Try again in 15 minutes.');
}

export async function permissionsFor(identity, legalEntityId, executor = { query }) {
  if (!legalEntityId) return [];
  const { rows } = await executor.query(`SELECT DISTINCT rp.permission_code AS code
    FROM user_role_assignments a
    JOIN role_permissions rp ON rp.tenant_id = a.tenant_id AND rp.role_id = a.role_id
    JOIN legal_entities e ON e.tenant_id = a.tenant_id AND e.id = a.legal_entity_id AND e.active = 1
    JOIN users u ON u.tenant_id = a.tenant_id AND u.id = a.user_id AND u.active = 1
    JOIN tenants t ON t.id = a.tenant_id AND t.active = 1
    WHERE a.tenant_id = ? AND a.user_id = ? AND a.legal_entity_id = ?
    ORDER BY rp.permission_code`, [identity.tenantId, identity.userId, legalEntityId]);
  return rows.map(row => row.code);
}
export async function requirePermission(identity, entity, permission, executor = { query }) {
  const granted = await permissionsFor(identity, entity, executor);
  if (!granted.includes('workspace.read') || !granted.includes(permission)) throw forbidden();
}
export async function entitiesFor(identity, executor = { query }) {
  const { rows } = await executor.query(`SELECT DISTINCT e.id, e.code, e.name
    FROM legal_entities e
    JOIN user_role_assignments a ON a.tenant_id = e.tenant_id AND a.legal_entity_id = e.id
    JOIN role_permissions rp ON rp.tenant_id = a.tenant_id AND rp.role_id = a.role_id
    WHERE e.tenant_id = ? AND a.user_id = ? AND e.active = 1 AND rp.permission_code = 'workspace.read'
    ORDER BY e.code`, [identity.tenantId, identity.userId]);
  return rows;
}
export async function authenticate(payload) {
  const { rows } = await query(`SELECT s.id, s.tenant_id AS tenantId, s.user_id AS userId,
      s.active_entity_id AS activeEntityId, u.email, u.display_name AS displayName,
      t.code AS tenantCode, t.name AS tenantName
    FROM auth_sessions s
    JOIN users u ON u.tenant_id = s.tenant_id AND u.id = s.user_id AND u.active = 1
    JOIN tenants t ON t.id = s.tenant_id AND t.active = 1
    WHERE s.id = ? AND s.user_id = ? AND s.tenant_id = ?
      AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP()`,
  [payload.jti, payload.sub, payload.tid]);
  if (!rows[0]) throw unauthorized();
  return rows[0];
}
export async function profile(identity) {
  const entities = await entitiesFor(identity);
  const activeEntity = entities.find(e => e.id === identity.activeEntityId) ?? null;
  return {
    user: { id: identity.userId, email: identity.email, displayName: identity.displayName },
    tenant: { id: identity.tenantId, code: identity.tenantCode, name: identity.tenantName },
    entities, activeEntity,
    permissions: await permissionsFor(identity, activeEntity?.id),
  };
}
export async function login(credentials, config, oldPayload) {
  const { rows } = await query(`SELECT u.id AS userId, u.tenant_id AS tenantId, u.password_hash AS passwordHash
    FROM users u JOIN tenants t ON t.id = u.tenant_id
    WHERE t.code = ? AND u.email COLLATE utf8mb4_bin = ? AND u.active = 1 AND t.active = 1`,
  [credentials.tenantCode, credentials.email]);
  const user = rows[0];
  const matches = await bcrypt.compare(credentials.password, user?.passwordHash ?? await dummy());
  if (!user || !matches) throw new AppError(401, 'INVALID_CREDENTIALS', 'Workspace, email or password is incorrect.');
  const entities = await entitiesFor(user);
  const session = { id: randomUUID(), userId: user.userId, tenantId: user.tenantId };
  await withTransaction(async tx => {
    // Recheck status under lock; disabled accounts cannot open a new session.
    const { rows: active } = await tx.query(`SELECT u.id FROM users u JOIN tenants t ON t.id = u.tenant_id
      WHERE u.tenant_id = ? AND u.id = ? AND u.active = 1 AND t.active = 1 FOR SHARE`, [user.tenantId, user.userId]);
    if (!active.length) throw unauthorized();
    if (oldPayload) await tx.query(`UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP()
      WHERE id = ? AND tenant_id = ? AND user_id = ?`, [oldPayload.jti, oldPayload.tid, oldPayload.sub]);
    await tx.query(`INSERT INTO auth_sessions (id, tenant_id, user_id, active_entity_id, expires_at)
      VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))`,
    [session.id, session.tenantId, session.userId, entities[0]?.id ?? null, config.sessionSeconds]);
    await tx.query('DELETE FROM auth_sessions WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) LIMIT 100');
  });
  return session;
}
export async function logout(identity) {
  await query(`UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP()
    WHERE id = ? AND tenant_id = ? AND user_id = ?`, [identity.id, identity.tenantId, identity.userId]);
}
export async function selectEntity(identity, entity) {
  await requirePermission(identity, entity, 'workspace.read');
  const { rows } = await query(`UPDATE auth_sessions SET active_entity_id = ?
    WHERE id = ? AND tenant_id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
  [entity, identity.id, identity.tenantId, identity.userId]);
  if (!rows.affectedRows) throw unauthorized();
  return profile({ ...identity, activeEntityId: entity });
}
export async function readEntity(identity, entity) {
  const permissions = await permissionsFor(identity, entity);
  if (!permissions.includes('workspace.read')) throw missing();
  if (!permissions.includes('organizations.read')) throw forbidden();
  const { rows } = await query('SELECT id, code, name FROM legal_entities WHERE tenant_id = ? AND id = ? AND active = 1',
    [identity.tenantId, entity]);
  if (!rows[0]) throw missing();
  return rows[0];
}
export async function listOrganizations(identity, offset, limit) {
  const scope = `FROM legal_entities e WHERE e.tenant_id = ? AND e.active = 1
    AND EXISTS (SELECT 1 FROM user_role_assignments a
      JOIN role_permissions rp ON rp.tenant_id = a.tenant_id AND rp.role_id = a.role_id
      WHERE a.tenant_id = e.tenant_id AND a.legal_entity_id = e.id AND a.user_id = ?
      AND rp.permission_code = 'workspace.read')
    AND EXISTS (SELECT 1 FROM user_role_assignments a
      JOIN role_permissions rp ON rp.tenant_id = a.tenant_id AND rp.role_id = a.role_id
      WHERE a.tenant_id = e.tenant_id AND a.legal_entity_id = e.id AND a.user_id = ?
      AND rp.permission_code = 'organizations.read')`;
  const args = [identity.tenantId, identity.userId, identity.userId];
  const { rows: items } = await query(`SELECT e.id, e.code, e.name ${scope} ORDER BY e.code LIMIT ${limit} OFFSET ${offset}`, args);
  const { rows: counts } = await query(`SELECT COUNT(*) AS total ${scope}`, args);
  return { items, total: counts[0].total, offset, limit };
}
export async function updateEntity(identity, entity, name) {
  return withTransaction(async tx => {
    // Service repeats authorization, independently of route/browser state.
    await requirePermission(identity, entity, 'organizations.update', tx);
    await tx.query('UPDATE legal_entities SET name = ? WHERE tenant_id = ? AND id = ? AND active = 1',
      [name, identity.tenantId, entity]);
    const { rows } = await tx.query('SELECT id, code, name FROM legal_entities WHERE tenant_id = ? AND id = ? AND active = 1',
      [identity.tenantId, entity]);
    if (!rows[0]) throw missing();
    return rows[0];
  });
}
