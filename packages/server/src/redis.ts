import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

/**
 * Two connections: one general-purpose, one dedicated subscriber.
 * Redis pub/sub requires a connection in subscriber mode, which cannot issue
 * normal commands — so we keep them separate.
 */
export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
export const redisSub = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

for (const [name, client] of [
  ['redis', redis],
  ['redisSub', redisSub],
] as const) {
  client.on('error', (err) => logger.error({ err, client: name }, 'Redis error'));
  client.on('connect', () => logger.debug({ client: name }, 'Redis connected'));
}
