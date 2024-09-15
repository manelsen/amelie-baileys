const { getChatHistory } = require('../database/messagesDb');
const { log } = require('../dispatchers/loggingDispatcher');

const getFormattedHistory = async (chatId, config) => {
    try {
        const rawHistory = await getChatHistory(chatId, config.maxHistory || 1000);
        const formattedHistory = rawHistory.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.parts[0].text }]
        }));

        log('debug', `Histórico formatado para chatId ${chatId}: ${formattedHistory.length} mensagens`);
        return formattedHistory;
    } catch (error) {
        log('error', `Erro ao formatar histórico: ${error.message}`, { error, chatId });
        return [];
    }
};

module.exports = {
    getFormattedHistory
};