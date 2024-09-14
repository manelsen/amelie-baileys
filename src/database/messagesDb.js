const Datastore = require('nedb-promises');
const path = require('path');
const logger = require('../config/logger');
const { BOT_NAME } = require('../config/environment');

// Caminho do banco de dados de mensagens
const dbPath = path.join(__dirname, '../../db/messages.db');
const messagesDb = Datastore.create({ filename: dbPath, autoload: true });

/**
 * Recupera o histórico de chat de um chat específico.
 * @param {string} chatId - ID do chat.
 * @param {number} limit - Número máximo de mensagens a serem recuperadas.
 * @returns {array} - Histórico de mensagens do chat.
 */
const getChatHistory = async (chatId, limit = 1000) => {
    try {
        const messages = await messagesDb.find({ chatId })
            .sort({ timestamp: 1 })
            .limit(limit)
            .exec();
        
        logger.debug(`Histórico recuperado para chat ${chatId}`);

        const formattedHistory = messages.map((msg) => ({
            role: msg.sender === BOT_NAME ? 'model' : 'user',
            userId: msg.sender === BOT_NAME ? BOT_NAME : msg.userId,
            parts: [{ text: msg.content }]
        }));
        logger.debug('Histórico formatado:', JSON.stringify(formattedHistory, null, 2));

        return formattedHistory;
    } catch (err) {
        logger.error(`Erro ao buscar histórico de chat: ${err.message}`);
        return [];
    }
};

/**
 * Salva uma mensagem no histórico do chat.
 * @param {string} chatId - ID do chat.
 * @param {string} sender - Remetente da mensagem.
 * @param {string} message - Conteúdo da mensagem.
 */
const saveChatMessage = async (chatId, sender, message) => {
    try {
        const userId = sender === BOT_NAME ? BOT_NAME : sender.split('@')[0];
        const messageDoc = {
            chatId,
            sender,
            userId,
            content: message,
            timestamp: Date.now()
        };

        await messagesDb.insert(messageDoc);
        logger.debug(`Mensagem salva para chat ${chatId}:`, JSON.stringify(messageDoc, null, 2));
    } catch (err) {
        logger.error(`Erro ao salvar mensagem: ${err.message}`);
    }
};

module.exports = {
    getChatHistory,
    saveChatMessage
};
