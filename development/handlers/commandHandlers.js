// handlers/commandHandlers.js

const {
    setSystemPrompt,
    getSystemPrompt,
    listSystemPrompts,
    setActiveSystemPrompt,
    clearActiveSystemPrompt,
    setConfig,
    getConfig,
  } = require('../data/database');
  const logger = require('../utilities/logger');
  
  async function handlePromptCommand(msg, args, chatId) {
    const [subcommand, name, ...rest] = args;
  
    switch (subcommand) {
      case 'set':
        if (name && rest.length > 0) {
          const promptText = rest.join(' ');
          await setSystemPrompt(chatId, name, promptText);
          await msg.reply(
            `System Instruction "${name}" definida com sucesso.`
          );
        } else {
          await msg.reply('Uso correto: !prompt set <nome> <texto>');
        }
        break;
      case 'get':
        if (name) {
          const prompt = await getSystemPrompt(chatId, name);
          if (prompt) {
            await msg.reply(`System Instruction "${name}":\n${prompt.text}`);
          } else {
            await msg.reply(`System Instruction "${name}" não encontrada.`);
          }
        } else {
          await msg.reply('Uso correto: !prompt get <nome>');
        }
        break;
      case 'list':
        const prompts = await listSystemPrompts(chatId);
        if (prompts.length > 0) {
          const promptList = prompts.map((p) => p.name).join(', ');
          await msg.reply(`System Instructions disponíveis: ${promptList}`);
        } else {
          await msg.reply('Nenhuma System Instruction definida.');
        }
        break;
      case 'use':
        if (name) {
          const prompt = await getSystemPrompt(chatId, name);
          if (prompt) {
            await setActiveSystemPrompt(chatId, name);
            await msg.reply(`System Instruction "${name}" ativada para este chat.`);
          } else {
            await msg.reply(`System Instruction "${name}" não encontrada.`);
          }
        } else {
          await msg.reply('Uso correto: !prompt use <nome>');
        }
        break;
      case 'clear':
        await clearActiveSystemPrompt(chatId);
        await msg.reply('System Instruction removida. Usando o modelo padrão.');
        break;
      default:
        await msg.reply(
          'Subcomando de prompt desconhecido. Use !help para ver os comandos disponíveis.'
        );
    }
  }
  
  async function handleConfigCommand(msg, args, chatId) {
    const [subcommand, param, value] = args;
  
    switch (subcommand) {
      case 'set':
        if (param && value) {
          if (
            ['temperature', 'topK', 'topP', 'maxOutputTokens'].includes(param)
          ) {
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              await setConfig(chatId, param, numValue);
              await msg.reply(`Parâmetro ${param} definido como ${numValue}`);
            } else {
              await msg.reply(`Valor inválido para ${param}. Use um número.`);
            }
          } else {
            await msg.reply(`Parâmetro desconhecido: ${param}`);
          }
        } else {
          await msg.reply('Uso correto: !config set <param> <valor>');
        }
        break;
      case 'get':
        const config = await getConfig(chatId);
        if (param) {
          if (config.hasOwnProperty(param)) {
            await msg.reply(`${param}: ${config[param]}`);
          } else {
            await msg.reply(`Parâmetro desconhecido: ${param}`);
          }
        } else {
          const configString = Object.entries(config)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
          await msg.reply(`Configuração atual:\n${configString}`);
        }
        break;
      default:
        await msg.reply(
          'Subcomando de config desconhecido. Use !help para ver os comandos disponíveis.'
        );
    }
  }
  
  async function handleCegoCommand(msg, chatId) {
    try {
      // Enable image description
      await setConfig(chatId, 'mediaImage', true);
      // Disable audio transcription
      await setConfig(chatId, 'mediaAudio', false);
  
      // Set and activate the "Audiomar" prompt
      const audiomarPrompt = `Você é um chatbot especializado em audiodescrição...`;
      await setSystemPrompt(chatId, 'Audiomar', audiomarPrompt);
      await setActiveSystemPrompt(chatId, 'Audiomar');
  
      await msg.reply(
        'Configurações para usuários com deficiência visual aplicadas com sucesso:\n' +
          '- Descrição de imagens habilitada\n' +
          '- Transcrição de áudio desabilitada\n' +
          '- Prompt de audiodescrição "Audiomar" ativado'
      );
  
      logger.info(
        `Configurações para usuários com deficiência visual aplicadas no chat ${chatId}`
      );
    } catch (error) {
      logger.error(
        `Erro ao aplicar configurações para usuários com deficiência visual: ${error.message}`,
        { error }
      );
      await msg.reply(
        'Desculpe, ocorreu um erro ao aplicar as configurações. Por favor, tente novamente.'
      );
    }
  }
  
  module.exports = {
    handlePromptCommand,
    handleConfigCommand,
    handleCegoCommand,
  };
  