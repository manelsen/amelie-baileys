// utilities/logger.js

const winston = require('winston');

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...rest }) => {
      const extraData = Object.keys(rest).length
        ? JSON.stringify(rest, null, 2)
        : '';
      return `${timestamp} [${level}]: ${message} ${extraData}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'bot.log' }),
  ],
});

module.exports = logger;
