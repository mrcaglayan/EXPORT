import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { bootstrapIdentity } from '../src/services/bootstrap-identity.service.js';
import { query } from '../src/db/query.js';

export async function createFixtures() {
  assert.match(process.env.DB_NAME ?? '', /^export_accounting_test_[a-f0-9]{16}$/);
  assert.equal(process.env.PR00_TEST_DATABASE, process.env.DB_NAME);
  const password = randomBytes(24).toString('base64url');
  const input = { tenantCode: 'ALPHA', tenantName: 'Synthetic Alpha', entityCode: 'A1', entityName: 'Alpha one',
    email: 'admin@alpha.test', displayName: 'Test administrator', password };
  const alpha = await bootstrapIdentity(input);
  const beta = await bootstrapIdentity({ ...input, tenantCode: 'BETA', tenantName: 'Synthetic Beta', entityCode: 'B1',
    entityName: 'Beta one', email: 'admin@beta.test' });
  const secondEntity = randomUUID();
  const unassignedEntity = randomUUID();
  for (const [id, code, name] of [[secondEntity, 'A2', 'Alpha two'], [unassignedEntity, 'A3', 'Alpha restricted']]) {
    await query('INSERT INTO legal_entities (id, tenant_id, code, name) VALUES (?, ?, ?, ?)', [id, alpha.tenantId, code, name]);
  }
  await query('INSERT INTO user_role_assignments (tenant_id, user_id, role_id, legal_entity_id) VALUES (?, ?, ?, ?)',
    [alpha.tenantId, alpha.userId, alpha.roleId, secondEntity]);
  const viewer = randomUUID();
  const noAccess = randomUUID();
  for (const [id, email] of [[viewer, 'viewer@alpha.test'], [noAccess, 'none@alpha.test']]) {
    await query(`INSERT INTO users (id, tenant_id, email, display_name, password_hash)
      SELECT ?, tenant_id, ?, 'Synthetic user', password_hash FROM users WHERE id = ?`, [id, email, alpha.userId]);
  }
  const role = randomUUID();
  await query('INSERT INTO roles (id, tenant_id, code, name) VALUES (?, ?, ?, ?)', [role, alpha.tenantId, 'VIEWER', 'Entity viewer']);
  for (const permission of ['workspace.read', 'organizations.read', 'settings.read', 'accounting.read']) {
    await query('INSERT INTO role_permissions (tenant_id, role_id, permission_code) VALUES (?, ?, ?)', [alpha.tenantId, role, permission]);
  }
  await query('INSERT INTO user_role_assignments (tenant_id, user_id, role_id, legal_entity_id) VALUES (?, ?, ?, ?)',
    [alpha.tenantId, viewer, role, secondEntity]);
  return { alpha, beta, secondEntity, unassignedEntity, viewer, noAccess, viewerRole: role, password, input };
}
