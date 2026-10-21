import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});

function integerSetting(source, key, fallback, max) {
  const raw = source[key] ?? String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${key} must be an integer between 1 and ${max}.`);
  }
  return value;
}

export function getServerConfig(source = process.env) {
  const nodeEnv = source.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test or production.');
  }
  if (nodeEnv === 'production' && !source.CORS_ORIGIN?.trim()) {
    throw new Error('CORS_ORIGIN must be explicitly configured in production.');
  }
  const corsOrigins = [...new Set((source.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',').map(origin => origin.trim()).filter(Boolean))];
  for (const origin of corsOrigins) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error('CORS_ORIGIN must contain exact HTTP(S) origins.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error('CORS_ORIGIN must contain exact HTTP(S) origins without paths, credentials or wildcards.');
    }
  }
  if (!corsOrigins.length) throw new Error('CORS_ORIGIN must contain at least one allowed origin.');
  return {
    nodeEnv,
    port: integerSetting(source, 'PORT', 3000, 65535),
    corsOrigins,
  };
}

// Validate only when DB functionality is requested; /health is process liveness.
export function getDatabaseConfig(source = process.env) {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter(key => !source[key]?.trim());
  if (missing.length) {
    throw new Error(`Missing database settings: ${missing.join(', ')}. Configure backend/.env before using the database.`);
  }
  return {
    host: source.DB_HOST,
    port: integerSetting(source, 'DB_PORT', 3306, 65535),
    database: source.DB_NAME,
    user: source.DB_USER,
    password: source.DB_PASSWORD,
    connectionLimit: integerSetting(source, 'DB_CONNECTION_LIMIT', 10, 100),
  };
}
