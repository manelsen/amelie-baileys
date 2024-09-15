const Datastore = require('nedb');
const logger = require('../config/logger');
const path = require('path');

const dbPath = path.join(__dirname, '../../db/prompts.db');
const promptsDb = new Datastore({ filename: dbPath, autoload: true });

const setSystemPrompt = (chatId, name, text) => {
    return new Promise((resolve, reject) => {
        const formattedText = `Seu nome é ${name}. ${text}`;
        promptsDb.update({ chatId, name }, { chatId, name, text: formattedText }, { upsert: true }, (err) => {
            if (err) {
                logger.error(`Erro ao definir prompt: ${err.message}`);
                reject(err);
            } else {
                logger.debug(`Prompt '${name}' definido para chat ${chatId}`);
                resolve();
            }
        });
    });
};

const getSystemPrompt = (chatId, name) => {
    return new Promise((resolve, reject) => {
        promptsDb.findOne({ chatId, name }, (err, doc) => {
            if (err) {
                logger.error(`Erro ao buscar prompt: ${err.message}`);
                reject(err);
            } else {
                logger.debug(`Prompt '${name}' recuperado para chat ${chatId}`);
                resolve(doc ? doc.text : null);
            }
        });
    });
};

const listSystemPrompts = (chatId) => {
    return new Promise((resolve, reject) => {
        promptsDb.find({ chatId }, (err, docs) => {
            if (err) {
                logger.error(`Erro ao listar prompts: ${err.message}`);
                reject(err);
            } else {
                logger.debug(`Prompts listados para chat ${chatId}`);
                resolve(docs);
            }
        });
    });
};

const removeSystemPrompt = (chatId, name) => {
    return new Promise((resolve, reject) => {
        promptsDb.remove({ chatId, name }, {}, (err, numRemoved) => {
            if (err) {
                logger.error(`Erro ao remover prompt: ${err.message}`);
                reject(err);
            } else {
                logger.debug(`Prompt '${name}' removido para chat ${chatId}`);
                resolve(numRemoved);
            }
        });
    });
};

const clearAllSystemPrompts = (chatId) => {
    return new Promise((resolve, reject) => {
        promptsDb.remove({ chatId }, { multi: true }, (err, numRemoved) => {
            if (err) {
                logger.error(`Erro ao limpar todos os prompts: ${err.message}`);
                reject(err);
            } else {
                logger.debug(`Todos os prompts removidos para chat ${chatId}`);
                resolve(numRemoved);
            }
        });
    });
};

module.exports = {
    setSystemPrompt,
    getSystemPrompt,
    listSystemPrompts,
    removeSystemPrompt,
    clearAllSystemPrompts
};
