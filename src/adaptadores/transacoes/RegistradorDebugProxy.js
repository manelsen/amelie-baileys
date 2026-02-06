/**
 * RegistradorDebugProxy - Embrulha o logger para forçar logs do Ciclo de Vida em Debug
 */

class RegistradorDebugProxy {
    constructor(logger) {
        this.logger = logger;
    }

    info(msg, ...args) { this.logger.debug(msg, ...args); }
    warn(msg, ...args) { this.logger.debug(msg, ...args); }
    error(msg, ...args) { this.logger.error(msg, ...args); }
    debug(msg, ...args) { this.logger.debug(msg, ...args); }
}

module.exports = RegistradorDebugProxy;
