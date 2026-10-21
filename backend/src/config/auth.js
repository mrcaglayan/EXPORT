import './env.js';

export function getAuthConfig(source = process.env) {
  if (!/^[a-f0-9]{64,}$/i.test(source.AUTH_SECRET ?? '')) {
    throw new Error('AUTH_SECRET must be at least 32 random bytes encoded as hexadecimal.');
  }
  const sessionSeconds = Number(source.AUTH_SESSION_SECONDS ?? 28800);
  if (!Number.isInteger(sessionSeconds) || sessionSeconds < 300 || sessionSeconds > 86400) {
    throw new Error('AUTH_SESSION_SECONDS must be between 300 and 86400.');
  }
  const secure = source.NODE_ENV === 'production';
  return {
    secret: Buffer.from(source.AUTH_SECRET, 'hex'),
    sessionSeconds,
    secure,
    sessionCookie: secure ? '__Host-export_session' : 'export_session',
    csrfCookie: secure ? '__Host-export_csrf' : 'export_csrf',
  };
}
