import { getAuthConfig } from '../config/auth.js';
import { readSession, checkCsrf } from '../services/session-security.js';
import { authenticate, requirePermission } from '../services/identity.service.js';
import { AppError } from '../shared/AppError.js';

export function authConfiguration(req, res, next) {
  res.set('Cache-Control', 'no-store');
  try { req.authConfig = getAuthConfig(); } catch {
    throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Sign-in is not configured. Contact your workspace administrator.');
  }
  next();
}
export async function requireAuth(req, _res, next) {
  req.identity = await authenticate(readSession(req, req.authConfig));
  next();
}
export function csrfProtection(req, _res, next) {
  // Require the configured browser origin even for unauthenticated login.
  // Non-browser clients use the same cookie + token + Origin protocol.
  if (!req.app.locals.corsOrigins.includes(req.get('Origin'))) {
    throw new AppError(403, 'ORIGIN_REQUIRED', 'An allowed browser origin is required.');
  }
  if (req.get('Sec-Fetch-Site') === 'cross-site') {
    throw new AppError(403, 'CSRF_INVALID', 'Cross-site writes are not allowed.');
  }
  if (!req.is('application/json')) throw new AppError(415, 'JSON_REQUIRED', 'Use application/json for this request.');
  checkCsrf(req, req.authConfig);
  next();
}
export const permissionGuard = permission => async (req, _res, next) => {
  await requirePermission(req.identity, req.params.id ?? req.identity.activeEntityId, permission);
  next();
};
