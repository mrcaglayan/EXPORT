import { getDatabaseConfig } from '../src/config/env.js';
import { getPool, closePool } from '../src/db/pool.js';

try {
  getDatabaseConfig();
  const [rows] = await getPool().execute('SELECT 1 AS ok');
  if (rows[0]?.ok !== 1) throw new Error('Unexpected SELECT 1 result.');
  console.log('PASS: database connection verified (SELECT 1 AS ok).');
} catch (error) {
  const reason = error.code
    ? `${error.code}. Check the local MySQL server, database and credentials.`
    : error.message;
  console.error(`BLOCKED: database connectivity not verified. ${reason}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
