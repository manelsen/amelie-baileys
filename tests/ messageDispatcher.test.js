const path = require('path');
const messageDispatcher = require('../dispatchers/messageDispatcher');
const { log } = require('../dispatchers/loggingDispatcher.js');
const { getConfig } = require('../database/configDb');

// Mock dos módulos externos
jest.mock('../dispatchers/loggingDispatcher', () => ({
    log: jest.fn(),
}));
jest.mock('../database/configDb', () => ({
    getConfig: jest.fn(),
}));
jest.mock('../handlers/textHandler', () => ({
    handleTextMessage: jest.fn(),
}));
jest.mock('../handlers/imageHandler', () => ({
    handleImageMessage: jest.fn(),
}));
jest.mock('../handlers/stickerHandler', () => ({
    handleImageMessage: jest.fn(),
}));
jest.mock('../handlers/documentHandler', () => ({
    handleDocumentMessage: jest.fn(),
}));
jest.mock('../handlers/audioHandler', () => ({
    handleAudioMessage: jest.fn(),
}));

describe('messageDispatcher', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should log an error for an invalid message object', async () => {
        const invalidMessages = [null, undefined, 'string', 123, true, []];
        const chatId = '123';

        for (const invalidMsg of invalidMessages) {
            await messageDispatcher(invalidMsg, {}, chatId);
            expect(log).toHaveBeenCalledWith('error', 'Objeto de mensagem inválido recebido.', { chatId });
        }
    });

    it('should fetch default config when context is not provided', async () => {
        const msg = { type: 'chat', text: 'Hello' };
        const chatId = '123';
        const defaultConfig = { someConfig: 'value' };
        getConfig.mockResolvedValue(defaultConfig);

        await messageDispatcher(msg, null, chatId);

        expect(log).toHaveBeenCalledWith('warn', `Contexto não fornecido para chatId: ${chatId}. Obtendo configuração padrão.`);
        expect(getConfig).toHaveBeenCalledWith(chatId);
        expect(require('../handlers/textHandler').handleTextMessage).toHaveBeenCalledWith(msg, { config: defaultConfig }, chatId);
    });

    it('should call the correct handler for each message type', async () => {
        const chatId = '123';
        const context = { config: {} };

        const testCases = [
            { type: 'chat', handler: 'handleTextMessage' },
            { type: 'image', handler: 'handleImageMessage' },
            { type: 'sticker', handler: 'handleImageMessage' },
            { type: 'document', handler: 'handleDocumentMessage' },
            { type: 'audio', handler: 'handleAudioMessage' },
            { type: 'ptt', handler: 'handleAudioMessage' },
        ];

        for (const testCase of testCases) {
            const msg = { type: testCase.type };
            await messageDispatcher(msg, context, chatId);

            const handlerModule = require(`../handlers/${testCase.type === 'chat' ? 'textHandler' : testCase.type + 'Handler'}`);
            expect(handlerModule[testCase.handler]).toHaveBeenCalledWith(msg, context, chatId);
        }
    });

    it('should throw an error for an unsupported message type', async () => {
        const msg = { type: 'unsupported' };
        const context = { config: {} };
        const chatId = '123';

        await expect(messageDispatcher(msg, context, chatId)).rejects.toThrow(`Tipo de mensagem não suportado: unsupported`);
    });

    it('should reply to the message when a response is available', async () => {
        const msg = { type: 'chat', text: 'Hello', reply: jest.fn() };
        const context = { config: {} };
        const chatId = '123';
        const response = 'Hi there!';
        require('../handlers/textHandler').handleTextMessage.mockResolvedValue(response);

        await messageDispatcher(msg, context, chatId);

        expect(msg.reply).toHaveBeenCalledWith(response);
    });

    it('should log a warning when unable to send a response', async () => {
        const msg = { type: 'chat', text: 'Hello' }; // Sem método reply
        const context = { config: {} };
        const chatId = '123';
        const response = 'Hi there!';
        require('../handlers/textHandler').handleTextMessage.mockResolvedValue(response);

        await messageDispatcher(msg, context, chatId);

        expect(log).toHaveBeenCalledWith('warn', 'Não foi possível enviar resposta: objeto msg inválido ou método reply não disponível.', { chatId });
    });

    it('should handle errors gracefully and send an error message', async () => {
        const msg = { type: 'chat', text: 'Hello', reply: jest.fn() };
        const context = { config: {} };
        const chatId = '123';
        const error = new Error('Some error occurred');
        require('../handlers/textHandler').handleTextMessage.mockRejectedValue(error);

        await messageDispatcher(msg, context, chatId);

        expect(log).toHaveBeenCalledWith('error', `Erro no messageDispatcher: ${error.message}`, { error, chatId });
        expect(msg.reply).toHaveBeenCalledWith('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.');
    });

    it('should handle errors when sending the error message', async () => {
        const msg = { type: 'chat', text: 'Hello', reply: jest.fn() };
        const context = { config: {} };
        const chatId = '123';
        const error = new Error('Some error occurred');
        const replyError = new Error('Failed to send error message');
        require('../handlers/textHandler').handleTextMessage.mockRejectedValue(error);
        msg.reply.mockRejectedValue(replyError);

        await messageDispatcher(msg, context, chatId);

        expect(log).toHaveBeenCalledWith('error', `Erro no messageDispatcher: ${error.message}`, { error, chatId });
        expect(msg.reply).toHaveBeenCalledWith('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.');
        expect(log).toHaveBeenCalledWith('error', `Erro ao enviar mensagem de erro: ${replyError.message}`, { replyError, chatId });
    });
});