import pino from 'pino';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../config';

const LOG_DIR = path.resolve(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'backend.log');

if (config.env === 'production') {
  fs.mkdir(LOG_DIR, { recursive: true }).catch(() => undefined);
}

export const logger = pino({
  level: config.env === 'production' ? 'info' : 'debug',
  base: { service: 'mis2601-backend', env: config.env },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport:
    config.env === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : { target: 'pino/file', options: { destination: LOG_FILE, mkdir: true } },
});
