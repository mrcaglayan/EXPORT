import { getMigrationStatus, runMigrations, MigrationError } from './migrationRunner.js';
import { closePool } from './db/pool.js';

try {
  const args = process.argv.slice(2);
  let states;
  if (args.length === 1 && args[0] === 'status') {
    states = await getMigrationStatus();
  } else if (args.length === 0 || (args.length === 2 && args[0] === '--retry')) {
    states = await runMigrations({ retryKey: args[1] });
  } else {
    throw new MigrationError('MIGRATION_USAGE', 'Usage: node src/migrate.js [status | --retry mNNN_name]');
  }
  console.table(states);
  if (states.some(state => !['applied', 'pending'].includes(state.status))) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof MigrationError
    ? `BLOCKED [${error.code}]: ${error.message}`
    : `BLOCKED: migration database operation failed (${error.code || 'CONFIGURATION_OR_SCHEMA_ERROR'}). Check local configuration and schema; no database was created or reset.`);
  process.exitCode = 1;
} finally {
  await closePool();
}
