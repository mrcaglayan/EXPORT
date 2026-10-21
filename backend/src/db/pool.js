import mysql from 'mysql2/promise';
import { getDatabaseConfig } from '../config/env.js';

let pool;
let migrationPool;

export function getPool() {
  pool ??= mysql.createPool({
    ...getDatabaseConfig(),
    charset: 'utf8mb4',
    dateStrings: ['DATE'],
    waitForConnections: true,
    connectTimeout: 5000,
    queueLimit: 0,
  });
  return pool;
}

// Used only by the explicit migration runner. HTTP services always use getPool.
export function getMigrationPool() {
  if (!process.env.MIGRATION_DB_USER && !process.env.MIGRATION_DB_PASSWORD) return getPool();
  if (!process.env.MIGRATION_DB_USER || !process.env.MIGRATION_DB_PASSWORD) throw new Error('Both migration credentials are required.');
  migrationPool ??= mysql.createPool({
    ...getDatabaseConfig(), user: process.env.MIGRATION_DB_USER, password: process.env.MIGRATION_DB_PASSWORD,
    charset: 'utf8mb4', dateStrings: ['DATE'], connectionLimit: 4, connectTimeout: 5000,
  });
  return migrationPool;
}

export async function closePool() {
  if (migrationPool) {
    const current = migrationPool;
    migrationPool = undefined;
    await current.end();
  }
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}
