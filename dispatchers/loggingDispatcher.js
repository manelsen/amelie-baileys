const logger = require('../config/logger');

const log = (level, message, meta = {}) => {
    logger.log(level, message, meta);
};

module.exports = {
    log
};