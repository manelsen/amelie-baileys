const criarProcessadorImagem = require('../../../../../src/adaptadores/whatsapp/processadores/ProcessadorImagem');
const { Resultado } = require('../../../../../src/utilitarios/Ferrovia');

// Mock do ProcessamentoHelper que é importado internamente
jest.mock('../../../../../src/adaptadores/whatsapp/util/ProcessamentoHelper', () => ({
  inicializarProcessamento: jest.fn(),
  gerenciarCicloVidaTransacao: jest.fn()
}));

const { inicializarProcessamento, gerenciarCicloVidaTransacao } = require('../../../../../src/adaptadores/whatsapp/util/ProcessamentoHelper');

describe('ProcessadorImagem.js', () => {
  let dependencias;
  let processador;

  beforeEach(() => {
    jest.clearAllMocks();
    dependencias = {
      registrador: { info: jest.fn(), error: jest.fn() },
      filasMidia: { adicionarImagem: jest.fn() }
    };
    processador = criarProcessadorImagem(dependencias);
  });

  test('deve adicionar imagem à fila com sucesso', async () => {
    const dados = {
      mensagem: { id: { _serialized: 'msg_img' }, from: 'user1', body: 'Descreva isso' },
      chatId: 'user1',
      dadosAnexo: { mimetype: 'image/jpeg' }
    };

    // Mock do helper de inicialização
    inicializarProcessamento.mockResolvedValue(Resultado.sucesso({
      chat: { id: { _serialized: 'user1' }, isGroup: false },
      config: { modoDescricao: 'longo' },
      remetente: { name: 'Manel' }
    }));

    // Mock do ciclo de vida (executa o callback que passamos)
    gerenciarCicloVidaTransacao.mockImplementation(async (deps, msg, chat, callback) => {
      return await callback({ id: 'trans_img_1' });
    });

    const resultado = await processador.processarMensagemImagem(dados);

    expect(resultado.sucesso).toBe(true);
    expect(dependencias.filasMidia.adicionarImagem).toHaveBeenCalledWith(expect.objectContaining({
      transacaoId: 'trans_img_1',
      userPrompt: 'Descreva isso'
    }));
  });
});
