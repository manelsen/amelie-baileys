// index.js

const client = require('./services/whatsappService.js');
const logger = require('./utilities/logger');
const { initializeBot } = require('./botInitializer.js');
const { handleCommand } = require('./dispatchers/commandDispatcher');
const { handleTextMessage } = require('./handlers/messageHandler');
const { shouldRespondInGroup } = require('./utilities/groupUtils');

initializeBot();

client.on('message_create', async (msg) => {
  try {
    if (msg.fromMe) return;

    const chat = await msg.getChat();
    await chat.sendSeen();

    logger.info(
      `Mensagem recebida: User (identificado no Whatsapp como ${msg.author} ou ${msg.from}) -> ${msg.body}`
    );

    const chatId = chat.id._serialized;

    const isCommand = msg.body.startsWith('!');

    if (chat.isGroup && !isCommand) {
      const shouldRespond = await shouldRespondInGroup(msg, chat);
      if (!shouldRespond && !msg.hasMedia) return;
    }

    if (isCommand) {
      logger.info(`Comando detectado: ${msg.body}`);
      await handleCommand(msg, chatId);
    } else if (msg.hasMedia) {
      // Implement media message handling if needed
    } else {
      await handleTextMessage(msg);
    }
  } catch (error) {
    logger.error(`Erro ao processar mensagem: ${error.message}`, { error });
    await msg.reply(
      'Desculpe, ocorreu um erro inesperado. Por favor, tente novamente mais tarde.'
    );
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`, { error });
  process.exit(1);
});