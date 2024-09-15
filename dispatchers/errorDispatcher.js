const logger = require('../config/logger');
const { sendLongMessage } = require('../utils/messageUtils');
const { saveChatMessage } = require('../database/messagesDb');

/**
 * Lida com erros ocorridos durante o processamento das mensagens.
 * @param {object} context - Contexto da mensagem.
 * @param {Error} error - Erro ocorrido.
 */
const handleError = async (context, error) => {
    const { msg, chatId, sender, config } = context;

    // Log detalhado do erro
    logger.error(`Erro ao processar mensagem: ${error.message}`, { error, chatId, sender });

    // Envia uma mensagem de erro ao usuário
    try {
        await sendLongMessage(msg, 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente mais tarde.');
    } catch (sendError) {
        logger.error(`Erro ao enviar mensagem de erro: ${sendError.message}`, { sendError });
    }

    // (Opcional) Salva o erro no histórico
    try {
        await saveChatMessage(chatId, config.botName, `Erro: ${error.message}`, 'model');
    } catch (saveError) {
        logger.error(`Erro ao salvar mensagem de erro no histórico: ${saveError.message}`, { saveError });
    }
};

module.exports = {
    handleError
};
