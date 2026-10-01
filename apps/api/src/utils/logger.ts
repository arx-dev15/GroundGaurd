export interface LogContext {
  [key: string]: unknown;
}

export class Logger {
  private service: string;

  constructor(service: string = 'api') {
    this.service = service;
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, context?: LogContext) {
    if (process.env.NODE_ENV === 'test' && level === 'debug') return;

    const entry = {
      timestamp: new Date().toISOString(),
      service: this.service,
      level,
      message,
      ...context,
    };

    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  public info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  public error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  public debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }
}

export const logger = new Logger('groundguard-api');
