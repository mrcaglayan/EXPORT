import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { withTransaction } from '../db/query.js';
import * as validate from '../validators/auth.validators.js';
import { AppError } from '../shared/AppError.js';

// Explicit CLI-only provisioning. There is no public signup or bootstrap endpoint.
// Repeating setup must not reset an existing user's password or elevate access.
export async function bootstrapIdentity(input) {
  const tenantCode = validate.code(input.tenantCode);
  const tenantName = validate.text(input.tenantName, 160);
  const entityCode = validate.code(input.entityCode);
  const entityName = validate.text(input.entityName, 160);
  const email = validate.email(input.email);
  const displayName = validate.text(input.displayName, 120);
  const hash = await bcrypt.hash(validate.password(input.password, true), 12);
  const ids = { tenantId: randomUUID(), entityId: randomUUID(), userId: randomUUID(), roleId: randomUUID() };
  return withTransaction(async tx => {
    const { rows: existing } = await tx.query('SELECT id FROM tenants WHERE code = ?', [tenantCode]);
    if (existing.length) throw new AppError(409, 'TENANT_EXISTS', 'This workspace already exists. Setup will not modify it.');
    await tx.query('INSERT INTO tenants (id, code, name) VALUES (?, ?, ?)', [ids.tenantId, tenantCode, tenantName]);
    await tx.query('INSERT INTO legal_entities (id, tenant_id, code, name) VALUES (?, ?, ?, ?)',
      [ids.entityId, ids.tenantId, entityCode, entityName]);
    await tx.query('INSERT INTO users (id, tenant_id, email, display_name, password_hash) VALUES (?, ?, ?, ?, ?)',
      [ids.userId, ids.tenantId, email, displayName, hash]);
    await tx.query('INSERT INTO roles (id, tenant_id, code, name) VALUES (?, ?, ?, ?)',
      [ids.roleId, ids.tenantId, 'ADMIN', 'Entity administrator']);
    await tx.query(`INSERT INTO role_permissions (tenant_id, role_id, permission_code)
      SELECT ?, ?, code FROM permissions`, [ids.tenantId, ids.roleId]);
    await tx.query(`INSERT INTO user_role_assignments (tenant_id, user_id, role_id, legal_entity_id)
      VALUES (?, ?, ?, ?)`, [ids.tenantId, ids.userId, ids.roleId, ids.entityId]);
    return ids;
  });
}
