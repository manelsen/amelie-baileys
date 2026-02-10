/**
 * ProcessadorDocumento - Processamento específico para documentos (PDF, TXT, etc.)
 */
const { inicializarProcessamento, gerenciarCicloVidaTransacao } = require('../util/ProcessamentoHelper');

const criarProcessadorDocumento = (dependencias) => {
  const {
    registrador,
    filasMidia
  } = dependencias;

  /**
   * Processa uma mensagem de documento
   * @param {Object} dados - Contém mensagem, chatId e dadosAnexo
   */
  const processarMensagemDocumento = async (dados) => {
    const { mensagem, chatId, dadosAnexo } = dados;

    // 1. Inicialização e Verificação de Configuração
    // CORRIGIDO: Chave de configuração padronizada para 'mediaDocumento' (mesma usada no ComandoDoc)
    const resultadoInit = await inicializarProcessamento(dependencias, mensagem, chatId, 'mediaDocumento');
    if (!resultadoInit.sucesso) return resultadoInit;

    const { chat, config, remetente } = resultadoInit.dados;

    // 2. Execução do Ciclo de Vida da Transação
    return gerenciarCicloVidaTransacao(dependencias, mensagem, chat, async (transacao) => {
      registrador.info(`[Doc] Enfileirando ${transacao.id}`);

      // Adicionar à fila de processamento de documentos
      await filasMidia.adicionarDocumento({
        docData: dadosAnexo,
        chatId,
        messageId: mensagem.id._serialized,
        mimeType: dadosAnexo.mimetype,
        userPrompt: mensagem.body || "",
        senderNumber: mensagem.from,
        transacaoId: transacao.id,
        remetenteName: remetente.name,
        filename: dadosAnexo.filename || 'documento'
      });

      return { sucesso: true, dados: { transacao } };
    });
  };

  return { processarMensagemDocumento };
};

module.exports = criarProcessadorDocumento;
