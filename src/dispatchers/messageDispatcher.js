const handleTextMessage = require('../handlers/textHandler').handleTextMessage;
const handleImageMessage = require('../handlers/imageHandler').handleImageMessage;
const handleDocumentMessage = require('../handlers/documentHandler').handleDocumentMessage;
const handleAudioMessage = require('../handlers/audioHandler').handleLargeAudioMessage; // Exemplo

// Importar outros handlers conforme necessário

/**
 * Dispatcher para direcionar mensagens para os handlers apropriados.
 * @param {object} msg - Mensagem recebida.
 * @param {object} context - Contexto do chat.
 * @param {string} chatId - ID do chat.
 */
const messageDispatcher = async (msg, context, chatId) => {
    try {
        const { type } = msg; // Determina o tipo da mensagem
        const { config } = context;

        switch (type) {
            case 'chat': // Tipo de mensagem de texto
                logger.debug('Chamando handleTextMessage');
                await handleTextMessage(msg, context, chatId);
                break;
            case 'image':
            case 'sticker':
                logger.debug('Chamando handleImageMessage');                
                await handleImageMessage(msg, context, chatId);
                break;
            case 'document':
                logger.debug('Chamando handleDocumentMessage');
                await handleDocumentMessage(msg, context, chatId);
                break;
            case 'audio':
                await handleAudioMessage(msg, context, chatId);
                break;
            // Adicione mais casos conforme necessário
            default:
                logger.warn(`Tipo de mensagem desconhecido: ${type}`);
                await msg.reply('Desculpe, o tipo de mensagem não é suportado.');
                break;
        }
    } catch (error) {
        logger.error(`Erro no messageDispatcher: ${error.message}`, { error });
        await msg.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.');
    }
};

module.exports = {
    messageDispatcher
};
