/**
 * ProcessadorImagem - Processamento específico para mensagens com imagens
 */
const { inicializarProcessamento, gerenciarCicloVidaTransacao } = require('../util/ProcessamentoHelper');

const criarProcessadorImagem = (dependencias) => {
  const {
    registrador,
    filasMidia
  } = dependencias;

  /**
   * Processa uma mensagem de imagem
   * @param {Object} dados - Contém mensagem, chatId e dadosAnexo
   */
  const processarMensagemImagem = async (dados) => {
    const { mensagem, chatId, dadosAnexo } = dados;

    // 1. Inicialização e Verificação de Configuração
    const resultadoInit = await inicializarProcessamento(dependencias, mensagem, chatId, 'mediaImage');
    if (!resultadoInit.sucesso) return resultadoInit;

    const { chat, config, remetente } = resultadoInit.dados;

    // 2. Execução do Ciclo de Vida da Transação
    return gerenciarCicloVidaTransacao(dependencias, mensagem, chat, async (transacao) => {
      registrador.info(`[Image] Enfileirando ${transacao.id}`);

      // Adicionar à fila de processamento de imagem
      await filasMidia.adicionarImagem({
        imageData: dadosAnexo,
        chatId,
        messageId: mensagem.id._serialized,
        messageKey: mensagem.id, // ADICIONADO: Objeto chave completo para reply
        mimeType: dadosAnexo.mimetype,
        userPrompt: (mensagem.body && mensagem.body.trim() !== '') ? mensagem.body.trim() : "",
        senderNumber: mensagem.from,
        transacaoId: transacao.id,
        remetenteName: remetente.name,
        modoDescricao: config.modoDescricao || 'curto',
        dadosOrigem: {
          id: chat.id._serialized,
          nome: chat.isGroup ? chat.name : remetente.name,
          tipo: chat.isGroup ? 'grupo' : 'usuario',
          remetenteId: mensagem.author || mensagem.from,
          remetenteNome: remetente.name
        }
      });

      return { sucesso: true, dados: { transacao } };
    });
  };

  return { processarMensagemImagem };
};

module.exports = criarProcessadorImagem;
