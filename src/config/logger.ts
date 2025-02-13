import pino from 'pino/pino';

const transport = pino.transport({
  target: 'pino-pretty',
});

export const logger = pino(
  {
    level: 'info',
    base: undefined,
  },
  transport,
);
