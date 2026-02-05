const criarGerenciadorMensagens = require('../../../../src/adaptadores/whatsapp/GerenciadorMensagens');
const { Resultado } = require('../../../../src/utilitarios/Ferrovia');

// Mocks das dependências
const mockRegistrador = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

const mockClienteWhatsApp = {
  on: jest.fn(),
  cliente: { info: { wid: { _serialized: 'bot_id' } } }
};

const mockGerenciadorConfig = {
  obterConfig: jest.fn()
};

const mockGerenciadorAI = {};
const mockFilasMidia = {
  setCallbackRespostaUnificado: jest.fn()
};

const mockGerenciadorTransacoes = {
  on: jest.fn(),
  recuperarTransacoesIncompletas: jest.fn()
};

const mockServicoMensagem = {};

describe('GerenciadorMensagens.js - Segurança e Bloqueios', () => {
  let gerenciador;

  beforeEach(() => {
    jest.clearAllMocks();
    gerenciador = criarGerenciadorMensagens({
      registrador: mockRegistrador,
      clienteWhatsApp: mockClienteWhatsApp,
      gerenciadorConfig: mockGerenciadorConfig,
      gerenciadorAI: mockGerenciadorAI,
      filasMidia: mockFilasMidia,
      gerenciadorTransacoes: mockGerenciadorTransacoes,
      servicoMensagem: mockServicoMensagem
    });
  });

  test('deve ignorar mensagens de status@broadcast', async () => {
    const mensagemStatus = {
      id: { _serialized: 'status_123' },
      from: 'status@broadcast',
      body: 'Uma atualização de status',
      timestamp: Date.now()
    };

    // Mock das funções de validação interna que seriam chamadas antes da etapa 4
    // Para simplificar o teste de unidade do gerenciador, vamos focar no processarMensagem
    // que é o ponto de entrada.
    
    const resultado = await gerenciador.processarMensagem(mensagemStatus);
    
    // O processamento deve retornar false (parou no trilho) ou parar antes de chegar na IA
    expect(resultado).toBe(false);
  });
  
  test('deve ignorar mensagens de grupo (ehGrupo: true)', async () => {
     const mensagemGrupo = {
      id: { _serialized: 'group_123' },
      from: '12345@g.us',
      body: 'Oi grupo',
      timestamp: Date.now()
    };

    const resultado = await gerenciador.processarMensagem(mensagemGrupo);
    expect(resultado).toBe(false);
  });
});
