import { pino } from 'pino';
import { config, isDev } from '@/config/index.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'interview-sandbox-server' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      }
    : undefined,
});

export type Logger = typeof logger;
