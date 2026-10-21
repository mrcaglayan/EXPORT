import { AppError } from '../shared/AppError.js';

export const invalid = () => new AppError(400, 'VALIDATION_ERROR', 'Check the supplied fields and try again.');
export function object(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !allowed.includes(key))) throw invalid();
}
export function text(value, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max
    || /[\u0000-\u001f\u007f]/.test(value)) throw invalid();
  return value.trim();
}
export function code(value) {
  const result = text(value, 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(result)) throw invalid();
  return result;
}
export function email(value) {
  const result = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw invalid();
  return result;
}
export function password(value, setup = false) {
  if (typeof value !== 'string' || value.includes('\0') || value.length < (setup ? 15 : 1)
    || Buffer.byteLength(value, 'utf8') > 72) throw invalid();
  return value;
}
export function login(body) {
  object(body, ['tenantCode', 'email', 'password']);
  return { tenantCode: code(body.tenantCode), email: email(body.email), password: password(body.password) };
}
export function entityId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw invalid();
  return value.toLowerCase();
}
