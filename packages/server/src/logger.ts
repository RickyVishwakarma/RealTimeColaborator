import pino from 'pino';
import { config, isProd } from './config.js';

export const logger = pino({
  level: isProd ? 'info' : 'debug',
  transport: isProd
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  base: { service: 'rtc-server', env: config.NODE_ENV },
});
