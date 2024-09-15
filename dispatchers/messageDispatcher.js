const { log } = require('./loggingDispatcher');
const { handleError } = require('./errorDispatcher');
const { getConfig } = require('../database/configDb');

const messageDispatcher = async (msg, context, chatId) => {
    try {
        const { type } = msg;
        
        if (!context) {
            log('warn', `Contexto não fornecido para chatId: ${chatId}. Obtendo configuração padrão.`);
            const config = await getConfig(chatId);
            context = { config };
        }

        let response;

        switch (type) {
            case 'chat':
                const { handleTextMessage } = await import('../handlers/textHandler');
                response = await handleTextMessage(msg, context, chatId);
                break;
            case 'image':
            case 'sticker':
                const { handleImageMessage } = await import('../handlers/imageHandler');
                response = await handleImageMessage(msg, context, chatId);
                break;
            case 'document':
                const { handleDocumentMessage } = await import('../handlers/documentHandler');
                response = await handleDocumentMessage(msg, context, chatId);
                break;
            case 'audio':
            case 'ptt':
                const { handleAudioMessage } = await import('../handlers/audioHandler');
                response = await handleAudioMessage(msg, context, chatId);
                break;
            default:
                log('warn', `Tipo de mensagem desconhecido: ${type}`);
                response = 'Desculpe, o tipo de mensagem não é suportado.';
                break;
        }

        if (response) {
            await msg.reply(response);
        }

    } catch (error) {
        handleError(error, { chatId, messageType: msg.type });
    }
};

module.exports = {
    messageDispatcher
};