import { once } from 'node:events';
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
