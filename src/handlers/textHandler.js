const { getConfig } = require('../database/configDb');
const { saveChatMessage } = require('../database/messagesDb');
const { prepareGeminiSession, sanitizeResponse } = require('../services/geminiService');
const { sendLongMessage } = require('../utils/messageUtils');
const logger = require('../config/logger');

const handleTextMessage = async (msg) => {
    try {
        const chat = await msg.getChat();
        const chatId = chat.id._serialized;
        const sender = msg.author || msg.from;
        const userId = sender.split('@')[0];

        const chatConfig = await getConfig(chatId);
        if (!chatConfig) {
            throw new Error(`Configuração não encontrada para o chat ${chatId}`);
        }

        logger.debug('Configuração do chat:', JSON.stringify(chatConfig, null, 2));

        const chatSession = await prepareGeminiSession(chatId, msg.body, userId, chatConfig);

        const result = await chatSession.sendMessage(msg.body);
        let response = sanitizeResponse(await result.response.text());

        if (!response || response.trim() === '') {
            response = "Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente.";
        }

        await saveChatMessage(chatId, sender, msg.body);
        await saveChatMessage(chatId, chatConfig.botName, response);

        await sendLongMessage(msg, response);
    } catch (error) {
        logger.error(`Erro ao processar mensagem de texto: ${error.message}`, { error, stack: error.stack });
        await msg.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.');
    }
};

module.exports = {
    handleTextMessage
};
