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

const withContext = (handler) => async (msg, ...args) => {
    let chatId;
    try {
        chatId = msg.chat?.id?._serialized || msg.from;
        if (!chatId) {
            throw new Error('Não foi possível determinar o chatId');
        }
        const context = await contextManager.getContext(chatId);
        return await handler(msg, context, chatId, ...args);
    } catch (error) {
        logger.error(`Erro ao processar mensagem: ${error.message}`, { 
            error,
            chatId,
            messageType: msg.type
        });
        if (msg.reply) {
            await msg.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.');
        }
    }
};

module.exports = {
    contextManager,
    withContext
};