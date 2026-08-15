/**
 * Tiny structured JSON logger for CloudWatch Logs.
 *
 * Rules: never log full request bodies, tokens, secrets, or raw transcript
 * text — only identifiers (transcriptionId, jobId) and short error messages.
 * Callers are responsible for keeping `fields` free of PII.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

interface LogEntry extends LogFields {
  level: LogLevel;
  message: string;
  timestamp: string;
}

function write(level: LogLevel, message: string, fields?: LogFields): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export const logger = {
  debug(message: string, fields?: LogFields): void {
    write('debug', message, fields);
  },
  info(message: string, fields?: LogFields): void {
    write('info', message, fields);
  },
  warn(message: string, fields?: LogFields): void {
    write('warn', message, fields);
  },
  error(message: string, fields?: LogFields): void {
    write('error', message, fields);
  },
};

/** Extracts a safe, loggable message from an unknown caught value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
