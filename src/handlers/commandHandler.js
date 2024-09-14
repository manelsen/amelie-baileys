const { getConfig, setConfig } = require('../database/configDb');
const { resetChat } = require('../utils/chatUtils');
const { setSystemPrompt, getSystemPrompt, listSystemPrompts, removeSystemPrompt } = require('../database/promptsDb');
const { listGroupUsers } = require('../utils/userUtils');
const logger = require('../config/logger');

const handleCommand = async (msg, chatId) => {
    const [command, ...args] = msg.body.slice(1).split(' ');
    logger.info(`Comando: ${command}, Argumentos: ${args}`);

    try {
        switch (command.toLowerCase()) {
            case 'reset':
                await resetChat(chatId);
                await msg.reply('Chat resetado para este chat');
                break;
            case 'help':
                await sendHelpMessage(msg);
                break;
            case 'prompt':
                await handlePromptCommand(msg, args, chatId);
                break;
            case 'config':
                await handleConfigCommand(msg, args, chatId);
                break;
            case 'users':
                await listGroupUsers(msg);
                break;
            case 'audio':
                await handleAudioCommand(msg, args, chatId);
                break;
            case 'image':
                await handleImageCommand(msg, args, chatId);
                break;
            case 'document':
                await handleDocumentCommand(msg, args, chatId);
                break;
            default:
                await msg.reply('Comando desconhecido. Use !help para ver os comandos disponíveis.');
        }
    } catch (error) {
        logger.error(`Erro ao executar comando: ${error.message}`, { error });
        await msg.reply('Desculpe, ocorreu um erro ao executar o comando. Por favor, tente novamente.');
    }
};

const sendHelpMessage = async (msg) => {
    const helpMessage = `Comandos disponíveis:
!reset - Limpa o histórico de conversa
!prompt set <nome> <texto> - Define uma nova System Instruction
!prompt get <nome> - Mostra uma System Instruction existente
!prompt list - Lista todas as System Instructions
!prompt use <nome> - Usa uma System Instruction específica
!prompt clear - Remove a System Instruction ativa
!prompt remove <nome> - Remove uma System Instruction específica
!config set <param> <valor> - Define um parâmetro de configuração
!config get [param] - Mostra a configuração atual
!users - Lista os usuários do grupo
!audio enable/disable - Habilita ou desabilita o processamento de áudio
!image enable/disable - Habilita ou desabilita o processamento de imagem
!document enable/disable - Habilita ou desabilita o processamento de documentos
!help - Mostra esta mensagem de ajuda`;

    await msg.reply(helpMessage);
};

const handlePromptCommand = async (msg, args, chatId) => {
    const [subcommand, name, ...rest] = args;

    switch (subcommand) {
        case 'set':
            if (name && rest.length > 0) {
                const promptText = rest.join(' ');
                await setSystemPrompt(chatId, name, promptText);
                await msg.reply(`System Instruction "${name}" definida com sucesso. Note que instruções padrão sobre identificação de usuários e priorização de mensagens recentes serão adicionadas automaticamente.`);
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
            try {
                const prompts = await listSystemPrompts(chatId);
                if (prompts.length > 0) {
                    const promptList = prompts.map(p => p.name).join(', ');
                    await msg.reply(`System Instructions disponíveis: ${promptList}`);
                } else {
                    await msg.reply('Nenhuma System Instruction definida.');
                }
                logger.debug(`Prompts listados para ${chatId}: ${JSON.stringify(prompts)}`);
            } catch (error) {
                logger.error(`Erro ao listar prompts: ${error.message}`);
                await msg.reply('Ocorreu um erro ao listar as System Instructions.');
            }
            break;
        case 'use':
            if (name) {
                const prompt = await getSystemPrompt(chatId, name);
                if (prompt) {
                    await setConfig(chatId, 'activePrompt', name);
                    await msg.reply(`System Instruction "${name}" ativada para este chat.`);
                } else {
                    await msg.reply(`System Instruction "${name}" não encontrada.`);
                }
            } else {
                await msg.reply('Uso correto: !prompt use <nome>');
            }
            break;
        case 'clear':
            await setConfig(chatId, 'activePrompt', null);
            await msg.reply('System Instruction removida. Usando o modelo padrão.');
            break;
        case 'remove':
            if (name) {
                const numRemoved = await removeSystemPrompt(chatId, name);
                if (numRemoved > 0) {
                    await msg.reply(`System Instruction "${name}" removida com sucesso.`);
                } else {
                    await msg.reply(`System Instruction "${name}" não encontrada.`);
                }
            } else {
                await msg.reply('Uso correto: !prompt remove <nome>');
            }
            break;
        default:
            await msg.reply('Subcomando de prompt desconhecido. Use !help para ver os comandos disponíveis.');
    }
};

const handleConfigCommand = async (msg, args, chatId) => {
    const [subcommand, param, value] = args;

    switch (subcommand) {
        case 'set':
            if (param && value) {
                if (['temperature', 'topK', 'topP', 'maxOutputTokens'].includes(param)) {
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
            await msg.reply('Subcomando de config desconhecido. Use !help para ver os comandos disponíveis.');
    }
};

const handleAudioCommand = async (msg, args, chatId) => {
    const [subcommand] = args;
    switch (subcommand) {
        case 'enable':
            await setConfig(chatId, 'disableAudio', false);
            await msg.reply('Processamento de áudio habilitado.');
            break;
        case 'disable':
            await setConfig(chatId, 'disableAudio', true);
            await msg.reply('Processamento de áudio desabilitado.');
            break;
        default:
            await msg.reply('Uso correto: !audio enable ou !audio disable');
    }
};

const handleImageCommand = async (msg, args, chatId) => {
    const [subcommand] = args;
    switch (subcommand) {
        case 'enable':
            await setConfig(chatId, 'disableImage', false);
            await msg.reply('Processamento de imagem habilitado.');
            break;
        case 'disable':
            await setConfig(chatId, 'disableImage', true);
            await msg.reply('Processamento de imagem desabilitado.');
            break;
        default:
            await msg.reply('Uso correto: !image enable ou !image disable');
    }
};

const handleDocumentCommand = async (msg, args, chatId) => {
    const [subcommand] = args;
    switch (subcommand) {
        case 'enable':
            await setConfig(chatId, 'disableDocument', false);
            await msg.reply('Processamento de documentos habilitado.');
            break;
        case 'disable':
            await setConfig(chatId, 'disableDocument', true);
            await msg.reply('Processamento de documentos desabilitado.');
            break;
        default:
            await msg.reply('Uso correto: !document enable ou !document disable');
    }
};

module.exports = {
    handleCommand
};
