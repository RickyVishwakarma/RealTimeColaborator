import { readFileSync } from 'node:fs';
import { pool } from './pool.js';
import { logger } from '../logger.js';

/**
 * Apply the (idempotent) schema. Safe to run on every boot — every statement
 * uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS. Does not close the pool.
 */
export async function runMigrations(): Promise<void> {
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  logger.info('Database schema applied');
}
