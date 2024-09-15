const Datastore = require('nedb-promises');
const path = require('path');
const { log } = require('../dispatchers/loggingDispatcher');
const { BOT_NAME } = require('../config/environment');

// Caminho do banco de dados de mensagens
console.log(__dirname)
const dbPath = path.join(__dirname, '../../db/messages.db');
const messagesDb = Datastore.create({ filename: dbPath, autoload: true });

/**
 * Salva uma mensagem no histórico do chat.
 * @param {string} chatId - ID do chat.
 * @param {string} sender - Remetente da mensagem.
 * @param {string} message - Conteúdo da mensagem.
 */
const saveChatMessage = async (chatId, sender, message) => {
    try {
        if (!chatId || typeof chatId !== 'string') {
            throw new Error('chatId inválido');
        }
        if (!message || typeof message !== 'string') {
            throw new Error('message inválida');
        }

        let userId;
        if (sender === BOT_NAME) {
            userId = BOT_NAME;
        } else if (typeof sender === 'string' && sender.includes('@')) {
            userId = sender.split('@')[0];
        } else {
            userId = 'unknown';
            log('warn', `Formato de sender não reconhecido: ${sender}`);
        }

        const messageDoc = {
            chatId,
            sender,
            userId,
            content: message,
            timestamp: Date.now()
        };

        await messagesDb.insert(messageDoc);
        log('debug', `Mensagem salva para chat ${chatId}:`, { messageDoc });
    } catch (err) {
        log('error', `Erro ao salvar mensagem: ${err.message}`, { 
            error: err, 
            chatId, 
            sender, 
            messagePreview: message ? message.substring(0, 50) : 'N/A' 
        });
    }
};

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
        
        log('debug', `Histórico recuperado para chat ${chatId}: ${messages.length} mensagens`);

        return messages.map((msg) => ({
            role: msg.sender === BOT_NAME ? 'model' : 'user',
            userId: msg.userId,
            parts: [{ text: msg.content }]
        }));
    } catch (err) {
        log('error', `Erro ao buscar histórico de chat: ${err.message}`, { error: err, chatId });
        return [];
    }
};

/**
 * Limpa o histórico de chat para um chat específico.
 * @param {string} chatId - ID do chat.
 * @returns {number} - Número de mensagens removidas.
 */
const clearChatHistory = async (chatId) => {
    try {
        const numRemoved = await messagesDb.remove({ chatId }, { multi: true });
        log('info', `Histórico limpo para chat ${chatId}: ${numRemoved} mensagens removidas`);
        return numRemoved;
    } catch (err) {
        log('error', `Erro ao limpar histórico de chat: ${err.message}`, { error: err, chatId });
        return 0;
    }
};

module.exports = {
    saveChatMessage,
    getChatHistory,
    clearChatHistory
};