import '../src/config/env.js';
import { bootstrapIdentity } from '../src/services/bootstrap-identity.service.js';
import { closePool } from '../src/db/pool.js';

try {
  await bootstrapIdentity({
    tenantCode: process.env.SETUP_TENANT_CODE, tenantName: process.env.SETUP_TENANT_NAME,
    entityCode: process.env.SETUP_ENTITY_CODE, entityName: process.env.SETUP_ENTITY_NAME,
    email: process.env.SETUP_ADMIN_EMAIL, displayName: process.env.SETUP_ADMIN_NAME,
    password: process.env.SETUP_ADMIN_PASSWORD,
  });
  console.log('Created the workspace, legal entity and scoped administrator. No credentials are printed.');
} catch (error) {
  console.error(`Administrator setup failed (${error.code || 'SETUP_FAILED'}). Check the documented SETUP_* environment variables; existing accounts are never reset.`);
  process.exitCode = 1;
} finally { await closePool(); }
