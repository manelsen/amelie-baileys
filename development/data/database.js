// data/database.js

const Datastore = require('nedb');
const { MAX_HISTORY, BOT_NAME, defaultConfig } = require('../utilities/config');
const logger = require('../utilities/logger');

const messagesDb = new Datastore({
  filename: './db/messages.db',
  autoload: true,
});
const promptsDb = new Datastore({ filename: './db/prompts.db', autoload: true });
const configDb = new Datastore({ filename: './db/config.db', autoload: true });
const usersDb = new Datastore({ filename: './db/users.db', autoload: true });

function getOrCreateUser(sender, chat) {
  return new Promise((resolve, reject) => {
    usersDb.findOne({ id: sender }, async (err, user) => {
      if (err) {
        reject(err);
      } else if (user) {
        resolve(user);
      } else {
        try {
          let contact;
          if (chat.isGroup) {
            const participants = await chat.participants;
            contact = participants.find(
              (p) => p.id._serialized === sender
            );
          } else {
            contact = await chat.getContact();
          }

          const newUser = {
            id: sender,
            name:
              contact.pushname ||
              contact.name ||
              `User${sender.substring(0, 12)}`,
            joinedAt: new Date(),
          };

          usersDb.insert(newUser, (err, doc) => {
            if (err) reject(err);
            else resolve(doc);
          });
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}

function updateMessageHistory(chatId, sender, message, isBot = false) {
  return new Promise((resolve, reject) => {
    messagesDb.insert(
      {
        chatId,
        sender,
        content: message,
        timestamp: Date.now(),
        type: isBot ? 'bot' : 'user',
      },
      (err) => {
        if (err) reject(err);
        else {
          messagesDb
            .find({ chatId: chatId, type: { $in: ['user', 'bot'] } })
            .sort({ timestamp: -1 })
            .skip(MAX_HISTORY * 2)
            .exec((err, docsToRemove) => {
              if (err) reject(err);
              else {
                messagesDb.remove(
                  { _id: { $in: docsToRemove.map((doc) => doc._id) } },
                  { multi: true },
                  (err) => {
                    if (err) reject(err);
                    else resolve();
                  }
                );
              }
            });
        }
      }
    );
  });
}

function getMessageHistory(chatId, limit = MAX_HISTORY) {
  return new Promise((resolve, reject) => {
    messagesDb
      .find({ chatId: chatId, type: { $in: ['user', 'bot'] } })
      .sort({ timestamp: -1 })
      .limit(limit * 2)
      .exec((err, docs) => {
        if (err) reject(err);
        else
          resolve(
            docs.reverse().map((doc) => `${doc.sender}: ${doc.content}`)
          );
      });
  });
}

function resetHistory(chatId) {
  return new Promise((resolve, reject) => {
    messagesDb.remove(
      { chatId: chatId, type: { $in: ['user', 'bot'] } },
      { multi: true },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function setSystemPrompt(chatId, name, text) {
  return new Promise((resolve, reject) => {
    const formattedText = `Seu nome é ${name}. ${text}`;
    promptsDb.update(
      { chatId, name },
      { chatId, name, text: formattedText },
      { upsert: true },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function getSystemPrompt(chatId, name) {
  return new Promise((resolve, reject) => {
    promptsDb.findOne({ chatId, name }, (err, doc) => {
      if (err) reject(err);
      else resolve(doc);
    });
  });
}

function listSystemPrompts(chatId) {
  return new Promise((resolve, reject) => {
    promptsDb.find({ chatId }, (err, docs) => {
      if (err) reject(err);
      else resolve(docs);
    });
  });
}

async function setActiveSystemPrompt(chatId, promptName) {
  try {
    const prompt = await getSystemPrompt(chatId, promptName);
    if (prompt) {
      await setConfig(chatId, 'activePrompt', promptName);
      logger.debug(`Active prompt set for chat ${chatId}: ${promptName}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Erro ao definir System Instruction ativa: ${error.message}`, {
      error,
    });
    return false;
  }
}

async function clearActiveSystemPrompt(chatId) {
  try {
    await setConfig(chatId, 'activePrompt', null);
    return true;
  } catch (error) {
    logger.error(`Erro ao limpar System Instruction ativa: ${error.message}`, {
      error,
    });
    return false;
  }
}

function setConfig(chatId, param, value) {
  return new Promise((resolve, reject) => {
    configDb.update(
      { chatId },
      { $set: { [param]: value } },
      { upsert: true },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function getConfig(chatId) {
  return new Promise((resolve, reject) => {
    configDb.findOne({ chatId }, async (err, doc) => {
      if (err) {
        reject(err);
      } else {
        const userConfig = doc || {};
        const config = { ...defaultConfig, ...userConfig };

        if (config.activePrompt) {
          const activePrompt = await getSystemPrompt(chatId, config.activePrompt);
          if (activePrompt) {
            config.systemInstructions = activePrompt.text;
            const match = config.systemInstructions.match(/^Seu nome é (\w+)\./);
            config.botName = match ? match[1] : BOT_NAME;
          }
        } else {
          config.botName = BOT_NAME;
        }

        if (
          config.systemInstructions &&
          typeof config.systemInstructions !== 'string'
        ) {
          config.systemInstructions = String(config.systemInstructions);
        }

        resolve(config);
      }
    });
  });
}

async function loadConfigOnStartup() {
  return new Promise((resolve, reject) => {
    configDb.find({}, async (err, docs) => {
      if (err) {
        reject(err);
      } else {
        for (const doc of docs) {
          const chatId = doc.chatId;
          const config = await getConfig(chatId);
          logger.info(`Configurações carregadas para o chat ${chatId}`);
        }
        resolve();
      }
    });
  });
}

module.exports = {
  getOrCreateUser,
  updateMessageHistory,
  getMessageHistory,
  resetHistory,
  setSystemPrompt,
  getSystemPrompt,
  listSystemPrompts,
  setActiveSystemPrompt,
  clearActiveSystemPrompt,
  setConfig,
  getConfig,
  loadConfigOnStartup,
};
