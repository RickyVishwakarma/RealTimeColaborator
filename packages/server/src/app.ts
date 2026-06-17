import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import { authRouter } from './auth/routes.js';
import { documentRouter } from './documents/routes.js';
import { notificationRouter } from './notifications/routes.js';
import { registry, httpRequestDuration } from './metrics.js';
import { checkReadiness } from './health.js';

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Record request latency, labelled by the matched route (low cardinality).
  app.use((req, res, next) => {
    const end = httpRequestDuration.startTimer();
    res.on('finish', () => {
      const route = req.route?.path ?? (req.baseUrl || req.path);
      end({ method: req.method, route: String(route), status: res.statusCode });
    });
    next();
  });

  // Liveness: process is up. Readiness: dependencies are reachable.
  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
  app.get('/ready', async (_req, res) => {
    const result = await checkReadiness();
    res.status(result.ready ? 200 : 503).json(result);
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  });

  // Stricter rate limit on auth endpoints to slow credential stuffing.
  const authLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true });
  app.use('/api/auth', authLimiter, authRouter);

  const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true });
  app.use('/api/documents', apiLimiter, documentRouter);
  app.use('/api/notifications', apiLimiter, notificationRouter);

  // Centralized error handler.
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ): void => {
      logger.error({ err }, 'Unhandled request error');
      res.status(500).json({ error: 'Internal server error' });
    },
  );

  return app;
}
