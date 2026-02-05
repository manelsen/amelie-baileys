/**
 * Testes unitários para ProcessadoresMidia (Áudio, Vídeo, Documento)
 * 
 * Valida que cada processador de mídia:
 * - Inicializa corretamente
 * - Adiciona jobs à fila apropriada
 * - Passa os dados corretos para a fila
 */

const criarProcessadorAudio = require('../../../../../src/adaptadores/whatsapp/processadores/ProcessadorAudio');
const criarProcessadorVideo = require('../../../../../src/adaptadores/whatsapp/processadores/ProcessadorVideo');
const criarProcessadorDocumento = require('../../../../../src/adaptadores/whatsapp/processadores/ProcessadorDocumento');
const { Resultado } = require('../../../../../src/utilitarios/Ferrovia');

// Mock do ProcessamentoHelper usado por todos os processadores
jest.mock('../../../../../src/adaptadores/whatsapp/util/ProcessamentoHelper', () => ({
  inicializarProcessamento: jest.fn(),
  gerenciarCicloVidaTransacao: jest.fn()
}));

const { 
  inicializarProcessamento, 
  gerenciarCicloVidaTransacao 
} = require('../../../../../src/adaptadores/whatsapp/util/ProcessamentoHelper');

describe('Processadores de Mídia', () => {
  
  // Dependências compartilhadas
  let dependencias;

  // Configuração padrão de sucesso para os helpers
  const configurarMocksParaSucesso = () => {
    inicializarProcessamento.mockResolvedValue(Resultado.sucesso({
      chat: { id: { _serialized: 'user1' }, isGroup: false },
      config: { modoDescricao: 'curto' },
      remetente: { name: 'Usuário Teste' }
    }));

    gerenciarCicloVidaTransacao.mockImplementation(async (deps, msg, chat, callback) => {
      return await callback({ id: 'trans_test_123' });
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    dependencias = {
      registrador: { 
        info: jest.fn(), 
        error: jest.fn(), 
        warn: jest.fn() 
      },
      filasMidia: { 
        adicionarAudio: jest.fn().mockResolvedValue({ id: 'job_1' }),
        adicionarVideo: jest.fn().mockResolvedValue({ id: 'job_2' }),
        adicionarDocumento: jest.fn().mockResolvedValue({ id: 'job_3' })
      }
    };

    configurarMocksParaSucesso();
  });

  describe('ProcessadorAudio', () => {
    
    test('deve adicionar áudio à fila com sucesso', async () => {
      const processador = criarProcessadorAudio(dependencias);
      const dados = { 
        mensagem: { id: { _serialized: 'audio_001' }, from: 'user1@s.whatsapp.net' }, 
        chatId: 'user1@s.whatsapp.net', 
        dadosAnexo: { mimetype: 'audio/ogg; codecs=opus' } 
      };
      
      const resultado = await processador.processarMensagemAudio(dados);
      
      expect(resultado.sucesso).toBe(true);
      expect(dependencias.filasMidia.adicionarAudio).toHaveBeenCalledTimes(1);
    });

    test('deve passar transacaoId corretamente para a fila', async () => {
      const processador = criarProcessadorAudio(dependencias);
      const dados = { 
        mensagem: { id: { _serialized: 'audio_002' }, from: 'user1' }, 
        chatId: 'user1', 
        dadosAnexo: { mimetype: 'audio/mp3' } 
      };
      
      await processador.processarMensagemAudio(dados);
      
      expect(dependencias.filasMidia.adicionarAudio).toHaveBeenCalledWith(
        expect.objectContaining({
          transacaoId: 'trans_test_123'
        })
      );
    });

    test('deve falhar se inicialização falhar', async () => {
      inicializarProcessamento.mockResolvedValue(
        Resultado.falha(new Error('Áudio desabilitado'))
      );
      
      const processador = criarProcessadorAudio(dependencias);
      const dados = { mensagem: {}, chatId: 'user1', dadosAnexo: {} };
      
      const resultado = await processador.processarMensagemAudio(dados);
      
      expect(resultado.sucesso).toBe(false);
      expect(dependencias.filasMidia.adicionarAudio).not.toHaveBeenCalled();
    });
  });

  describe('ProcessadorVideo', () => {
    
    test('deve adicionar vídeo à fila com sucesso', async () => {
      const processador = criarProcessadorVideo(dependencias);
      const dados = { 
        mensagem: { id: { _serialized: 'video_001' }, from: 'user1' }, 
        chatId: 'user1', 
        dadosAnexo: { 
          mimetype: 'video/mp4', 
          data: 'dados_video_base64_pequeno' // Dados pequenos para passar validação de tamanho
        } 
      };
      
      const resultado = await processador.processarMensagemVideo(dados);
      
      expect(resultado.sucesso).toBe(true);
      expect(dependencias.filasMidia.adicionarVideo).toHaveBeenCalledTimes(1);
    });

    test('deve incluir mimeType nos dados da fila', async () => {
      const processador = criarProcessadorVideo(dependencias);
      const dados = { 
        mensagem: { id: { _serialized: 'video_002' }, from: 'user1' }, 
        chatId: 'user1', 
        dadosAnexo: { mimetype: 'video/webm', data: 'dados' } 
      };
      
      await processador.processarMensagemVideo(dados);
      
      expect(dependencias.filasMidia.adicionarVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: 'video/webm'
        })
      );
    });
  });

  describe('ProcessadorDocumento', () => {
    
    test('deve adicionar documento PDF à fila', async () => {
      const processador = criarProcessadorDocumento(dependencias);
      const dados = { 
        mensagem: { id: { _serialized: 'doc_001' }, from: 'user1' }, 
        chatId: 'user1', 
        dadosAnexo: { mimetype: 'application/pdf' } 
      };
      
      const resultado = await processador.processarMensagemDocumento(dados);
      
      expect(resultado.sucesso).toBe(true);
      expect(dependencias.filasMidia.adicionarDocumento).toHaveBeenCalled();
    });

    test('deve adicionar documento Word à fila', async () => {
      const processador = criarProcessadorDocumento(dependencias);
      const dados = { 
        mensagem: { id: { _serialized: 'doc_002' }, from: 'user1' }, 
        chatId: 'user1', 
        dadosAnexo: { mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } 
      };
      
      const resultado = await processador.processarMensagemDocumento(dados);
      
      expect(resultado.sucesso).toBe(true);
    });

    test('deve incluir nome do remetente nos dados da fila', async () => {
      const processador = criarProcessadorDocumento(dependencias);
      const dados = { 
        mensagem: { id: { _serialized: 'doc_003' }, from: 'user1' }, 
        chatId: 'user1', 
        dadosAnexo: { mimetype: 'text/plain' } 
      };
      
      await processador.processarMensagemDocumento(dados);
      
      expect(dependencias.filasMidia.adicionarDocumento).toHaveBeenCalledWith(
        expect.objectContaining({
          remetenteName: 'Usuário Teste'
        })
      );
    });
  });

  describe('Comportamento Comum', () => {
    
    test('todos os processadores devem chamar inicializarProcessamento', async () => {
      const processadorAudio = criarProcessadorAudio(dependencias);
      const processadorVideo = criarProcessadorVideo(dependencias);
      const processadorDoc = criarProcessadorDocumento(dependencias);
      
      const dadosBase = { 
        mensagem: { id: { _serialized: 'test' }, from: 'user1' }, 
        chatId: 'user1', 
        dadosAnexo: { mimetype: 'audio/mp3', data: 'x' } 
      };
      
      await processadorAudio.processarMensagemAudio(dadosBase);
      await processadorVideo.processarMensagemVideo(dadosBase);
      await processadorDoc.processarMensagemDocumento(dadosBase);
      
      expect(inicializarProcessamento).toHaveBeenCalledTimes(3);
    });

    test('todos os processadores devem usar gerenciarCicloVidaTransacao', async () => {
      const processadorAudio = criarProcessadorAudio(dependencias);
      const processadorVideo = criarProcessadorVideo(dependencias);
      const processadorDoc = criarProcessadorDocumento(dependencias);
      
      const dadosBase = { 
        mensagem: { id: { _serialized: 'test' }, from: 'user1' }, 
        chatId: 'user1', 
        dadosAnexo: { mimetype: 'audio/mp3', data: 'x' } 
      };
      
      await processadorAudio.processarMensagemAudio(dadosBase);
      await processadorVideo.processarMensagemVideo(dadosBase);
      await processadorDoc.processarMensagemDocumento(dadosBase);
      
      expect(gerenciarCicloVidaTransacao).toHaveBeenCalledTimes(3);
    });
  });
});
