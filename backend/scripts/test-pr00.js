import { randomBytes } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const suffix = randomBytes(8).toString('hex');
const database = `export_accounting_test_${suffix}`;
const user = `export_test_${suffix}`;
const password = randomBytes(32).toString('hex');
const mode = process.argv[2] ?? 'foundation';
if (!['corrections', 'inventory-performance', 'closing', 'reservations', 'reallocations', 'receipts', 'inventory', 'classification', 'products', 'foundation', 'auth', 'browser', 'accounting', 'journal-performance', 'journal-browser'].includes(mode)) throw new Error('Unsupported test mode.');
const normalize = value => realpathSync(value).replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
let admin;
let createdDatabase = false;
let createdUser = false;

try {
  // Only the previously provisioned repository-local instance can run this harness.
  const credentials = JSON.parse(readFileSync(path.join(repository, '.local/mysql/admin.json'), 'utf8'));
  admin = await mysql.createConnection({
    host: '127.0.0.1', port: 3306, user: 'root', password: credentials.password, connectTimeout: 3000,
  });
  const [[identity]] = await admin.query('SELECT @@datadir AS dataDir');
  if (normalize(identity.dataDir) !== normalize(path.join(repository, '.local/mysql/data'))) {
    throw new Error('Test harness refuses a MySQL instance outside this repository.');
  }
  await admin.query(`CREATE DATABASE ${mysql.escapeId(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  createdDatabase = true;
  await admin.query('CREATE USER ?@? IDENTIFIED BY ?', [user, '127.0.0.1', password]);
  createdUser = true;
  await admin.query(`GRANT ALL PRIVILEGES ON ${mysql.escapeId(database)}.* TO ?@?`, [user, '127.0.0.1']);
  console.log(`Running ${mode} tests in a newly created, isolated test schema.`);
  const args = mode === 'corrections' ? ['--test', 'tests/inventory-corrections.integration.js'] : mode === 'inventory-performance' ? ['--test', 'tests/inventory-performance.integration.js'] : mode === 'closing' ? ['--test', 'tests/inventory-close.integration.js'] : mode === 'reservations' ? ['--test', 'tests/inventory-reservations.integration.js'] : mode === 'reallocations' ? ['--test', 'tests/inventory-reallocations.integration.js'] : mode === 'receipts' ? ['--test', 'tests/inventory-receipts.integration.js'] : mode === 'inventory' ? ['--test', 'tests/inventory-foundation.integration.js'] : mode === 'classification' ? ['--test', 'tests/product-classification.integration.js'] : mode === 'products' ? ['--test', 'tests/products.integration.js'] : mode === 'journal-performance' ? ['--test', 'tests/journal-performance.integration.js']
    : mode === 'accounting' ? ['--test', 'tests/money.test.js', 'tests/accounting.integration.js'] : ['browser', 'journal-browser'].includes(mode) ? ['scripts/test-auth-browser.js'] : mode === 'auth'
    ? ['--test', 'tests/auth.integration.js']
    : ['--test', 'tests/bootstrap.test.js', 'tests/foundation.test.js', 'tests/db.integration.js'];
  const child = spawn(process.execPath, args, {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    windowsHide: true,
    stdio: 'inherit',
    env: {
      ...process.env, NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:5173',
      DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: database, DB_USER: user,
      DB_PASSWORD: password, DB_CONNECTION_LIMIT: '4', PR00_TEST_DATABASE: database,
      AUTH_SECRET: randomBytes(32).toString('hex'),
      SMOKE_JOURNAL_PERFORMANCE: mode === 'journal-browser' ? '1' : '0',
      // Privileged DDL connection only; application/test operations keep the
      // disposable schema-scoped user. Never grant SUPER to that user.
      MIGRATION_DB_USER: 'root', MIGRATION_DB_PASSWORD: credentials.password,
    },
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => resolve(signal ? 1 : exitCode ?? 1));
  });
  process.exitCode = code;
} catch (error) {
  console.error(`BLOCKED: ${mode} integration harness (${error.code || 'LOCAL_INSTANCE_REQUIRED'}). Start the repository-local MySQL instance; no existing schema was reset.`);
  process.exitCode = 1;
} finally {
  if (admin) {
    try {
      // Names are generated above; flags become true only after CREATE succeeded.
      if (createdDatabase) await admin.query(`DROP DATABASE ${mysql.escapeId(database)}`);
      if (createdUser) await admin.query('DROP USER ?@?', [user, '127.0.0.1']);
      if (createdDatabase) console.log('Removed only this run’s disposable test schema and account.');
    } catch {
      console.error(`Test cleanup incomplete. Review local test schema ${database} and account ${user}.`);
      process.exitCode = 1;
    } finally {
      await admin.end();
    }
  }
}
