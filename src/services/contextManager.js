const { getConfig } = require('../database/configDb');
const { getSystemPrompt } = require('../database/promptsDb');
const logger = require('../config/logger');

class ContextManager {
    constructor() {
        this.contexts = new Map();
    }

    async getContext(chatId) {
        if (!this.contexts.has(chatId)) {
            const config = await getConfig(chatId);
            const activePrompt = config.activePrompt ? await getSystemPrompt(chatId, config.activePrompt) : null;
            this.contexts.set(chatId, { config, activePrompt });
        }
        return this.contexts.get(chatId);
    }

    async updateContext(chatId, updates) {
        const context = await this.getContext(chatId);
        Object.assign(context, updates);
        this.contexts.set(chatId, context);
    }

    async clearContext(chatId) {
        this.contexts.delete(chatId);
    }
}

const contextManager = new ContextManager();

/**
 * Decorador para adicionar contexto às funções de handler.
 * @param {Function} handler - Função de handler que recebe (msg, context, chatId, ...args)
 * @returns {Function} - Função decorada que recebe (msg, ...args)
 */
const withContext = (handler) => async (msg, ...args) => {
    let chatId;
    try {
        // Determina o chatId a partir da mensagem
        chatId = msg.chat?.id?._serialized || msg.from;
        if (!chatId) {
            throw new Error('Não foi possível determinar o chatId');
        }
        // Obtém o contexto para o chatId
        const context = await contextManager.getContext(chatId);
        logger.debug(`Contexto obtido para chatId ${chatId}: ${JSON.stringify(context)}`);
        // Chama o handler com msg, context, chatId e quaisquer outros argumentos
        return await handler(msg, context, chatId, ...args);
    } catch (error) {
        logger.error(`Erro ao processar mensagem: ${error.message}`, { 
            error,
            chatId,
            messageType: msg.type
        });
        // Envia uma resposta de erro ao usuário, se possível
        if (msg.reply) {
            await msg.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.');
        }
    }
};

module.exports = {
    contextManager,
    withContext
};
