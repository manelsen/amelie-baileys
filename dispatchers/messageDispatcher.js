const { log } = require('./loggingDispatcher');
const { handleError } = require('./errorDispatcher');
const { getConfig } = require('../database/configDb');

const importHandler = async (type) => {
    switch (type) {
        case 'chat':
            return import('../handlers/textHandler');
        case 'image':
        case 'sticker':
            return import('../handlers/imageHandler');
        case 'document':
            return import('../handlers/documentHandler');
        case 'audio':
        case 'ptt':
            return import('../handlers/audioHandler');
        default:
            throw new Error(`Tipo de mensagem não suportado: ${type}`);
    }
};

const messageDispatcher = async (msg, context, chatId) => {
    if (!msg || typeof msg !== 'object') {
        log('error', 'Objeto de mensagem inválido', { chatId });
        return;
    }

    try {
        const { type } = msg;
        
        if (!context) {
            log('warn', `Contexto não fornecido para chatId: ${chatId}. Obtendo configuração padrão.`);
            const config = await getConfig(chatId);
            context = { config };
        }

        let response;

        try {
            const handler = await importHandler(type);
            if (type === 'chat') {
                response = await handler.handleTextMessage(msg, context, chatId);
            } else if (type === 'image' || type === 'sticker') {
                response = await handler.handleImageMessage(msg, context, chatId);
            } else if (type === 'document') {
                response = await handler.handleDocumentMessage(msg, context, chatId);
            } else if (type === 'audio' || type === 'ptt') {
                response = await handler.handleAudioMessage(msg, context, chatId);
            }
        } catch (importError) {
            log('error', `Erro ao processar mensagem: ${importError.message}`, { error: importError, type, chatId });
            response = 'Desculpe, ocorreu um erro ao processar sua mensagem.';
        }

        if (response && msg && typeof msg.reply === 'function') {
            await msg.reply(response);
        } else if (response) {
            log('warn', 'Não foi possível enviar resposta: objeto msg inválido ou método reply não disponível', { chatId });
        }

    } catch (error) {
        log('error', `Erro no messageDispatcher: ${error.message}`, { error, chatId });
        if (msg && typeof msg.reply === 'function') {
            try {
                await msg.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.');
            } catch (replyError) {
                log('error', `Erro ao enviar mensagem de erro: ${replyError.message}`, { replyError, chatId });
            }
        }
    }
};

module.exports = messageDispatcher;