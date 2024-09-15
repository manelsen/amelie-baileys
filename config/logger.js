const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...rest }) => {
            const extraData = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${extraData}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ 
            filename: path.join(__dirname, '../logs/bot.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    ]
});

module.exports = logger;