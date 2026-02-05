const criarProcessadorTexto = require('../../../../../src/adaptadores/whatsapp/processadores/ProcessadorTexto');
const { Resultado } = require('../../../../../src/utilitarios/Ferrovia');

describe('ProcessadorTexto.js', () => {
  let dependencias;
  let processador;

  beforeEach(() => {
    dependencias = {
      registrador: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      adaptadorIA: { processarTexto: jest.fn() },
      gerenciadorConfig: { obterConfig: jest.fn() },
      gerenciadorTransacoes: {
        criarTransacao: jest.fn(),
        adicionarDadosRecuperacao: jest.fn(),
        marcarComoProcessando: jest.fn(),
        adicionarRespostaTransacao: jest.fn(),
        registrarFalhaEntrega: jest.fn()
      },
      servicoMensagem: { enviarResposta: jest.fn() },
      clienteWhatsApp: { 
        obterHistoricoMensagens: jest.fn().mockResolvedValue([]),
        // Mock simplificado do que o OperacoesChat espera
        cliente: { info: { wid: { _serialized: 'bot_id' } } }
      }
    };

    // Mock do OperacoesChat.obterOuCriarUsuario que é usado internamente
    // Como ele é importado, precisaremos mockar o módulo ou garantir que as dependências passadas supram ele.
    // Para simplificar este teste de unidade, vamos focar no fluxo do processador.
    processador = criarProcessadorTexto(dependencias);
  });

  test('deve processar mensagem de texto com sucesso', async () => {
    const dados = {
      mensagem: { from: 'user1', body: 'Olá', author: 'user1', timestamp: 123 },
      chat: { name: 'Chat Teste' },
      chatId: 'user1@s.whatsapp.net'
    };

    // Configurar mocks para sucesso
    dependencias.gerenciadorTransacoes.criarTransacao.mockResolvedValue(Resultado.sucesso({ id: 'trans_1' }));
    dependencias.gerenciadorConfig.obterConfig.mockResolvedValue({ temperature: 0.7 });
    dependencias.adaptadorIA.processarTexto.mockResolvedValue(Resultado.sucesso('Olá, como vai?'));
    dependencias.servicoMensagem.enviarResposta.mockResolvedValue(Resultado.sucesso(true));

    const resultado = await processador.processarMensagemTexto(dados);

    expect(resultado.sucesso).toBe(true);
    expect(dependencias.adaptadorIA.processarTexto).toHaveBeenCalled();
    expect(dependencias.servicoMensagem.enviarResposta).toHaveBeenCalledWith(expect.anything(), 'Olá, como vai?', 'trans_1');
  });

  test('deve tratar erro na IA e registrar falha na transação', async () => {
    const dados = {
      mensagem: { from: 'user1', body: 'Erro aqui', author: 'user1' },
      chat: {},
      chatId: 'user1'
    };

    dependencias.gerenciadorTransacoes.criarTransacao.mockResolvedValue(Resultado.sucesso({ id: 'trans_err' }));
    dependencias.adaptadorIA.processarTexto.mockResolvedValue(Resultado.falha('Erro de API'));

    const resultado = await processador.processarMensagemTexto(dados);

    expect(resultado.sucesso).toBe(false);
    expect(dependencias.gerenciadorTransacoes.registrarFalhaEntrega).toHaveBeenCalled();
    expect(dependencias.servicoMensagem.enviarResposta).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('erro'));
  });
});
