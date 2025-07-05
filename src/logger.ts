import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
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
