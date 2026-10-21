import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { getDatabaseConfig } from '../src/config/env.js';
import { runMigrations } from '../src/migrationRunner.js';
import { closePool } from '../src/db/pool.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
let pool;
try {
  const config = getDatabaseConfig();
  if (process.env.NODE_ENV === 'production' || config.host !== '127.0.0.1' || config.port !== 3306
    || config.database !== 'export_accounting_dev') throw new Error('LOCAL_INSTANCE_REQUIRED');
  const credential = JSON.parse(await readFile(path.join(root, '.local/mysql/admin.json'), 'utf8'));
  pool = mysql.createPool({ ...config, user: 'root', password: credential.password, connectionLimit: 2 });
  const [[server]] = await pool.query('SELECT @@datadir AS dataDir');
  const normalized = async p => (await realpath(p)).replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
  if (await normalized(server.dataDir) !== await normalized(path.join(root, '.local/mysql/data'))) throw new Error('LOCAL_INSTANCE_REQUIRED');
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--retry')) throw new Error('INVALID_ARGUMENTS');
  console.table(await runMigrations({ pool, retryKey: args[1] }));
} catch (error) {
  console.error(`Local migration failed (${error.code || 'LOCAL_INSTANCE_OR_CONFIGURATION_ERROR'}). No server settings or account privileges were changed.`);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
  await closePool();
}
