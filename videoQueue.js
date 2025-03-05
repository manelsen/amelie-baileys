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
    removeOnFail: false,        // Mantém registros de falhas para análise
    timeout: 180000             // Timeout de 3 minutos
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
 * Sistema de notificação entre processos
 */
const notificacoes = {
  /**
   * Salva uma notificação para ser entregue pelo processo principal
   */
  salvar: async (senderNumber, message) => {
    try {
      const dir = './temp';
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      
      const notificationFile = path.join(dir, `notificacao_${senderNumber.replace(/[^0-9]/g, '')}_${Date.now()}.json`);
      await fs.promises.writeFile(notificationFile, JSON.stringify({
        senderNumber,
        message,
        timestamp: Date.now()
      }));
      
      logger.info(`Notificação salva em arquivo: ${notificationFile}`);
      return true;
    } catch (error) {
      logger.error(`Erro ao salvar notificação: ${error.message}`);
      return false;
    }
  },
  
  /**
   * Processa notificações pendentes
   */
  processar: async (client) => {
    const tempDir = './temp';
    if (!fs.existsSync(tempDir)) return;
    
    try {
      const arquivos = await fs.promises.readdir(tempDir);
      const notificacoes = arquivos.filter(f => f.startsWith('notificacao_'));
      
      for (const arquivo of notificacoes) {
        try {
          const caminhoCompleto = path.join(tempDir, arquivo);
          const conteudo = await fs.promises.readFile(caminhoCompleto, 'utf8');
          const dados = JSON.parse(conteudo);
          
          // Tentar enviar a mensagem novamente
          await client.sendMessage(dados.senderNumber, dados.message);
          logger.info(`Notificação pendente enviada para ${dados.senderNumber}`);
          
          // Remover arquivo após processamento bem-sucedido
          await fs.promises.unlink(caminhoCompleto);
        } catch (err) {
          logger.error(`Erro ao processar arquivo de notificação ${arquivo}: ${err.message}`);
        }
      }
    } catch (err) {
      logger.error(`Erro ao verificar diretório de notificações: ${err.message}`);
    }
  }
};

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
  getErrorMessageForUser,
  notificacoes
};