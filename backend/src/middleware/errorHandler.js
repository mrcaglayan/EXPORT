import { AppError } from '../shared/AppError.js';

export function createErrorHandler(logger = console) {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);
    let safeError = error;
    if (error.type === 'entity.parse.failed') {
      safeError = new AppError(400, 'INVALID_JSON', 'The request body must be valid JSON.');
    } else if (error.type === 'entity.too.large') {
      safeError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
    } else if (!(error instanceof AppError)) {
      safeError = new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
    }
    if (safeError.status >= 500) {
      // Do not log SQL, payloads, credentials, stack traces or database error messages.
      logger.error({ requestId: req.requestId, code: safeError.code, status: safeError.status });
    }
    res.status(safeError.status).json({
      error: { code: safeError.code, message: safeError.message },
      requestId: req.requestId,
    });
  };
}
