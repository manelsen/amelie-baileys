// dispatchers/commandDispatcher.js

const {
    handlePromptCommand,
    handleConfigCommand,
    handleCegoCommand,
  } = require('../handlers/commandHandlers');
  const { resetHistory } = require('../data/database');
  const logger = require('../utilities/logger');
  
  async function handleCommand(msg, chatId) {
    const [command, ...args] = msg.body.slice(1).split(' ');
    logger.info(`Comando: ${command}, Argumentos: ${args}`);
  
    try {
      switch (command.toLowerCase()) {
        case 'reset':
          await resetHistory(chatId);
          await msg.reply('🤖 Histórico resetado para este chat');
          break;
        case 'help':
          await msg.reply(`Comandos disponíveis:\n...`);
          break;
        case 'prompt':
          await handlePromptCommand(msg, args, chatId);
          break;
        case 'config':
          await handleConfigCommand(msg, args, chatId);
          break;
        case 'users':
          // Implement listGroupUsers if needed
          break;
        case 'cego':
          await handleCegoCommand(msg, chatId);
          break;
        default:
          await msg.reply(
            'Comando desconhecido. Use !help para ver os comandos disponíveis.'
          );
      }
    } catch (error) {
      logger.error(`Erro ao executar comando: ${error.message}`, { error });
      await msg.reply(
        'Desculpe, ocorreu um erro ao executar o comando. Por favor, tente novamente.'
      );
    }
  }
  
  module.exports = {
    handleCommand,
  };
  