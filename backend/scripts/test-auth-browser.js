import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { getServerConfig } from '../src/config/env.js';
import { runMigrations } from '../src/migrationRunner.js';
import { closePool } from '../src/db/pool.js';
import { createFixtures } from '../tests/auth-fixtures.js';
import { query } from '../src/db/query.js';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';

let server;
let vite;
try {
  await runMigrations();
  const fixture = await createFixtures();
  await query('INSERT INTO role_permissions (tenant_id, role_id, permission_code) VALUES (?, ?, ?)',
    [fixture.alpha.tenantId, fixture.viewerRole, 'products.read']);
  const inventoryReader = randomUUID();
  await query('INSERT INTO roles (id, tenant_id, code, name) VALUES (?, ?, ?, ?)', [inventoryReader, fixture.alpha.tenantId, 'INVENTORY_READER', 'Inventory reader']);
  for (const permission of ['workspace.read', 'organizations.read', 'settings.read', 'inventory.read']) await query('INSERT INTO role_permissions (tenant_id, role_id, permission_code) VALUES (?, ?, ?)', [fixture.alpha.tenantId, inventoryReader, permission]);
  await query('INSERT INTO user_role_assignments (tenant_id, user_id, role_id, legal_entity_id) VALUES (?, ?, ?, ?)', [fixture.alpha.tenantId, fixture.noAccess, inventoryReader, fixture.secondEntity]);
  const reviewer = randomUUID(), reviewerRole = randomUUID();
  await query(`INSERT INTO users (id,tenant_id,email,display_name,password_hash) SELECT ?,tenant_id,'reviewer@alpha.test','Inventory reviewer',password_hash FROM users WHERE id = ?`, [reviewer,fixture.alpha.userId]);
  await query('INSERT INTO roles (id,tenant_id,code,name) VALUES (?,?,?,?)', [reviewerRole,fixture.alpha.tenantId,'INVENTORY_REVIEWER','Inventory reviewer']);
  for (const permission of ['workspace.read','organizations.read','settings.read','inventory.read','inventory.reallocation.review','inventory.correction.review','inventory.period.approve','inventory.reconciliation.read','accounting.period.close']) await query('INSERT INTO role_permissions (tenant_id,role_id,permission_code) VALUES (?,?,?)', [fixture.alpha.tenantId,reviewerRole,permission]);
  await query('INSERT INTO user_role_assignments (tenant_id,user_id,role_id,legal_entity_id) VALUES (?,?,?,?)', [fixture.alpha.tenantId,reviewer,reviewerRole,fixture.secondEntity]);
  // Both servers are owned by this test run and use the disposable test DB.
  server = createApp({ config: getServerConfig({ NODE_ENV: 'test', CORS_ORIGIN: 'http://127.0.0.1:5184' }) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const frontendRoot = fileURLToPath(new URL('../../frontend/', import.meta.url));
  vite = await createServer({
    root: frontendRoot,
    configFile: `${frontendRoot}/vite.config.js`,
    server: {
      host: '127.0.0.1', port: 5184, strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${server.address().port}`, changeOrigin: false } },
    },
  });
  await vite.listen();
  const child = spawn(process.execPath, [process.env.SMOKE_JOURNAL_PERFORMANCE === '1' ? 'scripts/journal-performance.mjs' : 'scripts/smoke.mjs'], {
    cwd: frontendRoot, windowsHide: true, stdio: 'inherit',
    env: { ...process.env, SMOKE_BASE_URL: 'http://127.0.0.1:5184', SMOKE_TENANT: 'ALPHA',
      SMOKE_EMAIL: 'admin@alpha.test', SMOKE_PASSWORD: fixture.password,
      SMOKE_SECOND_ENTITY: fixture.secondEntity, SMOKE_VIEWER_EMAIL: 'viewer@alpha.test',
      SMOKE_INVENTORY_READER_EMAIL: 'none@alpha.test',
      SMOKE_INVENTORY_REVIEWER_EMAIL: 'reviewer@alpha.test',
      SMOKE_ISOLATED: '1' },
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
} finally {
  if (vite) await vite.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await closePool();
}
