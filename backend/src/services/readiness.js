import { getPool } from '../db/pool.js';
import { readMigrationState } from '../migrationRunner.js';
import { AppError } from '../shared/AppError.js';

export async function checkReadiness({ pool, timeoutMs = 2000 } = {}) {
  let connection;
  let expired = false;
  let databaseUp = false;
  let timer;
  const unavailable = () => new AppError(503, 'DATABASE_UNAVAILABLE', 'The service is temporarily unavailable.');
  try {
    pool ??= getPool();
    const work = (async () => {
      const acquired = await pool.getConnection();
      if (expired) {
        acquired.destroy();
        throw unavailable();
      }
      connection = acquired;
      const [[row]] = await connection.execute('SELECT 1 AS ok');
      if (row?.ok !== 1) throw unavailable();
      databaseUp = true;
      const states = await readMigrationState(connection);
      if (states.some(state => state.status !== 'applied')) {
        throw new AppError(503, 'SCHEMA_NOT_READY', 'Workspace setup is incomplete.');
      }
      const [identity] = await connection.execute(
        "SELECT metadata_value FROM application_metadata WHERE metadata_key = 'application'",
      );
      if (identity[0]?.metadata_value !== 'export-accounting') {
        throw new AppError(503, 'SCHEMA_NOT_READY', 'Workspace setup is incomplete.');
      }
      return { status: 'ready', checks: { database: 'up', schema: 'current' } };
    })();
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(unavailable()); }, timeoutMs);
    });
    return await Promise.race([work, deadline]);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw databaseUp
      ? new AppError(503, 'SCHEMA_NOT_READY', 'Workspace setup is incomplete.')
      : unavailable();
  } finally {
    clearTimeout(timer);
    if (connection) {
      if (expired) connection.destroy();
      else connection.release();
    }
  }
}
