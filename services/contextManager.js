const { getConfig } = require('../database/configDb');
const { getSystemPrompt } = require('../database/promptsDb');
const { log } = require('../dispatchers/loggingDispatcher');

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
        log('debug', `Contexto atualizado para chatId: ${chatId}`, { updates });
    }

    async clearContext(chatId) {
        this.contexts.delete(chatId);
        log('info', `Contexto limpo para chatId: ${chatId}`);
    }
}

const contextManager = new ContextManager();

const withContext = (handler) => async (msg, ...args) => {
    const chatId = msg.chat?.id?._serialized || msg.from;
    if (!chatId) {
        throw new Error('Não foi possível determinar o chatId');
    }
    const context = await contextManager.getContext(chatId);
    return await handler(msg, context, chatId, ...args);
};

module.exports = {
    contextManager,
    withContext
};