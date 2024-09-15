const Datastore = require('nedb');
const logger = require('../config/logger');

const usersDb = new Datastore({ filename: '../../db/users.db', autoload: true });

const getOrCreateUser = async (sender, chat) => {
    return new Promise((resolve, reject) => {
        usersDb.findOne({ id: sender }, async (err, user) => {
            if (err) {
                logger.error(`Erro ao buscar usuário: ${err.message}`);
                reject(err);
            } else if (user) {
                logger.debug(`Usuário existente recuperado: ${sender}`);
                resolve(user);
            } else {
                try {
                    let contact;
                    if (chat.isGroup) {
                        const participants = await chat.participants;
                        contact = participants.find(p => p.id._serialized === sender);
                    } else {
                        contact = await chat.getContact();
                    }
                    
                    const newUser = {
                        id: sender,
                        name: contact.pushname || contact.name || `User${sender.substring(0, 12)}`,
                        joinedAt: new Date()
                    };
                    
                    usersDb.insert(newUser, (err, doc) => {
                        if (err) {
                            logger.error(`Erro ao criar novo usuário: ${err.message}`);
                            reject(err);
                        } else {
                            logger.info(`Novo usuário criado: ${sender}`);
                            resolve(doc);
                        }
                    });
                } catch (error) {
                    logger.error(`Erro ao criar usuário: ${error.message}`);
                    reject(error);
                }
            }
        });
    });
};

module.exports = {
    getOrCreateUser
};
