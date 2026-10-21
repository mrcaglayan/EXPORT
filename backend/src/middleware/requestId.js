import { randomUUID } from 'node:crypto';

export function requestId(req, res, next) {
  const supplied = req.get('X-Request-Id');
  req.requestId = typeof supplied === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(supplied)
    ? supplied : randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
}
