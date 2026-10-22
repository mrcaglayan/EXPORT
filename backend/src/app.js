import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { getServerConfig } from './config/env.js';
import { requestId } from './middleware/requestId.js';
import { createErrorHandler } from './middleware/errorHandler.js';
import { AppError } from './shared/AppError.js';
import { systemRoutes } from './routes/system.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { identityRoutes } from './routes/organizations.routes.js';
import { accountingRoutes } from './routes/accounting.routes.js';

import { productRoutes } from './routes/products.routes.js';
import { inventoryRoutes } from './routes/inventory.routes.js';

export function createApp({ config = getServerConfig(), checkReadiness, logger } = {}) {
  const app = express();
  app.locals.corsOrigins = config.corsOrigins;
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet({ strictTransportSecurity: config.nodeEnv === 'production' ? undefined : false }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      callback(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'This browser origin is not allowed.'));
    },
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'X-Request-Id', 'X-CSRF-Token', 'Idempotency-Key'],
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Intentionally makes no claim about database readiness.
  app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ service: 'export-accounting-api', status: 'ok', requestId: req.requestId });
  });
  app.use('/api/v1', systemRoutes(checkReadiness));
  app.use('/api/v1/auth', authRoutes());
  app.use('/api/v1', identityRoutes());
  app.use('/api/v1/entities/:entityId/products', productRoutes());
  app.use('/api/v1/entities/:entityId/inventory', inventoryRoutes());
  app.use('/api/v1/entities/:entityId/accounting', accountingRoutes());

  app.use((_req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Route not found.'));
  });
  app.use(createErrorHandler(logger));

  return app;
}

export default createApp();
