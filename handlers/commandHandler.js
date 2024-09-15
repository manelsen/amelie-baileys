const {
    getConfig,
    setSystemPrompt,
    getSystemPrompt,
    listSystemPrompts,
    setConfig,
    removeSystemPrompt,
    updateConfigDisableType,
} = require('../database/configDb');
const { resetChat } = require('../utils/chatUtils');
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
            case 'image':
            case 'document':
                await handleMediaCommand(msg, args, chatId, command.toLowerCase());
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
                await msg.reply(`System Instruction "${name}" definida com sucesso.`);
            } else {
                await msg.reply('Uso correto: !prompt set <nome> <texto>');
            }
            break;
        case 'get':
            if (name) {
                const prompt = await getSystemPrompt(chatId, name);
                if (prompt) {
                    await msg.reply(`System Instruction "${name}":\n${prompt}`);
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

const handleMediaCommand = async (msg, args, chatId, type) => {
    const [subcommand] = args;
    switch (subcommand) {
        case 'enable':
            await updateConfigDisableType(chatId, type, false);
            await msg.reply(`Processamento de ${type} habilitado.`);
            break;
        case 'disable':
            await updateConfigDisableType(chatId, type, true);
            await msg.reply(`Processamento de ${type} desabilitado.`);
            break;
        default:
            await msg.reply(`Uso correto: !${type} enable ou !${type} disable`);
    }
};

const handleUsersCommand = async (msg, chatId) => {
    // Supondo que esta função liste os usuários do grupo corretamente.
    await listGroupUsers(msg);
};

module.exports = {
    handleCommand,
};
