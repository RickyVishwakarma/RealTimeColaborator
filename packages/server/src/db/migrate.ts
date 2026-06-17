import { readFileSync } from 'node:fs';
import { pool } from './pool.js';
import { logger } from '../logger.js';

async function migrate(): Promise<void> {
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  logger.info('Applying database schema...');
  await pool.query(sql);
  logger.info('Schema applied successfully.');
  await pool.end();
}

migrate().catch((err) => {
  logger.error({ err }, 'Migration failed');
  process.exit(1);
});
