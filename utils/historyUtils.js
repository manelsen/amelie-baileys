const { getChatHistory } = require('../database/messagesDb');

const getFormattedHistory = async (chatId, config) => {
    const chatHistory = await getChatHistory(chatId, config.maxHistory || 1000);
    return chatHistory;
};

module.exports = {
    getFormattedHistory
};
