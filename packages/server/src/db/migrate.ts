import { pool } from './pool.js';
import { logger } from '../logger.js';
import { runMigrations } from './runMigrations.js';

runMigrations()
  .then(() => pool.end())
  .catch((err) => {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  });
