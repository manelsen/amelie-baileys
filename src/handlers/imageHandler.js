const { saveChatMessage } = require('../database/messagesDb');
const { prepareGeminiSession, sanitizeResponse } = require('../services/geminiService');
const { sendLongMessage } = require('../utils/messageUtils');
const logger = require('../config/logger');
const { withContext } = require('../services/contextManager');

/**
 * Handler para mensagens de texto.
 * @param {object} msg - Mensagem recebida.
 * @param {object} context - Contexto do chat.
 * @param {string} chatId - ID do chat.
 */
const handleTextMessage = withContext(async (msg, context, chatId) => {
    try {
        const { config } = context;
        const sender = msg.author || msg.from;
        const userId = sender.split('@')[0];

        logger.debug(`Processando mensagem de texto para chatId: ${chatId}`);

        const chatSession = await prepareGeminiSession(chatId, msg.body, userId, config);

        const result = await chatSession.sendMessage(msg.body);
        let response = sanitizeResponse(await result.response.text());

        if (!response || response.trim() === '') {
            response = "Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente.";
        }

        await saveChatMessage(chatId, sender, msg.body);
        await saveChatMessage(chatId, config.botName, response);

        await sendLongMessage(msg, response);
    } catch (error) {
        logger.error(`Erro ao processar mensagem de texto: ${error.message}`, { error, stack: error.stack, chatId });
        await msg.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.');
    }
});

module.exports = {
    handleTextMessage
};
