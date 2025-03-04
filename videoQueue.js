/**
 * Módulo de fila para processamento de vídeos
 * Permite processamento assíncrono e resiliente sem precisar de um segundo cliente
 */

const Queue = require('bull');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Configuração de formato para o logger
const myFormat = winston.format.printf(({ timestamp, level, message }) => {
  return `${timestamp} [${level}]: ${message}`;
});

// Logger específico para a fila
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    myFormat
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'video-queue.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.uncolorize(),
        myFormat
      )
    })
  ]
});

// Criação da fila principal
const videoQueue = new Queue('video-processing', {
  redis: { 
    host: process.env.REDIS_HOST || 'localhost', 
    port: process.env.REDIS_PORT || 6379 
  },
  defaultJobOptions: {
    attempts: 3,                // Tenta 3 vezes antes de desistir
    backoff: {
      type: 'exponential',      // Aumenta o tempo entre tentativas
      delay: 60000              // Começa com 1 minuto de espera
    },
    removeOnComplete: true,     // Remove o trabalho após completar
    removeOnFail: false         // Mantém registros de falhas para análise
  }
});

// Fila para vídeos problemáticos
const problemVideosQueue = new Queue('problem-videos', {
  redis: { 
    host: process.env.REDIS_HOST || 'localhost', 
    port: process.env.REDIS_PORT || 6379 
  }
});

/**
 * Obtém mensagem de erro amigável para o usuário
 * @param {Error} error - Objeto de erro
 * @returns {string} Mensagem amigável
 */
function getErrorMessageForUser(error) {
  const errorMsg = error.message.toLowerCase();
  
  if (errorMsg.includes('too large') || errorMsg.includes('tamanho'))
    return "Esse vídeo é um pouco grandinho demais para mim processar agora. Pode enviar um tamanho menor?";
  
  if (errorMsg.includes('format') || errorMsg.includes('mime') || errorMsg.includes('formato'))
    return "Hmmm, parece que esse formato de vídeo e eu não nos entendemos muito bem. Poderia tentar MP4?";
  
  if (errorMsg.includes('timeout') || errorMsg.includes('time out') || errorMsg.includes('tempo'))
    return "Esse vídeo é tão complexo que acabei precisando de mais tempo! Poderia tentar um trecho menor?";
  
  if (errorMsg.includes('rate limit') || errorMsg.includes('quota'))
    return "Estou um pouquinho sobrecarregada agora. Podemos tentar novamente em alguns minutinhos?";
    
  return "Tive um probleminha com esse vídeo. Não desiste de mim, tenta de novo mais tarde?";
}

// Monitoramento de saúde do sistema de filas
setInterval(async () => {
  try {
    const videoStats = await videoQueue.getJobCounts();
    logger.info('Estado atual da fila de vídeos:', videoStats);
    
    // Alerta se muitos jobs em espera
    if (videoStats.waiting > 20) {
      logger.warn(`⚠️ Fila de vídeos está acumulando: ${videoStats.waiting} em espera`);
    }
    
    // Alerta se alta taxa de falhas
    if (videoStats.failed > 0 && videoStats.completed > 0) {
      const failRate = videoStats.failed / (videoStats.failed + videoStats.completed);
      if (failRate > 0.2) { // >20% de falha
        logger.warn(`⚠️ Taxa de falha alta na fila de vídeos: ${(failRate*100).toFixed(1)}%`);
      }
    }
  } catch (err) {
    logger.error('Erro ao verificar status da fila:', err);
  }
}, 5 * 60 * 1000); // A cada 5 minutos

// Exportar a fila, logger e utilitários
module.exports = {
  videoQueue,
  problemVideosQueue,
  logger,
  getErrorMessageForUser
};