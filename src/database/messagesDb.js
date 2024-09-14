const Datastore = require('nedb');
const path = require('path');
const logger = require('../config/logger');
const { BOT_NAME } = require('../config/environment');

const dbPath = path.join(__dirname, '../../db/messages.db');
const messagesDb = new Datastore({ filename: dbPath, autoload: true });

const getChatHistory = (chatId, limit) => {
    return new Promise((resolve, reject) => {
        messagesDb.find({ chatId: chatId })
            .sort({ timestamp: 1 })
            .limit(limit)
            .exec((err, docs) => {
                if (err) {
                    logger.error(`Erro ao buscar histórico: ${err.message}`);
                    reject(err);
                } else {
                    logger.debug(`Histórico recuperado para chat ${chatId}`);
                    const formattedHistory = docs.map(doc => ({
                        role: doc.sender === BOT_NAME ? 'model' : 'user',
                        parts: [{ text: doc.content }]
                    }));
                    logger.debug('Histórico formatado:', JSON.stringify(formattedHistory, null, 2));
                    resolve(formattedHistory);
                }
            });
    });
};

const saveChatMessage = (chatId, sender, message) => {
    return new Promise((resolve, reject) => {
        const messageDoc = {
            chatId,
            sender,
            content: message,
            timestamp: Date.now()
        };
        messagesDb.insert(messageDoc, (err) => {
            if (err) {
                logger.error(`Erro ao salvar mensagem: ${err.message}`);
                reject(err);
            } else {
                logger.debug(`Mensagem salva para chat ${chatId}:`, JSON.stringify(messageDoc, null, 2));
                resolve();
            }
        });
    });
};

module.exports = {
    getChatHistory,
    saveChatMessage
};