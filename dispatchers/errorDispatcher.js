const { log } = require('./loggingDispatcher');
const { sendLongMessage } = require('../utils/messageUtils');
const messageStorageDispatcher = require('./messageStorageDispatcher');
const { BOT_NAME } = require('../config/environment');

/**
 * Lida com erros ocorridos durante o processamento das mensagens.
 * @param {Error} error - Erro ocorrido.
 * @param {object} context - Contexto da mensagem.
 */
const handleError = async (error, context) => {
    const { msg, chatId, sender } = context;

    // Log detalhado do erro
    log('error', `Erro ao processar mensagem: ${error.message}`, { error, chatId, sender });

    // Envia uma mensagem de erro ao usuário
    try {
        await sendLongMessage(msg, 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente mais tarde.');
    } catch (sendError) {
        log('error', `Erro ao enviar mensagem de erro: ${sendError.message}`, { sendError });
    }

    // Salva o erro no histórico
    try {
        await messageStorageDispatcher.saveMessage(chatId, BOT_NAME, `Erro: ${error.message}`, 'bot');
    } catch (saveError) {
        log('error', `Erro ao salvar mensagem de erro no histórico: ${saveError.message}`, { saveError });
    }
};

module.exports = {
    handleError
};