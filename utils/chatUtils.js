const { clearChatHistory } = require('../database/messagesDb');
const logger = require('../config/logger');

const resetChat = async (chatId) => {
    try {
        const numRemoved = await clearChatHistory(chatId);
        logger.info(`Chat resetado para ${chatId}. ${numRemoved} mensagens removidas.`);
    } catch (error) {
        logger.error(`Erro ao resetar chat para ${chatId}: ${error.message}`, { error });
        throw error;
    }
};

module.exports = {
    resetChat
};
