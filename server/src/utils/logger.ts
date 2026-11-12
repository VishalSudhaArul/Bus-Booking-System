 
type Level = 'debug' | 'info' | 'warn' | 'error';

const silent = process.env.NODE_ENV === 'test';

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  if (silent && level !== 'error') return;
  if (silent) return;
  const line = { time: new Date().toISOString(), level, message, ...meta };
  const out = JSON.stringify(line);
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.info(out);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => write('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => write('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => write('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => write('error', m, meta),
};
