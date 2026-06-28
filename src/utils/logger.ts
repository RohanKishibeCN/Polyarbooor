const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

let currentLevel: number = LOG_LEVELS.INFO;

export function setLogLevel(verbose: boolean) {
  currentLevel = verbose ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;
}

function log(level: LogLevel, prefix: string, message: string, ...args: unknown[]) {
  if (LOG_LEVELS[level] < currentLevel) return;
  const ts = new Date().toISOString().slice(11, 19);
  const line = `${ts} ${prefix} ${message}`;
  if (args.length > 0) {
    console.log(line, ...args);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => log('DEBUG', '[DEBUG]', msg, ...args),
  info: (msg: string, ...args: unknown[]) => log('INFO', '[INFO]', msg, ...args),
  warn: (msg: string, ...args: unknown[]) => log('WARN', '[WARN]', msg, ...args),
  error: (msg: string, ...args: unknown[]) => log('ERROR', '[ERROR]', msg, ...args),
  setVerbose: (v: boolean) => setLogLevel(v),
};
