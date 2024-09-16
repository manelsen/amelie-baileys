const winston = require('winston');
const Datastore = require('nedb');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Mock das dependências externas
jest.mock('winston', () => {
  const mFormat = {
    combine: jest.fn(),
    timestamp: jest.fn(),
    printf: jest.fn()
  };
  return {
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    })),
    format: mFormat,
    transports: {
      Console: jest.fn(),
      File: jest.fn()
    }
  };
});
jest.mock('nedb');
jest.mock('@google/generative-ai');

// Importar as funções que queremos testar
const {
  getOrCreateUser,
  updateMessageHistory,
  getMessageHistory,
  resetHistory,
  setSystemPrompt,
  getSystemPrompt,
  listSystemPrompts,
  setActiveSystemPrompt,
  clearActiveSystemPrompt,
  setConfig,
  getConfig,
  generateResponseWithText,
  handleTextMessage,
  handleImageMessage,
  handleAudioMessage,
  initializeLogger  // Adicione esta função se você tiver uma função separada para inicializar o logger
} = require('./your-main-file'); // Substitua pelo nome real do seu arquivo principal

describe('WhatsApp Bot System Tests', () => {
  beforeEach(() => {
    // Limpar todos os mocks antes de cada teste
    jest.clearAllMocks();
  });

  describe('Logger Configuration', () => {
    test('should initialize Winston logger correctly', () => {
      initializeLogger(); // Se você tiver uma função separada para inicializar o logger

      expect(winston.createLogger).toHaveBeenCalledWith(expect.objectContaining({
        level: 'debug',
        format: expect.any(Object),
        transports: expect.arrayContaining([
          expect.any(winston.transports.Console),
          expect.any(winston.transports.File)
        ])
      }));

      expect(winston.format.combine).toHaveBeenCalled();
      expect(winston.format.timestamp).toHaveBeenCalled();
      expect(winston.format.printf).toHaveBeenCalled();
    });

    test('logger should have correct methods', () => {
      const logger = winston.createLogger();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.debug).toBeDefined();
    });
  });

  describe('User Management', () => {
    test('getOrCreateUser should create a new user if not exists', async () => {
      const mockInsert = jest.fn((newUser, callback) => callback(null, newUser));
      Datastore.mockImplementation(() => ({
        findOne: jest.fn((query, callback) => callback(null, null)),
        insert: mockInsert,
      }));

      const sender = '1234567890';
      const chat = { isGroup: false, getContact: () => ({ pushname: 'Test User' }) };

      const result = await getOrCreateUser(sender, chat);

      expect(result).toEqual(expect.objectContaining({
        id: sender,
        name: 'Test User',
        joinedAt: expect.any(Date),
      }));
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe('Message History', () => {
    test('updateMessageHistory should add a message to history', async () => {
      const mockInsert = jest.fn((newMessage, callback) => callback(null));
      Datastore.mockImplementation(() => ({
        insert: mockInsert,
        find: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        exec: jest.fn((callback) => callback(null, [])),
      }));

      await updateMessageHistory('chat123', 'User', 'Hello', false);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 'chat123',
          sender: 'User',
          content: 'Hello',
          type: 'user',
        }),
        expect.any(Function)
      );
    });

    test('getMessageHistory should return formatted message history', async () => {
      const mockMessages = [
        { sender: 'User', content: 'Hello' },
        { sender: 'Bot', content: 'Hi there' },
      ];
      Datastore.mockImplementation(() => ({
        find: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn((callback) => callback(null, mockMessages)),
      }));

      const history = await getMessageHistory('chat123');

      expect(history).toEqual(['User: Hello', 'Bot: Hi there']);
    });

    test('resetHistory should clear message history for a chat', async () => {
      const mockRemove = jest.fn((query, options, callback) => callback(null));
      Datastore.mockImplementation(() => ({
        remove: mockRemove,
      }));

      await resetHistory('chat123');

      expect(mockRemove).toHaveBeenCalledWith(
        { chatId: 'chat123', type: { $in: ['user', 'bot'] } },
        { multi: true },
        expect.any(Function)
      );
    });
  });

  describe('System Prompts', () => {
    test('setSystemPrompt should create or update a prompt', async () => {
      const mockUpdate = jest.fn((query, update, options, callback) => callback(null));
      Datastore.mockImplementation(() => ({
        update: mockUpdate,
      }));

      await setSystemPrompt('chat123', 'testPrompt', 'This is a test prompt');

      expect(mockUpdate).toHaveBeenCalledWith(
        { chatId: 'chat123', name: 'testPrompt' },
        { chatId: 'chat123', name: 'testPrompt', text: expect.stringContaining('This is a test prompt') },
        { upsert: true },
        expect.any(Function)
      );
    });

    test('getSystemPrompt should retrieve a specific prompt', async () => {
      const mockPrompt = { name: 'testPrompt', text: 'This is a test prompt' };
      Datastore.mockImplementation(() => ({
        findOne: jest.fn((query, callback) => callback(null, mockPrompt)),
      }));

      const result = await getSystemPrompt('chat123', 'testPrompt');

      expect(result).toEqual(mockPrompt);
    });

    test('listSystemPrompts should return all prompts for a chat', async () => {
      const mockPrompts = [
        { name: 'prompt1', text: 'Prompt 1' },
        { name: 'prompt2', text: 'Prompt 2' },
      ];
      Datastore.mockImplementation(() => ({
        find: jest.fn((query, callback) => callback(null, mockPrompts)),
      }));

      const result = await listSystemPrompts('chat123');

      expect(result).toEqual(mockPrompts);
    });
  });

  describe('Configuration Management', () => {
    test('setConfig should update configuration for a chat', async () => {
      const mockUpdate = jest.fn((query, update, options, callback) => callback(null));
      Datastore.mockImplementation(() => ({
        update: mockUpdate,
      }));

      await setConfig('chat123', 'temperature', 0.7);

      expect(mockUpdate).toHaveBeenCalledWith(
        { chatId: 'chat123' },
        { $set: { temperature: 0.7 } },
        { upsert: true },
        expect.any(Function)
      );
    });

    test('getConfig should return merged configuration', async () => {
      const mockConfig = { temperature: 0.8, topK: 50 };
      Datastore.mockImplementation(() => ({
        findOne: jest.fn((query, callback) => callback(null, mockConfig)),
      }));

      const result = await getConfig('chat123');

      expect(result).toEqual(expect.objectContaining({
        ...mockConfig,
        botName: expect.any(String),
      }));
    });
  });

  describe('Message Handling', () => {
    test('handleTextMessage should process text messages', async () => {
      // Mock das funções necessárias
      const mockGetOrCreateUser = jest.fn(() => Promise.resolve({ name: 'Test User' }));
      const mockGetConfig = jest.fn(() => Promise.resolve({ botName: 'TestBot' }));
      const mockUpdateMessageHistory = jest.fn(() => Promise.resolve());
      const mockGetMessageHistory = jest.fn(() => Promise.resolve(['User: Hello', 'Bot: Hi']));
      const mockGenerateResponseWithText = jest.fn(() => Promise.resolve('Generated response'));
      const mockSendLongMessage = jest.fn(() => Promise.resolve());

      // Substituir as implementações reais pelas mocks
      global.getOrCreateUser = mockGetOrCreateUser;
      global.getConfig = mockGetConfig;
      global.updateMessageHistory = mockUpdateMessageHistory;
      global.getMessageHistory = mockGetMessageHistory;
      global.generateResponseWithText = mockGenerateResponseWithText;
      global.sendLongMessage = mockSendLongMessage;

      const msg = {
        body: 'Test message',
        getChat: jest.fn(() => Promise.resolve({ id: { _serialized: 'chat123' } })),
        author: 'user123',
      };

      await handleTextMessage(msg);

      expect(mockGetOrCreateUser).toHaveBeenCalled();
      expect(mockGetConfig).toHaveBeenCalled();
      expect(mockUpdateMessageHistory).toHaveBeenCalledTimes(2); // Uma vez para a mensagem do usuário, outra para a resposta do bot
      expect(mockGetMessageHistory).toHaveBeenCalled();
      expect(mockGenerateResponseWithText).toHaveBeenCalled();
      expect(mockSendLongMessage).toHaveBeenCalled();
    });
  });

  // Adicione mais testes para handleImageMessage e handleAudioMessage se necessário
});