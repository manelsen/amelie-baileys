const { prepareGeminiSession, sanitizeResponse } = require('../services/geminiService');
const { log } = require('../dispatchers/loggingDispatcher');
const { handleError } = require('../dispatchers/errorDispatcher');
const messageStorageDispatcher = require('../dispatchers/messageStorageDispatcher');
const { BOT_NAME } = require('../config/environment');

const handleTextMessage = async (msg, context, chatId) => {
    try {
        const { config } = context;
        const sender = msg.author || msg.from;
        const userId = sender.split('@')[0];

        log('debug', `Processando mensagem de texto para chatId: ${chatId}`);

        const chatSession = await prepareGeminiSession(chatId, msg.body, userId, config);

        const result = await chatSession.sendMessage(msg.body);
        let response = sanitizeResponse(await result.response.text());

        if (!response || response.trim() === '') {
            response = "Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente.";
        }

        await messageStorageDispatcher.saveMessage(chatId, sender, msg.body, 'user');
        await messageStorageDispatcher.saveMessage(chatId, BOT_NAME, response, 'bot');

        return response;
    } catch (error) {
        handleError(error, { chatId, messageType: 'text' });
        return 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.';
    }
};

module.exports = {
    handleTextMessage
};