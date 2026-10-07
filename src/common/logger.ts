import { LoggerService } from '@nestjs/common';
import pino from 'pino';

export const pinoLogger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
  } : undefined,
});

export class PinoLogger implements LoggerService {
  private readonly logger: pino.Logger;
  private readonly context: string;

  constructor(context: string) {
    this.context = context;
    this.logger = pinoLogger.child({ context });
  }

  log(message: string, meta?: Record<string, unknown>) {
    this.logger.info(meta, message);
  }

  error(message: string, trace?: string, meta?: Record<string, unknown>) {
    this.logger.error({ ...meta, trace }, message);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.logger.warn(meta, message);
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.logger.debug(meta, message);
  }

  verbose(message: string, meta?: Record<string, unknown>) {
    this.logger.trace(meta, message);
  }
}