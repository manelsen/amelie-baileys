const { saveChatMessage, getChatHistory, clearChatHistory } = require('../database/messagesDb');
const { log } = require('./loggingDispatcher');

const messageStorageDispatcher = {
    saveMessage: async (chatId, sender, message, role = 'user') => {
        try {
            await saveChatMessage(chatId, sender, message, role);
            log('debug', `Mensagem salva para chat ${chatId}`, { sender, role });
        } catch (error) {
            log('error', `Erro ao salvar mensagem: ${error.message}`, { chatId, sender, error });
            throw error;
        }
    },

    getHistory: async (chatId, limit) => {
        try {
            const history = await getChatHistory(chatId, limit);
            log('debug', `Histórico recuperado para chat ${chatId}`, { messageCount: history.length });
            return history;
        } catch (error) {
            log('error', `Erro ao recuperar histórico: ${error.message}`, { chatId, error });
            throw error;
        }
    },

    clearHistory: async (chatId) => {
        try {
            const numRemoved = await clearChatHistory(chatId);
            log('info', `Histórico limpo para chat ${chatId}`, { messagesRemoved: numRemoved });
            return numRemoved;
        } catch (error) {
            log('error', `Erro ao limpar histórico: ${error.message}`, { chatId, error });
            throw error;
        }
    }
};

module.exports = messageStorageDispatcher;