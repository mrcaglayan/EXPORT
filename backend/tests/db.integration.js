import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { getDatabaseConfig } from '../src/config/env.js';
import { getPool, closePool } from '../src/db/pool.js';
import { query, withTransaction } from '../src/db/query.js';
import { getMigrationStatus, runMigrations } from '../src/migrationRunner.js';
import migrations from '../src/migrations/index.js';
import { checkReadiness } from '../src/services/readiness.js';

// This file can only run against the random schema created by test-pr00.js.
assert.match(process.env.DB_NAME ?? '', /^export_accounting_test_[a-f0-9]{16}$/);
assert.equal(process.env.PR00_TEST_DATABASE, process.env.DB_NAME);

function fixture(key, up, verify) {
  return { key, description: 'Synthetic integration fixture', checksum: createHash('sha256').update(key).digest('hex'), up, verify };
}

test('isolated MySQL foundation integration', { timeout: 30000 }, async t => {
  const pool = getPool();
  t.after(closePool);

  await t.test('status and readiness are read-only on a fresh schema', async () => {
    const before = await getMigrationStatus();
    assert.deepEqual(before.map(row => row.status), migrations.map(() => 'pending'));
    await assert.rejects(checkReadiness(), { code: 'SCHEMA_NOT_READY' });
    const [tables] = await pool.query('SHOW TABLES');
    assert.equal(tables.length, 0);
  });

  await t.test('fresh migration applies once, verifies structure and enables readiness', async () => {
    const states = await runMigrations();
    assert.deepEqual(states.map(row => row.status), migrations.map(() => 'applied'));
    const [before] = await pool.execute('SELECT * FROM schema_migrations');
    const rerun = await runMigrations();
    const [after] = await pool.execute('SELECT * FROM schema_migrations');
    assert.deepEqual(after, before);
    assert.equal(rerun[0].attempts, 1);
    assert.equal((await checkReadiness()).status, 'ready');
    const [tables] = await pool.query('SHOW TABLES');
    assert.equal(tables.length,73);
  });

  await t.test('real transaction commit and rollback preserve data and release connections', async () => {
    await pool.execute('CREATE TABLE transaction_probe (id INT PRIMARY KEY, amount INT NOT NULL) ENGINE=InnoDB');
    const result = await withTransaction(async tx => {
      await tx.query('INSERT INTO transaction_probe (id, amount) VALUES (?, ?)', [1, 10]);
      return 'committed';
    });
    assert.equal(result, 'committed');
    await assert.rejects(withTransaction(async tx => {
      await tx.query('INSERT INTO transaction_probe (id, amount) VALUES (?, ?)', [2, 20]);
      await tx.query('INSERT INTO transaction_probe (id, amount) VALUES (?, ?)', [1, 99]);
    }), { code: 'ER_DUP_ENTRY' });
    const { rows } = await query('SELECT * FROM transaction_probe ORDER BY id');
    assert.deepEqual(rows, [{ id: 1, amount: 10 }]);
    // A subsequent transaction must still work after rollback.
    await withTransaction(tx => tx.query('UPDATE transaction_probe SET amount = ? WHERE id = ?', [11, 1]));
  });

  await t.test('actual rejected DB credentials produce a safe unavailable result', async () => {
    const badPool = mysql.createPool({ ...getDatabaseConfig(), password: 'deliberately-invalid-test-password', connectTimeout: 1000 });
    try {
      await assert.rejects(checkReadiness({ pool: badPool }), { code: 'DATABASE_UNAVAILABLE', status: 503 });
    } finally {
      await badPool.end();
    }
  });

  let releaseFirst;
  let signalEntered;
  const entered = new Promise(resolve => { signalEntered = resolve; });
  const held = new Promise(resolve => { releaseFirst = resolve; });
  let lockExecutions = 0;
  const lockProbe = fixture('m900_lock_probe', async connection => {
    lockExecutions++;
    signalEntered();
    await held;
    await connection.execute('CREATE TABLE IF NOT EXISTS lock_probe (id INT PRIMARY KEY) ENGINE=InnoDB');
  }, async connection => { await connection.execute('SELECT id FROM lock_probe LIMIT 1'); });
  let registry = [...migrations, lockProbe];

  await t.test('concurrent runners on independent connections cannot both apply a migration', async () => {
    const first = runMigrations({ migrations: registry });
    try {
      await entered;
      await assert.rejects(runMigrations({ migrations: registry, lockTimeout: 0 }), { code: 'MIGRATION_LOCKED' });
    } finally {
      releaseFirst();
      await first;
    }
    await runMigrations({ migrations: registry });
    assert.equal(lockExecutions, 1);
  });

  let failAfterDdl = true;
  const partial = fixture('m901_partial_probe', async connection => {
    await connection.execute('CREATE TABLE IF NOT EXISTS partial_probe (id INT PRIMARY KEY) ENGINE=InnoDB');
    if (failAfterDdl) throw new Error('Simulated failure after committed DDL');
    await connection.execute('INSERT IGNORE INTO partial_probe VALUES (1)');
  }, async connection => {
    const [[row]] = await connection.execute('SELECT COUNT(*) AS count FROM partial_probe WHERE id = 1');
    assert.equal(row.count, 1);
  });
  registry = [...registry, partial];

  await t.test('partial DDL failure is recorded and blocks an automatic rerun', async () => {
    await assert.rejects(runMigrations({ migrations: registry }), { code: 'MIGRATION_FAILED' });
    const [rows] = await pool.execute('SELECT * FROM partial_probe');
    assert.equal(rows.length, 0); // CREATE TABLE persisted despite the failure.
    assert.equal((await getMigrationStatus({ migrations: registry })).at(-1).status, 'failed');
    await assert.rejects(runMigrations({ migrations: registry }), { code: 'MIGRATION_RECOVERY_REQUIRED' });
    await assert.rejects(runMigrations({ migrations: registry, retryKey: 'm999_missing' }), { code: 'MIGRATION_RETRY_INVALID' });
  });

  await t.test('explicit reviewed retry completes a failed resumable migration', async () => {
    failAfterDdl = false;
    const states = await runMigrations({ migrations: registry, retryKey: partial.key });
    assert.equal(states.at(-1).status, 'applied');
    assert.equal(states.at(-1).attempts, 2);
  });

  const interrupted = fixture('m902_interrupted_probe',
    async connection => { await connection.execute('SELECT 1'); },
    async connection => { await connection.execute('SELECT 1'); });
  registry = [...registry, interrupted];

  await t.test('interrupted runs remain blocked until explicitly retried', async () => {
    await pool.execute(`
      INSERT INTO schema_migrations (migration_key, description, checksum, status)
      VALUES (?, ?, ?, 'running')
    `, [interrupted.key, interrupted.description, interrupted.checksum]);
    await assert.rejects(runMigrations({ migrations: registry }), { code: 'MIGRATION_RECOVERY_REQUIRED' });
    assert.equal((await runMigrations({ migrations: registry, retryKey: interrupted.key })).at(-1).status, 'applied');
  });

  await t.test('checksum drift, unknown history and duplicate registry keys are rejected', async () => {
    const drifted = registry.map((item, index) => index ? item : { ...item, checksum: '0'.repeat(64) });
    await assert.rejects(runMigrations({ migrations: drifted }), { code: 'MIGRATION_DRIFT' });
    await assert.rejects(runMigrations({ migrations: registry.slice(0, -1) }), { code: 'MIGRATION_DRIFT' });
    await assert.rejects(runMigrations({ migrations: [...registry, interrupted] }), { code: 'MIGRATION_REGISTRY_INVALID' });
    assert.equal((await runMigrations({ migrations: registry })).length, migrations.length + 3); // Lock was released after each failure.
  });
});
