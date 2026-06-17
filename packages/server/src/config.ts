import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from repo root (two levels up from packages/server)
dotenv.config({ path: new URL('../../../.env', import.meta.url).pathname });
dotenv.config(); // fall back to local .env / process env

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.coerce.number().default(3600),
  JWT_REFRESH_TTL: z.coerce.number().default(2592000),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === 'production';
