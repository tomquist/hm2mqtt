import pino from 'pino';
import { inspect } from 'util';

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

const logger = pino({
  level: resolvedLevel,
  hooks: {
    logMethod: consoleStyleLogMethod,
  },
  transport: {
    targets: [
      {
        target: require.resolve('pino-pretty'),
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
