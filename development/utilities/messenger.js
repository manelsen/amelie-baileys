// utilities/messenger.js

const logger = require('./logger');

async function sendMessage(msg, text) {
  try {
    if (!text || typeof text !== 'string' || text.trim() === '') {
      logger.error('Tentativa de enviar mensagem inválida:', { text });
      text =
        'Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente.';
    }

    let trimmedText = text.trim();
    trimmedText = trimmedText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n');

    logger.debug('Enviando mensagem:', { text: trimmedText });
    await msg.reply(trimmedText);
    logger.info('Mensagem enviada com sucesso');
  } catch (error) {
    logger.error('Erro ao enviar mensagem:', {
      error: error.message,
      stack: error.stack,
      text: text,
    });
    await msg.reply(
      'Desculpe, ocorreu um erro ao enviar a resposta. Por favor, tente novamente.'
    );
  }
}

module.exports = {
  sendMessage,
};
