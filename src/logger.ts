import pino from 'pino';

const resolvedLevel = process.env.LOG_LEVEL
  ? process.env.LOG_LEVEL
  : process.env.NODE_ENV === 'test'
    ? 'silent'
    : 'info';

const logger = pino({
  level: resolvedLevel,
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
