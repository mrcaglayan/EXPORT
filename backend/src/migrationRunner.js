import { createHash } from 'node:crypto';
import { getPool, getMigrationPool } from './db/pool.js';
import registeredMigrations from './migrations/index.js';

export class MigrationError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.code = code;
  }
}

function validateRegistry(migrations) {
  const keys = migrations.map(migration => migration.key);
  if (new Set(keys).size !== keys.length || keys.join() !== [...keys].sort().join()
    || migrations.some(migration => !/^m\d{3}_[a-z0-9_]+$/.test(migration.key)
      || !/^[a-f0-9]{64}$/.test(migration.checksum)
      || typeof migration.up !== 'function' || typeof migration.verify !== 'function')) {
    throw new MigrationError('MIGRATION_REGISTRY_INVALID', 'Migration keys must be unique, ordered, and have a checksum, up() and verify().');
  }
  for (const [index, migration] of migrations.entries()) {
    const replaced = migration.replacesVerificationFor ?? [];
    if (!Array.isArray(replaced) || new Set(replaced).size !== replaced.length
      || replaced.some(key => !keys.slice(0, index).includes(key))) {
      throw new MigrationError('MIGRATION_REGISTRY_INVALID', 'Verification replacements must name unique earlier migrations.');
    }
  }
}

export function migrationLockName(database) {
  return `export-accounting:migrate:${createHash('sha256').update(database).digest('hex').slice(0, 32)}`;
}

async function ensureHistory(connection) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_key VARCHAR(128) NOT NULL PRIMARY KEY,
      description VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      status ENUM('running', 'applied', 'failed') NOT NULL,
      attempts INT UNSIGNED NOT NULL DEFAULT 1,
      started_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      applied_at TIMESTAMP(6) NULL,
      error_code VARCHAR(64) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}

// This function is read-only, including on a completely fresh database.
export async function readMigrationState(connection, migrations = registeredMigrations) {
  validateRegistry(migrations);
  const [tables] = await connection.execute(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'
  `);
  const [rows] = tables.length
    ? await connection.execute('SELECT migration_key, checksum, status, attempts, error_code FROM schema_migrations ORDER BY migration_key')
    : [[]];
  const history = new Map(rows.map(row => [row.migration_key, row]));
  const result = migrations.map(migration => {
    const row = history.get(migration.key);
    return {
      key: migration.key,
      description: migration.description,
      status: row && row.checksum !== migration.checksum ? 'drifted' : row?.status ?? 'pending',
      attempts: row?.attempts ?? 0,
      errorCode: row?.error_code ?? null,
    };
  });
  for (const row of rows) {
    if (!migrations.some(migration => migration.key === row.migration_key)) {
      result.push({ key: row.migration_key, status: 'unknown', attempts: row.attempts, errorCode: row.error_code });
    }
  }
  return result;
}

export async function getMigrationStatus({ pool = getPool(), migrations = registeredMigrations } = {}) {
  const connection = await pool.getConnection();
  try {
    return await readMigrationState(connection, migrations);
  } finally {
    connection.release();
  }
}

export async function runMigrations({
  pool = getMigrationPool(), migrations = registeredMigrations, lockTimeout = 10, retryKey,
} = {}) {
  validateRegistry(migrations);
  if (!Number.isInteger(lockTimeout) || lockTimeout < 0 || lockTimeout > 60) {
    throw new MigrationError('MIGRATION_CONFIG_INVALID', 'Migration lock timeout must be 0–60 seconds.');
  }
  const connection = await pool.getConnection();
  let lockName;
  let locked = false;
  let destroyed = false;
  try {
    const [[{ database }]] = await connection.execute('SELECT DATABASE() AS `database`');
    if (!database || ['mysql', 'sys', 'information_schema', 'performance_schema', 'saap'].includes(database.toLowerCase())) {
      throw new MigrationError('MIGRATION_DATABASE_INVALID', 'Use an explicitly configured Export Accounting database.');
    }
    lockName = migrationLockName(database);
    const [[{ acquired }]] = await connection.execute('SELECT GET_LOCK(?, ?) AS acquired', [lockName, lockTimeout]);
    if (acquired !== 1) throw new MigrationError('MIGRATION_LOCKED', 'Another migration runner holds the database lock. Try again after it finishes.');
    locked = true;
    await ensureHistory(connection);
    const states = await readMigrationState(connection, migrations);
    if (states.some(state => ['drifted', 'unknown'].includes(state.status))) {
      throw new MigrationError('MIGRATION_DRIFT', 'Migration history differs from the registered sources. Restore matching sources and investigate before continuing.');
    }
    if (retryKey && !states.some(state => state.key === retryKey && ['failed', 'running'].includes(state.status))) {
      throw new MigrationError('MIGRATION_RETRY_INVALID', '--retry must name an existing failed or interrupted migration.');
    }
    const blocked = states.find(state => ['failed', 'running'].includes(state.status) && state.key !== retryKey);
    if (blocked) {
      throw new MigrationError('MIGRATION_RECOVERY_REQUIRED', `${blocked.key} is ${blocked.status}. Review partial DDL and follow docs/architecture/migrations.md before an explicit retry.`);
    }
    // Applied migrations must be a prefix of the registry.
    let sawUnapplied = false;
    for (const state of states) {
      if (state.status !== 'applied') sawUnapplied = true;
      else if (sawUnapplied) throw new MigrationError('MIGRATION_ORDER_INVALID', 'History contains an applied migration after an unapplied migration.');
    }
    for (const migration of migrations) {
      const state = states.find(item => item.key === migration.key);
      if (state.status === 'applied') {
        // A forward extension owns verification of the complete evolved schema.
        // Pending extensions never suppress the original check. Reviewed retries
        // may already contain partial DDL and must use the successor's verifier.
        const replaced = migrations.some(next => next.replacesVerificationFor?.includes(migration.key)
          && states.some(item => item.key === next.key && (item.status === 'applied'
            || (item.key === retryKey && ['failed', 'running'].includes(item.status)))));
        if (!replaced) await migration.verify(connection);
        continue;
      }
      if (state.status === 'pending') {
        await connection.execute(`
          INSERT INTO schema_migrations (migration_key, description, checksum, status)
          VALUES (?, ?, ?, 'running')
        `, [migration.key, migration.description, migration.checksum]);
      } else {
        await connection.execute(`
          UPDATE schema_migrations SET status = 'running', attempts = attempts + 1,
            started_at = CURRENT_TIMESTAMP(6), applied_at = NULL, error_code = NULL
          WHERE migration_key = ?
        `, [migration.key]);
      }
      try {
        // DDL is not wrapped in a transaction: MySQL commits it implicitly.
        await migration.up(connection);
        await migration.verify(connection);
        await connection.execute(`
          UPDATE schema_migrations SET status = 'applied', applied_at = CURRENT_TIMESTAMP(6), error_code = NULL
          WHERE migration_key = ?
        `, [migration.key]);
      } catch (error) {
        const errorCode = /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code ?? '') ? error.code : 'MIGRATION_STEP_FAILED';
        await connection.execute(
          "UPDATE schema_migrations SET status = 'failed', error_code = ? WHERE migration_key = ?",
          [errorCode, migration.key],
        ).catch(() => {}); // A lost connection leaves a durable 'running' record.
        throw new MigrationError('MIGRATION_FAILED', `${migration.key} failed (${errorCode}). Partial DDL may exist; automatic retries are disabled.`, { cause: error });
      }
    }
    return await readMigrationState(connection, migrations);
  } finally {
    if (locked) {
      try {
        const [[{ released }]] = await connection.execute('SELECT RELEASE_LOCK(?) AS released', [lockName]);
        if (released !== 1) throw new Error('Migration lock was not released.');
      } catch {
        connection.destroy();
        destroyed = true;
      }
    }
    if (!destroyed) connection.release();
  }
}
