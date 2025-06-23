import pino from 'pino';

const level = process.env.LOG_LEVEL || (process.env.DEBUG === 'true' ? 'debug' : 'info');

const logger = pino({
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
