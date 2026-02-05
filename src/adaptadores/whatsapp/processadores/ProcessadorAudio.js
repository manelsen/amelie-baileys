/**
 * ProcessadorAudio - Processamento específico para mensagens de voz e áudio
 */
const { inicializarProcessamento, gerenciarCicloVidaTransacao } = require('../util/ProcessamentoHelper');

const criarProcessadorAudio = (dependencias) => {
  const {
    registrador,
    filasMidia
  } = dependencias;

  /**
   * Processa uma mensagem de áudio ou PTT (Push-To-Talk)
   * @param {Object} dados - Contém mensagem, chatId e dadosAnexo
   */
  const processarMensagemAudio = async (dados) => {
    const { mensagem, chatId, dadosAnexo } = dados;

    // 1. Inicialização e Verificação de Configuração
    const resultadoInit = await inicializarProcessamento(dependencias, mensagem, chatId, 'mediaAudio');
    if (!resultadoInit.sucesso) return resultadoInit;

    const { chat, config, remetente } = resultadoInit.dados;

    // 2. Execução do Ciclo de Vida da Transação
    return gerenciarCicloVidaTransacao(dependencias, mensagem, chat, async (transacao) => {
      registrador.info(`[Audio] Adicionando áudio à fila (Transação: ${transacao.id})`);

      // Adicionar à fila de processamento de áudio
      await filasMidia.adicionarAudio({
        audioData: dadosAnexo,
        chatId,
        messageId: mensagem.id._serialized,
        mimeType: dadosAnexo.mimetype,
        userPrompt: mensagem.body || "",
        senderNumber: mensagem.from,
        transacaoId: transacao.id,
        remetenteName: remetente.name,
        modoDescricao: config.modoDescricao || 'curto'
      });

      return { sucesso: true, dados: { transacao } };
    });
  };

  return { processarMensagemAudio };
};

module.exports = criarProcessadorAudio;
