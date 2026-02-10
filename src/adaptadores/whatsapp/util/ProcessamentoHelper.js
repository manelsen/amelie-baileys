const _ = require('lodash/fp');
const { Resultado } = require('../../../utilitarios/Ferrovia');
const { obterOuCriarUsuario } = require('../dominio/OperacoesChat');

/**
 * Encapsula a lógica inicial comum de obtenção de chat, config e remetente.
 * @param {object} dependencias - Dependências como gerenciadorConfig, clienteWhatsApp, registrador.
 * @param {object} mensagem - Objeto da mensagem do WhatsApp.
 * @param {string} chatId - ID do chat.
 * @param {string} nomeFuncionalidade - Nome da chave de configuração a ser verificada (ex: 'mediaAudio', 'mediaDoc').
 * @returns {Promise<Resultado>} Resultado.sucesso({ chat, config, remetente }) ou Resultado.falha(erro).
 */
const inicializarProcessamento = async (dependencias, mensagemMapeada, chatId, nomeFuncionalidade) => {
  const { gerenciadorConfig, clienteWhatsApp, registrador } = dependencias;
  try {
    const config = await gerenciadorConfig.obterConfig(chatId);

    if (!config || !config[nomeFuncionalidade]) {
      const erroMsg = `Processamento de ${nomeFuncionalidade} desabilitado para este chat.`;
      // registrador.info(`[InitProcess] ${erroMsg} (${chatId})`); // LOG REMOVIDO PARA LIMPEZA
      return Resultado.falha(new Error(erroMsg));
    }

    const resultadoRemetente = await obterOuCriarUsuario(gerenciadorConfig, clienteWhatsApp, registrador)(
      mensagemMapeada.author || mensagemMapeada.from,
      {
          id: { _serialized: chatId || 'unknown' },
          isGroup: (chatId && typeof chatId === 'string') ? chatId.endsWith('@g.us') : false
      }, // Mock de chat object para OperacoesChat
      mensagemMapeada // Passar a mensagem para obter o pushName
    );

    if (!resultadoRemetente.sucesso) {
      registrador.error(`[InitProcess] Falha ao obter remetente: ${resultadoRemetente.erro?.message} (${chatId})`);
      return Resultado.falha(resultadoRemetente.erro || new Error("Falha ao obter remetente"));
    }

    return Resultado.sucesso({ 
        config, 
        remetente: resultadoRemetente.dados,
        chat: { id: { _serialized: chatId || 'unknown' }, isGroup: (chatId && typeof chatId === 'string') ? chatId.endsWith('@g.us') : false }
    });

  } catch (erro) {
    registrador.error(`[InitProcess] Erro inesperado na inicialização: ${erro.message}`, erro);
    return Resultado.falha(erro);
  }
};

/**
 * Gerencia o ciclo de vida da transação, executa a lógica core e trata erros.
 * @param {object} dependencias - Dependências como gerenciadorTransacoes, registrador, servicoMensagem.
 * @param {object} mensagem - Objeto da mensagem do WhatsApp.
 * @param {object} chat - Objeto do chat do WhatsApp.
 * @param {Function} funcaoCore - Função async (transacao) => Resultado que contém a lógica específica.
 * @returns {Promise<Resultado>} Resultado da funcaoCore ou Resultado.falha.
 */
const gerenciarCicloVidaTransacao = async (dependencias, mensagemMapeada, chatId, funcaoCore) => {
  const { gerenciadorTransacoes, registrador, servicoMensagem } = dependencias;
  let transacaoId = null;
  let transacao = null;

  try {
    // 1. Criar Transação
    const resultadoTransacao = await gerenciadorTransacoes.criarTransacao(
      mensagemMapeada, 
      { 
          id: { _serialized: chatId || 'unknown' }, 
          isGroup: (chatId && typeof chatId === 'string') ? chatId.endsWith('@g.us') : false 
      }
    );
    if (!resultadoTransacao || !resultadoTransacao.sucesso) {
      const erroMsg = `Falha ao criar transação: ${resultadoTransacao?.erro?.message || 'Resultado inválido'}`;
      registrador.error(`[TxLifecycle] ${erroMsg}`);
      try {
        // Tenta notificar o usuário sobre a falha inicial
        await servicoMensagem.enviarResposta(mensagemMapeada, 'Desculpe, ocorreu um erro interno ao iniciar o processamento.');
      } catch (e) { registrador.error(`[TxLifecycle] Falha ao enviar erro sobre criarTransacao: ${e.message}`); }
      return Resultado.falha(resultadoTransacao?.erro || new Error("Falha ao criar transação"));
    }

    transacao = resultadoTransacao.dados;
    if (!transacao || !transacao.id) {
        registrador.error("[TxLifecycle] *** ERRO CRÍTICO: Objeto transação ou ID está faltando após criação! ***");
         try {
             await servicoMensagem.enviarResposta(mensagemMapeada, 'Desculpe, ocorreu um erro crítico ao registrar o processamento (ID faltando).');
         } catch(e) { registrador.error(`[TxLifecycle] Falha ao enviar erro sobre ID faltando: ${e.message}`)}
        return Resultado.falha(new Error("ID da Transação faltando após criação"));
    }
    transacaoId = transacao.id; // ID validado
    registrador.debug(`[Trnsç] Transação ${transacaoId} criada.`);

    // 2. Marcar como Processando
    await gerenciadorTransacoes.marcarComoProcessando(transacaoId);

    // 3. Executar Lógica Core
    registrador.debug(`[Trnsç] Executando transação ${transacaoId}`);
    const resultadoCore = await funcaoCore(transacao); // Executa a função específica passada

    if (resultadoCore.sucesso) {
      registrador.debug(`[Trnsç] Transação ${transacaoId} concluída.`);
    } else {
      registrador.warn(`[Trnsç] Transação ${transacaoId} falhou.`);
    }

    // 4. Retornar resultado da lógica core (sucesso ou falha controlada por ela)
    return resultadoCore;

  } catch (erro) {
    // 5. Tratamento de Erro Geral (erros lançados pela funcaoCore ou outras partes)
    const erroMsg = erro.message || "Erro desconhecido";
    registrador.error(`[TxLifecycle] ERRO GERAL durante ciclo da transação ${transacaoId || '(sem ID)'}: ${erroMsg}`, erro);

    // Registrar falha na transação se ID existe
    if (transacaoId) {
      try {
        await gerenciadorTransacoes.registrarFalhaEntrega(transacaoId, `Erro no processamento: ${erroMsg}`);
      } catch (e) { registrador.error(`[TxLifecycle] Falha ao registrar erro na transação ${transacaoId}: ${e.message}`); }
    }

    // Enviar feedback genérico de erro, exceto se já foi tratado (ex: segurança) ou se era esperado (ex: desabilitado)
    // A lógica de não enviar para erros específicos (como 'desabilitada') deve estar na funcaoCore ou na inicialização.
    // Este catch lida com erros *inesperados*.
    const msgErroLower = erroMsg.toLowerCase();
     if (!msgErroLower.includes('segurança')) { 
        try {
           let textoResposta = 'Desculpe, ocorreu um erro inesperado durante o processamento.';
           
           // Tratamento amigável para limite de API (429)
           if (msgErroLower.includes('429') || msgErroLower.includes('resource exhausted')) {
             textoResposta = '⚠️ O sistema de IA está sobrecarregado no momento. Por favor, aguarde alguns minutos e tente novamente.';
           }

           await servicoMensagem.enviarResposta(
              mensagemMapeada,
              textoResposta
           );
        } catch (erroEnvio) {
           registrador.error(`[TxLifecycle] Falha ao enviar mensagem de erro geral para ${transacaoId || '(sem ID)'}: ${erroEnvio.message}`);
        }
     }
    return Resultado.falha(erro);
  }
};

module.exports = {
  inicializarProcessamento,
  gerenciarCicloVidaTransacao,
};