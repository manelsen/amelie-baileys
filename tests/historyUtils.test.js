const historyUtils = require('../utils/historyUtils.js');
const messageStorageDispatcher = require('../dispatchers/messageStorageDispatcher');
const { log } = require('../dispatchers/loggingDispatcher');
const { handleError } = require('../dispatchers/errorDispatcher');

jest.mock('../dispatchers/messageStorageDispatcher');
jest.mock('../dispatchers/loggingDispatcher');
jest.mock('../dispatchers/errorDispatcher');

describe('historyUtils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('formatMessage', () => {
        it('should format a valid message correctly', () => {
            const rawMessage = { role: 'user', message: 'Hello' };
            const formattedMessage = historyUtils.formatMessage(rawMessage);
            expect(formattedMessage).toEqual({ role: 'user', content: 'Hello' });
        });

        it('should format a bot message correctly', () => {
            const rawMessage = { role: 'bot', message: 'Hi there!' };
            const formattedMessage = historyUtils.formatMessage(rawMessage);
            expect(formattedMessage).toEqual({ role: 'model', content: 'Hi there!' });
        });

        it('should return null for an invalid message', () => {
            const invalidMessages = [
                null,
                undefined,
                {},
                { role: 'user' },
                { message: 'Hello' },
            ];
            invalidMessages.forEach(invalidMessage => {
                const formattedMessage = historyUtils.formatMessage(invalidMessage);
                expect(formattedMessage).toBeNull();
                expect(log).toHaveBeenCalledWith('warn', 'Mensagem inválida encontrada no histórico', { message: invalidMessage });
            });
        });
    });

    describe('getFormattedHistory', () => {
        it('should retrieve and format history correctly', async () => {
            const chatId = '123';
            const rawHistory = [
                { role: 'user', message: 'Hello' },
                { role: 'bot', message: 'Hi there!' },
            ];
            messageStorageDispatcher.getHistory.mockResolvedValue(rawHistory);

            const formattedHistory = await historyUtils.getFormattedHistory(chatId);

            expect(messageStorageDispatcher.getHistory).toHaveBeenCalledWith(chatId, 1000);
            expect(log).toHaveBeenCalledWith('debug', `Obtendo histórico para chatId ${chatId}`, { chatId, maxHistory: 1000 });
            expect(formattedHistory).toEqual([
                { role: 'user', content: 'Hello' },
                { role: 'model', content: 'Hi there!' },
            ]);
            expect(log).toHaveBeenCalledWith('debug', `Histórico formatado para chatId ${chatId}`, { 
                chatId, 
                messageCount: formattedHistory.length 
            });
        });

        it('should handle empty history', async () => {
            const chatId = '123';
            messageStorageDispatcher.getHistory.mockResolvedValue([]);

            const formattedHistory = await historyUtils.getFormattedHistory(chatId);

            expect(formattedHistory).toEqual([]);
        });

        it('should handle invalid history response', async () => {
            const chatId = '123';
            messageStorageDispatcher.getHistory.mockResolvedValue(null);

            const formattedHistory = await historyUtils.getFormattedHistory(chatId);

            expect(formattedHistory).toEqual([]);
            expect(log).toHaveBeenCalledWith('warn', 'Histórico retornado não é um array', { chatId, rawHistory: null });
        });

        it('should handle errors during history retrieval', async () => {
            const chatId = '123';
            const error = new Error('Database error');
            messageStorageDispatcher.getHistory.mockRejectedValue(error);

            const formattedHistory = await historyUtils.getFormattedHistory(chatId);

            expect(formattedHistory).toEqual([]);
            expect(log).toHaveBeenCalledWith('error', `Erro ao obter ou formatar histórico para chatId ${chatId}`, { 
                chatId, 
                error: error.message 
            });
            expect(handleError).toHaveBeenCalledWith(error, { chatId, msg: { reply: expect.any(Function) }});
        });

        it('should respect maxHistory config', async () => {
            const chatId = '123';
            const rawHistory = [
                { role: 'user', message: 'Message 1' },
                { role: 'bot', message: 'Response 1' },
                { role: 'user', message: 'Message 2' },
            ];
            messageStorageDispatcher.getHistory.mockResolvedValue(rawHistory);

            const formattedHistory = await historyUtils.getFormattedHistory(chatId, { maxHistory: 2 });

            expect(messageStorageDispatcher.getHistory).toHaveBeenCalledWith(chatId, 2);
            expect(formattedHistory).toEqual([
                { role: 'user', content: 'Message 2' },
                { role: 'model', content: 'Response 1' },
            ]);
        });
    });

    describe('saveMessage', () => {
        it('should save a message successfully', async () => {
            const chatId = '123';
            const sender = 'User';
            const message = 'Hello';
            const role = 'user';
            messageStorageDispatcher.saveMessage.mockResolvedValue();

            const result = await historyUtils.saveMessage(chatId, sender, message, role);

            expect(messageStorageDispatcher.saveMessage).toHaveBeenCalledWith(chatId, sender, message, role);
            expect(log).toHaveBeenCalledWith('debug', `Mensagem salva com sucesso para chatId ${chatId}`, { chatId, sender, role });
            expect(result).toBe(true);
        });

        it('should handle errors during message saving', async () => {
            const chatId = '123';
            const sender = 'User';
            const message = 'Hello';
            const role = 'user';
            const error = new Error('Database error');
            messageStorageDispatcher.saveMessage.mockRejectedValue(error);

            const result = await historyUtils.saveMessage(chatId, sender, message, role);

            expect(result).toBe(false);
            expect(log).toHaveBeenCalledWith('error', `Erro ao salvar mensagem para chatId ${chatId}`, { 
                chatId, 
                sender, 
                role, 
                error: error.message 
            });
            expect(handleError).toHaveBeenCalledWith(error, { chatId, msg: { reply: expect.any(Function) }});
        });

        it('should default role to "user"', async () => {
            const chatId = '123';
            const sender = 'User';
            const message = 'Hello';
            messageStorageDispatcher.saveMessage.mockResolvedValue();

            const result = await historyUtils.saveMessage(chatId, sender, message);

            expect(messageStorageDispatcher.saveMessage).toHaveBeenCalledWith(chatId, sender, message, 'user');
            expect(result).toBe(true);
        });
    });

    describe('clearHistory', () => {
        it('should clear history successfully', async () => {
            const chatId = '123';
            const numRemoved = 5;
            messageStorageDispatcher.clearHistory.mockResolvedValue(numRemoved);

            const result = await historyUtils.clearHistory(chatId);

            expect(messageStorageDispatcher.clearHistory).toHaveBeenCalledWith(chatId);
            expect(log).toHaveBeenCalledWith('info', `Histórico limpo para chatId ${chatId}`, { chatId, messagesRemoved: numRemoved });
            expect(result).toBe(numRemoved);
        });

        it('should handle errors during history clearing', async () => {
            const chatId = '123';
            const error = new Error('Database error');
            messageStorageDispatcher.clearHistory.mockRejectedValue(error);

            const result = await historyUtils.clearHistory(chatId);

            expect(result).toBe(0);
            expect(log).toHaveBeenCalledWith('error', `Erro ao limpar histórico para chatId ${chatId}`, { 
                chatId, 
                error: error.message 
            });
            expect(handleError).toHaveBeenCalledWith(error, { chatId, msg: { reply: expect.any(Function) }});
        });
    });

    describe('addSystemMessage', () => {
        it('should add a system message successfully', async () => {
            const chatId = '123';
            const message = 'System notification';
            messageStorageDispatcher.saveMessage.mockResolvedValue();

            const result = await historyUtils.addSystemMessage(chatId, message);

            expect(messageStorageDispatcher.saveMessage).toHaveBeenCalledWith(chatId, expect.any(String), message, 'system');
            expect(result).toBe(true);
        });

        it('should handle errors during system message saving', async () => {
            const chatId = '123';
            const message = 'System notification';
            const error = new Error('Database error');
            messageStorageDispatcher.saveMessage.mockRejectedValue(error);

            const result = await historyUtils.addSystemMessage(chatId, message);

            expect(result).toBe(false);
            expect(handleError).toHaveBeenCalledWith(error, { chatId, msg: { reply: expect.any(Function) }});
        });
    });
});