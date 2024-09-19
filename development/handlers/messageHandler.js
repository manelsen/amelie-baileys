// handlers/messageHandler.js

const {
    getOrCreateUser,
    getConfig,
    updateMessageHistory,
    getMessageHistory,
  } = require('../data/database');
  const { generateResponseWithText } = require('../services/aiService');
  const logger = require('../utilities/logger');
  const { sendMessage } = require('../utilities/messenger');
  
  async function handleTextMessage(msg) {
    try {
      const chat = await msg.getChat();
      const chatId = chat.id._serialized;
      const sender = msg.author || msg.from;
  
      const user = await getOrCreateUser(sender, chat);
      const chatConfig = await getConfig(chatId);
  
      await updateMessageHistory(chatId, user.name, msg.body);
  
      const history = await getMessageHistory(chatId);
      const userPromptText =
        'Histórico de chat: (formato: nome do usuário e em seguida mensagem; responda à última mensagem)\n\n' +
        history.join('\n');
  
      logger.debug(`Gerando resposta para: ${userPromptText}`);
      const response = await generateResponseWithText(userPromptText, chatId);
      logger.debug(`Resposta gerada (sem emojis): ${response}`);
  
      await updateMessageHistory(chatId, chatConfig.botName, response, true);
      await sendMessage(msg, response);
    } catch (error) {
      logger.error(`Erro ao processar mensagem de texto: ${error.message}`);
      await msg.reply(
        'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.'
      );
    }
  }
  
  // Implement handleImageMessage, handleAudioMessage similarly
  
  module.exports = {
    handleTextMessage,
    // handleImageMessage,
    // handleAudioMessage,
  };
  