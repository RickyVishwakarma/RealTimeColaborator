import { pool } from './db/pool.js';
import { redis } from './redis.js';

export interface ReadinessResult {
  ready: boolean;
  checks: { postgres: boolean; redis: boolean };
}

/** Probe critical dependencies for a Kubernetes readiness gate. */
export async function checkReadiness(): Promise<ReadinessResult> {
  const [pgOk, redisOk] = await Promise.all([
    pool
      .query('SELECT 1')
      .then(() => true)
      .catch(() => false),
    redis
      .ping()
      .then((r) => r === 'PONG')
      .catch(() => false),
  ]);
  return { ready: pgOk && redisOk, checks: { postgres: pgOk, redis: redisOk } };
}
