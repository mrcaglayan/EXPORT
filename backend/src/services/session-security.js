import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppError } from '../shared/AppError.js';

const issuer = 'export-accounting';
const audience = 'export-accounting-web';
export const unauthorized = () => new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function signSession(session, config) {
  return jwt.sign({ tid: session.tenantId }, config.secret, {
    algorithm: 'HS256', issuer, audience, subject: session.userId, jwtid: session.id,
    expiresIn: config.sessionSeconds,
  });
}
export function readSession(req, config) {
  const token = req.cookies?.[config.sessionCookie];
  if (!token) throw unauthorized();
  try {
    const payload = jwt.verify(token, config.secret, { algorithms: ['HS256'], issuer, audience });
    if (![payload.sub, payload.tid, payload.jti].every(v => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v))
      || !Number.isInteger(payload.exp)) throw unauthorized();
    return payload;
  } catch { throw unauthorized(); }
}
export const cookieOptions = config => ({
  httpOnly: true, secure: config.secure, sameSite: 'strict', path: '/',
});
export function setSessionCookie(res, session, config) {
  res.cookie(config.sessionCookie, signSession(session, config), {
    ...cookieOptions(config), maxAge: config.sessionSeconds * 1000,
  });
}
const mac = (value, binding, config) => createHmac('sha256', config.secret)
  .update(`csrf|${binding}|${value}`).digest('hex');
function validCsrf(token, binding, config) {
  if (typeof token !== 'string' || token.length > 200) return false;
  const [nonce, expires, signature, extra] = token.split('.');
  if (extra || !/^[a-f0-9]{64}$/.test(nonce ?? '') || !/^\d{10}$/.test(expires ?? '')
    || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  return equal(signature, mac(`${nonce}.${expires}`, binding, config));
}
export function csrfBinding(req, config) {
  try { return readSession(req, config).jti; } catch { return 'anonymous'; }
}
export function issueCsrf(req, res, config, binding = csrfBinding(req, config)) {
  let token = req.cookies?.[config.csrfCookie];
  if (!validCsrf(token, binding, config)) {
    const value = `${randomBytes(32).toString('hex')}.${Math.floor(Date.now() / 1000) + 3600}`;
    token = `${value}.${mac(value, binding, config)}`;
  }
  res.cookie(config.csrfCookie, token, { ...cookieOptions(config), maxAge: 3600000 });
  return token;
}
export function checkCsrf(req, config) {
  const cookie = req.cookies?.[config.csrfCookie];
  if (!equal(cookie, req.get('X-CSRF-Token')) || !validCsrf(cookie, csrfBinding(req, config), config)) {
    throw new AppError(403, 'CSRF_INVALID', 'Your security token expired. Please try again.');
  }
}
