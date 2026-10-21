import { randomBytes } from 'node:crypto';
import { readFile, writeFile, realpath, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import '../src/config/env.js';
import { getPool, closePool } from '../src/db/pool.js';
import { bootstrapIdentity } from '../src/services/bootstrap-identity.service.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
try {
  if (process.env.NODE_ENV === 'production') throw new Error('LOCAL_ONLY');
  const [[server]] = await getPool().query('SELECT @@datadir AS dataDir, DATABASE() AS databaseName');
  const normalize = async p => (await realpath(p)).replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
  if (server.databaseName !== 'export_accounting_dev'
    || await normalize(server.dataDir) !== await normalize(path.join(root, '.local/mysql/data'))) throw new Error('LOCAL_ONLY');
  const envPath = path.join(root, 'backend/.env');
  let env = await readFile(envPath, 'utf8');
  if (!/^AUTH_SECRET=/m.test(env)) {
    env += `\nAUTH_SECRET=${randomBytes(32).toString('hex')}\nAUTH_SESSION_SECONDS=28800\n`;
    await writeFile(envPath, env, { mode: 0o600 });
  }
  const file = path.join(root, '.local/auth/initial-account.json');
  await mkdir(path.dirname(file), { recursive: true });
  let account;
  try { account = JSON.parse(await readFile(file, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    account = {
      tenantCode: process.env.SETUP_TENANT_CODE || 'EXPORT',
      tenantName: process.env.SETUP_TENANT_NAME || 'Export Accounting',
      entityCode: process.env.SETUP_ENTITY_CODE || 'MAIN',
      entityName: process.env.SETUP_ENTITY_NAME || 'Export Accounting',
      email: process.env.SETUP_ADMIN_EMAIL || 'owner@export.local',
      displayName: process.env.SETUP_ADMIN_NAME || 'Workspace owner',
      password: randomBytes(24).toString('base64url'),
    };
    // Write before provisioning so interrupted setup can be safely retried.
    await writeFile(file, `${JSON.stringify(account, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }
  const [existing] = await getPool().execute('SELECT id FROM tenants WHERE code = ?', [account.tenantCode]);
  if (existing.length) console.log('Workspace already exists; credentials and access were not changed.');
  else {
    // Pass the generated credential through environment for the normal setup contract.
    process.env.SETUP_ADMIN_PASSWORD = account.password;
    await bootstrapIdentity({ ...account, password: process.env.SETUP_ADMIN_PASSWORD });
    delete process.env.SETUP_ADMIN_PASSWORD;
    console.log('Created the local workspace and administrator.');
  }
  console.log('Local sign-in details: .local/auth/initial-account.json (ignored; open locally). Restart the API after first setup.');
} catch (error) {
  console.error(`Local auth setup failed (${error.code || 'LOCAL_SETUP_FAILED'}). Only the repository-owned development database is supported.`);
  process.exitCode = 1;
} finally { await closePool(); }
