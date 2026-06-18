import { createServer } from 'node:http';
import { config, isProd } from './config.js';
import { logger } from './logger.js';
import { createApp } from './app.js';
import { attachCollabGateway } from './collab/gateway.js';
import { flushAll } from './collab/docManager.js';
import { pool } from './db/pool.js';
import { redis, redisSub } from './redis.js';
import { runMigrations } from './db/runMigrations.js';

const app = createApp();
const httpServer = createServer(app);
const io = attachCollabGateway(httpServer);

async function start(): Promise<void> {
  // Self-migrate on boot in production (idempotent schema) so hosts like Render
  // need no separate migration step. Opt in elsewhere via RUN_MIGRATIONS=true.
  if (isProd || process.env.RUN_MIGRATIONS === 'true') {
    await runMigrations();
  }
  httpServer.listen(config.PORT, () => {
    logger.info(`RTC server listening on :${config.PORT} (${config.NODE_ENV})`);
  });
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully...');
  io.close();
  httpServer.close();
  await flushAll();
  await Promise.allSettled([pool.end(), redis.quit(), redisSub.quit()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Last-resort guards: log loudly rather than crashing silently. An uncaught
// exception leaves the process in an unknown state, so we drain and exit.
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  void shutdown('uncaughtException');
});
