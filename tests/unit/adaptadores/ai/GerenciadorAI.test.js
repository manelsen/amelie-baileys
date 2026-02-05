/**
 * Testes de Fumaça para GerenciadorAI.js
 * 
 * Estes testes servem como "rede de segurança" durante a refatoração.
 * Cobrem apenas os caminhos principais (happy path) das funções públicas.
 * 
 * Padrão: Strangler Fig - testar comportamento antes de modularizar
 */

// Mock das dependências externas ANTES de importar o módulo
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => 'Resposta mockada da IA',
          promptFeedback: null,
          candidates: [{ finishReason: 'STOP' }]
        }
      })
    })
  }))
}));

jest.mock('@google/generative-ai/server', () => ({
  GoogleAIFileManager: jest.fn().mockImplementation(() => ({
    uploadFile: jest.fn().mockResolvedValue({ 
      file: { name: 'file_123', uri: 'uri_123', mimeType: 'video/mp4', state: 'ACTIVE' } 
    }),
    getFile: jest.fn().mockResolvedValue({ 
      name: 'file_123', uri: 'uri_123', mimeType: 'video/mp4', state: 'ACTIVE' 
    }),
    deleteFile: jest.fn().mockResolvedValue({})
  }))
}));

// Mock do Bottleneck para evitar rate limiting real
jest.mock('bottleneck', () => {
  return jest.fn().mockImplementation(() => ({
    schedule: jest.fn((fn) => fn()) // Executa imediatamente
  }));
});

// Mock do NodeCache para evitar problemas de timing
jest.mock('node-cache', () => {
  return jest.fn().mockImplementation(() => {
    const cache = new Map();
    return {
      get: jest.fn((key) => cache.get(key)),
      set: jest.fn((key, value) => cache.set(key, value)),
      has: jest.fn((key) => cache.has(key))
    };
  });
});

const criarAdaptadorAI = require('../../../../src/adaptadores/ai/GerenciadorAI');

describe('GerenciadorAI.js - Testes de Fumaça', () => {
  
  let adaptadorAI;
  const mockRegistrador = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    adaptadorAI = criarAdaptadorAI({
      registrador: mockRegistrador,
      apiKey: 'fake-api-key-for-testing'
    });
  });

  describe('Inicialização', () => {
    
    test('deve lançar erro se registrador não for fornecido', () => {
      expect(() => criarAdaptadorAI({ apiKey: 'key' }))
        .toThrow("Dependências 'registrador' e 'apiKey' são obrigatórias");
    });

    test('deve lançar erro se apiKey não for fornecida', () => {
      expect(() => criarAdaptadorAI({ registrador: mockRegistrador }))
        .toThrow("Dependências 'registrador' e 'apiKey' são obrigatórias");
    });

    test('deve criar adaptador com todas as funções públicas', () => {
      expect(adaptadorAI.processarTexto).toBeDefined();
      expect(adaptadorAI.processarImagem).toBeDefined();
      expect(adaptadorAI.processarAudio).toBeDefined();
      expect(adaptadorAI.processarDocumentoInline).toBeDefined();
      expect(adaptadorAI.processarDocumentoArquivo).toBeDefined();
      expect(adaptadorAI.processarVideo).toBeDefined();
      expect(adaptadorAI.uploadArquivoGoogle).toBeDefined();
      expect(adaptadorAI.deleteArquivoGoogle).toBeDefined();
      expect(adaptadorAI.getArquivoGoogle).toBeDefined();
      expect(adaptadorAI.gerarConteudoDeArquivoUri).toBeDefined();
    });
  });

  describe('processarTexto()', () => {
    
    test('deve processar texto e retornar Resultado.sucesso', async () => {
      const config = { temperature: 0.7 };
      
      const resultado = await adaptadorAI.processarTexto('Olá, como vai?', config);
      
      expect(resultado.sucesso).toBe(true);
      expect(typeof resultado.dados).toBe('string');
      expect(resultado.dados.length).toBeGreaterThan(0);
    });
  });

  describe('processarImagem()', () => {
    
    test('deve processar imagem e retornar Resultado.sucesso', async () => {
      const imagemData = {
        data: 'base64_encoded_image_data',
        mimetype: 'image/jpeg'
      };
      const config = {};
      
      const resultado = await adaptadorAI.processarImagem(imagemData, 'Descreva', config);
      
      expect(resultado.sucesso).toBe(true);
      expect(typeof resultado.dados).toBe('string');
    });
  });

  describe('processarAudio()', () => {
    
    test('deve processar áudio e retornar Resultado.sucesso com prefixo', async () => {
      const audioData = {
        data: 'base64_encoded_audio_data',
        mimetype: 'audio/ogg'
      };
      const config = {};
      
      const resultado = await adaptadorAI.processarAudio(audioData, 'audio_123', config);
      
      expect(resultado.sucesso).toBe(true);
      expect(resultado.dados).toContain('[Transcrição de Áudio]');
    });
  });

  describe('processarDocumentoInline()', () => {
    
    test('deve processar documento inline e retornar Resultado.sucesso', async () => {
      const docData = {
        data: 'base64_encoded_doc_data',
        mimetype: 'application/pdf'
      };
      const config = {};
      
      const resultado = await adaptadorAI.processarDocumentoInline(docData, 'Resuma', config);
      
      expect(resultado.sucesso).toBe(true);
      expect(typeof resultado.dados).toBe('string');
    });
  });

  describe('Funções de Arquivo Google', () => {
    
    test('deleteArquivoGoogle deve retornar sucesso para nome vazio', async () => {
      const resultado = await adaptadorAI.deleteArquivoGoogle(null);
      
      expect(resultado.sucesso).toBe(true);
    });

    test('deleteArquivoGoogle deve tentar deletar arquivo existente', async () => {
      const resultado = await adaptadorAI.deleteArquivoGoogle('file_to_delete');
      
      expect(resultado.sucesso).toBe(true);
    });

    test('getArquivoGoogle deve retornar dados do arquivo', async () => {
      const resultado = await adaptadorAI.getArquivoGoogle('file_123');
      
      expect(resultado.sucesso).toBe(true);
      expect(resultado.dados.name).toBe('file_123');
    });

    test('uploadArquivoGoogle deve fazer upload de arquivo', async () => {
      const resultado = await adaptadorAI.uploadArquivoGoogle(
        '/tmp/test.mp4',
        { mimeType: 'video/mp4', displayName: 'Test' }
      );
      
      expect(resultado.sucesso).toBe(true);
      expect(resultado.dados.file.name).toBe('file_123');
    });
  });

  describe('gerarConteudoDeArquivoUri()', () => {
    
    test('deve gerar conteúdo a partir de URI', async () => {
      const config = { tipoMidia: 'video' };
      
      const resultado = await adaptadorAI.gerarConteudoDeArquivoUri(
        'uri_123',
        'video/mp4',
        'Descreva este vídeo',
        config
      );
      
      expect(resultado.sucesso).toBe(true);
      expect(typeof resultado.dados).toBe('string');
    });
  });
});
