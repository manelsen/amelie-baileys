/**
 * Telemetria - Sistema de monitoramento leve para Amélie (Baileys)
 * 
 * Focado apenas em métricas de runtime (RAM) e estado do Socket.
 */

const moment = require('moment-timezone');

class Telemetria {
    constructor(logger, config = {}) {
        this.logger = logger;
        this.limiteAlertaMemoria = config.limiteAlertaMemoria || 1024; // 1GB
        this.intervalo = null;
    }

    /**
     * Inicia o monitoramento de recursos
     * @param {number} intervaloMs Tempo entre as checagens (default 5 min)
     */
    iniciar(intervaloMs = 300000) {
        this.logger.info('[Telemetria] Monitoramento de recursos iniciado.');
        
        this.intervalo = setInterval(() => {
            this.verificarRecursos();
        }, intervaloMs);

        // Primeira verificação imediata
        this.verificarRecursos();
    }

    parar() {
        if (this.intervalo) {
            clearInterval(this.intervalo);
            this.logger.info('[Telemetria] Monitoramento parado.');
        }
    }

    /**
     * Verifica o uso de memória atual
     */
    verificarRecursos() {
        const usoMemoria = process.memoryUsage();
        const heapUsadoMB = Math.round(usoMemoria.heapUsed / 1024 / 1024);
        const rssMB = Math.round(usoMemoria.rss / 1024 / 1024);

        if (rssMB > this.limiteAlertaMemoria) {
            this.logger.warn(`[Telemetria] ⚠️ Alto uso de memória: RSS ${rssMB}MB | Heap ${heapUsadoMB}MB`);
            
            if (global.gc) {
                this.logger.info('[Telemetria] Solicitando coleta de lixo (GC)...');
                global.gc();
            }
        } else {
            this.logger.debug(`[Telemetria] Saúde do Sistema: RSS ${rssMB}MB | Heap ${heapUsadoMB}MB`);
        }

        return { rssMB, heapUsadoMB };
    }

    /**
     * Gera um resumo do estado para logs ou endpoints de saúde
     */
    obterStatusSistema() {
        return {
            uptime: process.uptime(),
            memoria: process.memoryUsage(),
            timestamp: moment().format(),
            plataforma: process.platform,
            nodeVersion: process.version
        };
    }
}

module.exports = Telemetria;
