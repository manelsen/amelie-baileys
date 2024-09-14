const { messagesDb } = require('../database/messagesDb');  // Certifique-se de que o caminho está correto
const logger = require('../config/logger');

const resetChat = async (chatId) => {
    try {
        if (!messagesDb || typeof messagesDb.remove !== 'function') {
            throw new Error('messagesDb não está inicializado corretamente');
        }
        const result = await new Promise((resolve, reject) => {
            messagesDb.remove({ chatId: chatId }, { multi: true }, (err, numRemoved) => {
                if (err) reject(err);
                else resolve(numRemoved);
            });
        });
        logger.info(`Chat resetado para ${chatId}. ${result} mensagens removidas.`);
    } catch (error) {
        logger.error(`Erro ao resetar chat para ${chatId}: ${error.message}`, { error, stack: error.stack });
        throw error;
    }
};

module.exports = {
    resetChat
};