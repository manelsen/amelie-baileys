/**
 * Testes unitários para Validadores.js
 * 
 * Valida as funções de validação de mensagens do WhatsApp:
 * - validarMensagem: deduplicação e validação básica
 * - verificarMensagemSistema: filtragem de mensagens do sistema
 * - verificarTipoMensagem: classificação de tipo (comando, mídia, texto)
 */

const { 
  validarMensagem, 
  verificarMensagemSistema, 
  verificarTipoMensagem 
} = require('../../../../../src/adaptadores/whatsapp/dominio/Validadores');

describe('Validadores.js', () => {
  
  // Mock do registrador usado em todas as funções
  const mockRegistrador = { 
    info: jest.fn(), 
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validarMensagem()', () => {
    
    test('deve validar uma mensagem nova com sucesso', () => {
      const cache = new Map();
      const mensagem = { id: { _serialized: 'msg_nova_001' } };
      
      const resultado = validarMensagem(mockRegistrador, cache, mensagem);
      
      expect(resultado.sucesso).toBe(true);
      expect(resultado.dados.mensagem).toBe(mensagem);
      expect(resultado.dados.mensagemId).toBe('msg_nova_001');
    });

    test('deve adicionar mensagem ao cache após validação', () => {
      const cache = new Map();
      const mensagem = { id: { _serialized: 'msg_cache_001' } };
      
      validarMensagem(mockRegistrador, cache, mensagem);
      
      expect(cache.has('msg_cache_001')).toBe(true);
      expect(typeof cache.get('msg_cache_001')).toBe('number'); // timestamp
    });

    test('deve falhar se a mensagem for duplicada', () => {
      const cache = new Map();
      cache.set('msg_duplicada', Date.now());
      const mensagem = { id: { _serialized: 'msg_duplicada' } };
      
      const resultado = validarMensagem(mockRegistrador, cache, mensagem);
      
      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro.message).toBe('Mensagem duplicada');
    });

    test('deve falhar se a mensagem for null', () => {
      const cache = new Map();
      
      const resultado = validarMensagem(mockRegistrador, cache, null);
      
      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro.message).toBe('Mensagem inválida');
    });

    test('deve falhar se a mensagem for undefined', () => {
      const cache = new Map();
      
      const resultado = validarMensagem(mockRegistrador, cache, undefined);
      
      expect(resultado.sucesso).toBe(false);
    });

    test('deve falhar se a mensagem não tiver id', () => {
      const cache = new Map();
      const mensagemSemId = { from: 'user@s.whatsapp.net' };
      
      const resultado = validarMensagem(mockRegistrador, cache, mensagemSemId);
      
      expect(resultado.sucesso).toBe(false);
    });
  });

  describe('verificarMensagemSistema()', () => {
    
    describe('Tipos de notificação', () => {
      const tiposNotificacao = [
        'notification',
        'e2e_notification',
        'notification_template',
        'call_log'
      ];

      tiposNotificacao.forEach(tipo => {
        test(`deve identificar tipo '${tipo}' como sistema`, () => {
          const dados = { 
            mensagem: { type: tipo, body: '', hasMedia: false },
            mensagemId: 'test_001'
          };
          
          const resultado = verificarMensagemSistema(mockRegistrador, dados);
          
          expect(resultado.sucesso).toBe(false);
          expect(resultado.erro.message).toBe('Mensagem de sistema');
        });
      });
    });

    test('deve identificar mensagens vazias como sistema', () => {
      const dados = { 
        mensagem: { type: 'chat', body: '', hasMedia: false },
        mensagemId: 'vazia_001'
      };
      
      const resultado = verificarMensagemSistema(mockRegistrador, dados);
      
      expect(resultado.sucesso).toBe(false);
    });

    test('deve permitir mensagens de texto normais', () => {
      const dados = { 
        mensagem: { type: 'chat', body: 'Olá, tudo bem?', hasMedia: false },
        mensagemId: 'normal_001'
      };
      
      const resultado = verificarMensagemSistema(mockRegistrador, dados);
      
      expect(resultado.sucesso).toBe(true);
      expect(resultado.dados).toBe(dados);
    });

    test('deve permitir mensagens com mídia mesmo sem texto', () => {
      const dados = { 
        mensagem: { type: 'image', body: '', hasMedia: true },
        mensagemId: 'midia_001'
      };
      
      const resultado = verificarMensagemSistema(mockRegistrador, dados);
      
      expect(resultado.sucesso).toBe(true);
    });

    test('deve identificar mensagens de status como sistema', () => {
      const dados = {
        mensagem: { 
          type: 'chat', 
          body: '', 
          hasMedia: false,
          _data: { isStatusV3: true }
        },
        mensagemId: 'status_001'
      };
      
      const resultado = verificarMensagemSistema(mockRegistrador, dados);
      
      expect(resultado.sucesso).toBe(false);
    });
  });

  describe('verificarTipoMensagem()', () => {
    
    // Mock do registro de comandos
    const mockRegistroComandos = {
      listarComandos: () => [
        { nome: 'ajuda' }, 
        { nome: 'config' },
        { nome: 'reset' },
        { nome: 'cego' }
      ]
    };

    describe('Detecção de Comandos', () => {
      
      test('deve identificar comando com ponto', () => {
        const dados = { mensagem: { body: '.ajuda', hasMedia: false } };
        
        const resultado = verificarTipoMensagem(mockRegistrador, mockRegistroComandos, dados);
        
        expect(resultado.sucesso).toBe(true);
        expect(resultado.dados.tipo).toBe('comando');
        expect(resultado.dados.comandoNormalizado).toBe('ajuda');
      });

      test('deve normalizar acentos em comandos', () => {
        const dados = { mensagem: { body: '.ajúdá', hasMedia: false } };
        
        const resultado = verificarTipoMensagem(mockRegistrador, mockRegistroComandos, dados);
        
        expect(resultado.dados.tipo).toBe('comando');
        expect(resultado.dados.comandoNormalizado).toBe('ajuda');
      });

      test('deve normalizar maiúsculas em comandos', () => {
        const dados = { mensagem: { body: '.AJUDA', hasMedia: false } };
        
        const resultado = verificarTipoMensagem(mockRegistrador, mockRegistroComandos, dados);
        
        expect(resultado.dados.tipo).toBe('comando');
        expect(resultado.dados.comandoNormalizado).toBe('ajuda');
      });

      test('deve identificar comando com espaços extras', () => {
        const dados = { mensagem: { body: '  .config  ', hasMedia: false } };
        
        const resultado = verificarTipoMensagem(mockRegistrador, mockRegistroComandos, dados);
        
        expect(resultado.dados.tipo).toBe('comando');
      });
    });

    describe('Detecção de Mídia', () => {
      
      test('deve identificar mídia', () => {
        const dados = { mensagem: { body: 'olha isso', hasMedia: true } };
        
        const resultado = verificarTipoMensagem(mockRegistrador, mockRegistroComandos, dados);
        
        expect(resultado.dados.tipo).toBe('midia');
      });

      test('deve identificar mídia sem texto', () => {
        const dados = { mensagem: { body: '', hasMedia: true } };
        
        const resultado = verificarTipoMensagem(mockRegistrador, mockRegistroComandos, dados);
        
        expect(resultado.dados.tipo).toBe('midia');
      });
    });

    describe('Detecção de Texto', () => {
      
      test('deve identificar texto simples', () => {
        const dados = { mensagem: { body: 'olá mundo', hasMedia: false } };
        
        const resultado = verificarTipoMensagem(mockRegistrador, mockRegistroComandos, dados);
        
        expect(resultado.dados.tipo).toBe('texto');
        expect(resultado.dados.comandoNormalizado).toBeNull();
      });

      test('deve identificar texto que parece comando mas não está registrado', () => {
        const dados = { mensagem: { body: '.comandoinexistente', hasMedia: false } };
        
        const resultado = verificarTipoMensagem(mockRegistrador, mockRegistroComandos, dados);
        
        expect(resultado.dados.tipo).toBe('texto');
      });
    });
  });
});
