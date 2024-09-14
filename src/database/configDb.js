const Datastore = require('nedb');
const logger = require('../config/logger');

const configDb = new Datastore({ filename: 'config.db', autoload: true });

const defaultConfig = {
    temperature: 0.9,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 1024,
    disableDocument: false,
    disableAudio: false,
    disableImage: false
};

const getConfig = async (chatId) => {
    return new Promise((resolve, reject) => {
        configDb.findOne({ chatId }, (err, doc) => {
            if (err) {
                logger.error(`Erro ao buscar configuração: ${err.message}`);
                reject(err);
            } else {
                const config = { ...defaultConfig, ...(doc || {}) };
                logger.debug(`Configuração recuperada para chat ${chatId}:`, JSON.stringify(config, null, 2));
                resolve(config);
            }
        });
    });
};

const setConfig = async (chatId, param, value) => {
    return new Promise((resolve, reject) => {
        configDb.update(
            { chatId },
            { $set: { [param]: value } },
            { upsert: true },
            (err) => {
                if (err) {
                    logger.error(`Erro ao atualizar configuração: ${err.message}`);
                    reject(err);
                } else {
                    logger.info(`Configuração atualizada: ${chatId}, ${param} = ${value}`);
                    resolve();
                }
            }
        );
    });
};

module.exports = {
    getConfig,
    setConfig
};
