/**
 * Telemetria - Sistema de monitoramento leve para Amélie (Baileys) (Funcional)
 */

const moment = require('moment-timezone');

/**
 * Fábrica da Telemetria
 * @param {Object} logger 
 * @param {Object} config 
 */
const criarTelemetria = (logger, config = {}) => {
    const limiteAlertaMemoria = config.limiteAlertaMemoria || 1024; // 1GB
    let intervalo = null;

    /**
     * Verifica o uso de memória atual
     */
    const verificarRecursos = () => {
        const usoMemoria = process.memoryUsage();
        const heapUsadoMB = Math.round(usoMemoria.heapUsed / 1024 / 1024);
        const rssMB = Math.round(usoMemoria.rss / 1024 / 1024);

        if (rssMB > limiteAlertaMemoria) {
            logger.warn(`[Telemetria] ⚠️ Alto uso de memória: RSS ${rssMB}MB | Heap ${heapUsadoMB}MB`);
            
            if (global.gc) {
                logger.info('[Telemetria] Solicitando coleta de lixo (GC)...');
                global.gc();
            }
        } else {
            logger.debug(`[Telemetria] Saúde do Sistema: RSS ${rssMB}MB | Heap ${heapUsadoMB}MB`);
        }

        return { rssMB, heapUsadoMB };
    };

    /**
     * Inicia o monitoramento de recursos
     * @param {number} intervaloMs Tempo entre as checagens (default 5 min)
     */
    const iniciar = (intervaloMs = 300000) => {
        logger.info('[Telemetria] Monitoramento de recursos iniciado.');
        
        intervalo = setInterval(() => {
            verificarRecursos();
        }, intervaloMs);

        // Primeira verificação imediata
        verificarRecursos();
    };

    const parar = () => {
        if (intervalo) {
            clearInterval(intervalo);
            logger.info('[Telemetria] Monitoramento parado.');
        }
    };

    /**
     * Gera um resumo do estado para logs ou endpoints de saúde
     */
    const obterStatusSistema = () => {
        return {
            uptime: process.uptime(),
            memoria: process.memoryUsage(),
            timestamp: moment().format(),
            plataforma: process.platform,
            nodeVersion: process.version
        };
    };

    return {
        iniciar,
        parar,
        verificarRecursos,
        obterStatusSistema
    };
};

module.exports = criarTelemetria;
