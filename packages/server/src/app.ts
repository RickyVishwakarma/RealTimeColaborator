import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import { authRouter } from './auth/routes.js';
import { documentRouter } from './documents/routes.js';

export function createApp(): express.Express {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  // Stricter rate limit on auth endpoints to slow credential stuffing.
  const authLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true });
  app.use('/api/auth', authLimiter, authRouter);

  const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true });
  app.use('/api/documents', apiLimiter, documentRouter);

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
