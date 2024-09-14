const logger = require('../config/logger');

/**
 * Lida com o registro de eventos e mensagens.
 * @param {string} level - Nível do log (e.g., 'info', 'debug', 'error').
 * @param {string} message - Mensagem de log.
 * @param {object} [meta] - Informações adicionais para o log.
 */
const log = (level, message, meta = {}) => {
    switch (level) {
        case 'info':
            logger.info(message, meta);
            break;
        case 'debug':
            logger.debug(message, meta);
            break;
        case 'warn':
            logger.warn(message, meta);
            break;
        case 'error':
            logger.error(message, meta);
            break;
        default:
            logger.info(message, meta);
    }
};

module.exports = {
    log
};
