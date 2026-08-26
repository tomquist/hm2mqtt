import pino, { type Logger } from 'pino';
import { inspect } from 'util';
import { redactDeep } from './utils/redact.js';

/**
 * Loosely-typed log function.
 *
 * pino v10 introduced printf-placeholder-aware typings that reject the
 * `logger.error('message:', value)` call style used throughout this codebase
 * (extra arguments are only allowed when the message contains matching `%s`/`%d`
 * placeholders). The `consoleStyleLogMethod` hook below handles these surplus
 * arguments at runtime, so we relax the log method signatures to keep that
 * ergonomic style compiling under the stricter types.
 */
type LooseLogFn = (...args: any[]) => void;

type LooseLogger = Omit<Logger, 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'> & {
  trace: LooseLogFn;
  debug: LooseLogFn;
  info: LooseLogFn;
  warn: LooseLogFn;
  error: LooseLogFn;
  fatal: LooseLogFn;
};

const resolvedLevel = process.env.LOG_LEVEL
  ? process.env.LOG_LEVEL
  : process.env.NODE_ENV === 'test'
    ? 'silent'
    : 'info';

/**
 * Pino only interpolates extra arguments into `%s`/`%d`/`%o`-style placeholders
 * and silently drops any surplus ones. Most call sites in this codebase use
 * console.log-style calls like `logger.info('Settings:', settings)`, so without
 * this hook the trailing values would never be logged (see issue #326).
 *
 * This rewrites such calls by appending the surplus arguments to the message.
 */
export function consoleStyleLogMethod(
  this: pino.Logger,
  inputArgs: Parameters<pino.LogFn>,
  method: pino.LogFn,
): void {
  const [first, ...rest] = inputArgs;
  if (typeof first === 'string' && rest.length > 0) {
    const placeholderCount = (first.match(/%[sdjoO]/g) ?? []).length;
    const surplus = rest.slice(placeholderCount);
    if (surplus.length > 0) {
      const formatted = surplus
        .map(arg => (typeof arg === 'string' ? arg : inspect(arg, { breakLength: Infinity })))
        .join(' ');
      method.apply(this, [
        `${first} ${formatted}`,
        ...rest.slice(0, placeholderCount),
      ] as Parameters<pino.LogFn>);
      return;
    }
  }
  method.apply(this, inputArgs);
}

/**
 * Masks credentials embedded in URLs (`mqtt://user:pass@host`) in every logged
 * value, so a broker URL cannot leak the broker password no matter which call
 * site logs it (see issue #424).
 *
 * Objects are covered as well as strings: pino writes the properties of a
 * leading object straight into the log line, and interpolates `%o`/`%j`
 * arguments into the message after this hook has run.
 */
export function redactLogArgs(args: Parameters<pino.LogFn>): Parameters<pino.LogFn> {
  return args.map(arg => redactDeep(arg)) as Parameters<pino.LogFn>;
}

/**
 * The hook the application logger runs on every log call: surplus arguments are
 * folded into the message first, then the finished message is redacted - that
 * way credentials inside logged objects are masked as well.
 */
export function logMethodHook(
  this: pino.Logger,
  inputArgs: Parameters<pino.LogFn>,
  method: pino.LogFn,
): void {
  const redactingMethod = ((...args: unknown[]) => {
    method.apply(this, redactLogArgs(args as Parameters<pino.LogFn>));
  }) as pino.LogFn;
  consoleStyleLogMethod.call(this, inputArgs, redactingMethod);
}

const logger: LooseLogger = pino({
  level: resolvedLevel,
  hooks: {
    logMethod: logMethodHook,
  },
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: {
          colorize: false,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    ],
  },
});

export default logger;
