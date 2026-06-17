import { createServer } from 'node:http';
import { config } from './config.js';
import { logger } from './logger.js';
import { createApp } from './app.js';
import { attachCollabGateway } from './collab/gateway.js';
import { flushAll } from './collab/docManager.js';
import { pool } from './db/pool.js';
import { redis, redisSub } from './redis.js';

const app = createApp();
const httpServer = createServer(app);
const io = attachCollabGateway(httpServer);

httpServer.listen(config.PORT, () => {
  logger.info(`RTC server listening on :${config.PORT} (${config.NODE_ENV})`);
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
