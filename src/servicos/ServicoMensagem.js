/**
 * ServicoMensagem - Orquestrador central de mensagens
 * 
 * Refatorado para delegar responsabilidades para submódulos:
 * - ServicoSnapshot: Reconstrução de contexto
 * - EstrategiasEnvio: Lógica de despacho (Baileys)
 * 
 * @author Manel
 * @version 3.0.1 (Refatorado + Correção Dependência Notificações)
 */

const { Resultado } = require('../utilitarios/Ferrovia');
const ServicoSnapshot = require('./mensagens/ServicoSnapshot');
const EstrategiasEnvio = require('./mensagens/EstrategiasEnvio');

/**
 * Valida e sanitiza o texto de resposta
 */
const obterRespostaSegura = (texto) => {
  if (!texto || typeof texto !== 'string') {
    return Resultado.falha(new Error("Texto de resposta nulo ou inválido"));
  }
  if (texto.trim() === '') {
    return Resultado.falha(new Error("Texto de resposta vazio"));
  }
  return Resultado.sucesso(texto);
};

/**
 * Atualiza o status da transação (Log de auditoria)
 */
const atualizarStatusTransacao = async (gerenciadorTransacoes, transacaoId, sucesso, erro, registrador) => {
  if (!gerenciadorTransacoes || !transacaoId) {
    return Resultado.sucesso({ transacaoAtualizada: false });
  }
  
  try {
    if (sucesso) {
      await gerenciadorTransacoes.marcarComoEntregue(transacaoId);
    } else if (erro) {
      await gerenciadorTransacoes.registrarFalhaEntrega(transacaoId, `Erro: ${erro.message}`);
    }
    return Resultado.sucesso({ transacaoAtualizada: true });
  } catch (erroTransacao) {
    registrador.error(`[MsgServ] Erro ao atualizar transação: ${erroTransacao.message}`);
    return Resultado.falha(erroTransacao);
  }
};

/**
 * Fábrica do Serviço de Mensagens
 * @param {Object} registrador Logger
 * @param {Object} clienteWhatsApp Adaptador Baileys
 * @param {Object} gerenciadorTransacoes (Opcional) Gerenciador de auditoria
 * @param {Object} gerenciadorNotificacoes (Opcional) Gerenciador de fila offline
 */
const criarServicoMensagem = (registrador, clienteWhatsApp, gerenciadorTransacoes = null, gerenciadorNotificacoes = null) => {

  /**
   * Salva mensagem para envio posterior (Notificação Pendente)
   */
  const salvarComoNotificacaoPendente = async (destinatario, texto, snapshot, transacaoId) => {
    try {
      if (!gerenciadorNotificacoes) {
        registrador.warn("[MsgServ] Gerenciador de Notificações não disponível. Mensagem perdida.");
        return Resultado.falha(new Error("Gerenciador de Notificações indisponível"));
      }

      // Se tiver snapshot, tenta gerar contexto textual antes de salvar
      let textoFinal = texto;
      if (snapshot) {
        const resContexto = ServicoSnapshot.gerarTextoContexto(snapshot);
        if (resContexto.sucesso) {
          textoFinal = `${resContexto.dados}\n\n${texto}`;
        }
      }

      // Usa a interface correta do GerenciadorNotificacoes
      const resultadoSalvar = await gerenciadorNotificacoes.salvar(destinatario, textoFinal);
      
      if (resultadoSalvar.sucesso) {
        registrador.info(`[MsgServ] Salvo como pendente para ${destinatario}`);
        return Resultado.sucesso({ salvo: true, caminho: resultadoSalvar.dados });
      } else {
        return resultadoSalvar;
      }
    } catch (erro) {
      registrador.error(`[MsgServ] Erro ao salvar pendente: ${erro.message}`);
      return Resultado.falha(erro);
    }
  };

  /**
   * Envia uma resposta para uma mensagem recebida
   */
  const enviarResposta = async (mensagemMapeada, texto, transacaoId = null) => {
    const resTexto = obterRespostaSegura(texto);
    if (!resTexto.sucesso) return resTexto;

    const textoSeguro = resTexto.dados;
    const destinatario = mensagemMapeada.from || mensagemMapeada.chatId;

    // 1. Tenta envio nativo (com citação)
    const tentativaEnvio = await EstrategiasEnvio.envioBaileysNativo(
      clienteWhatsApp, 
      destinatario, 
      textoSeguro, 
      mensagemMapeada
    );

    if (tentativaEnvio.sucesso) {
      await atualizarStatusTransacao(gerenciadorTransacoes, transacaoId, true, null, registrador);
      return tentativaEnvio;
    }

    registrador.warn(`[MsgServ] Falha no envio nativo para ${destinatario}. Tentando fallback. Erro: ${tentativaEnvio.erro?.message}`);

    // 2. Fallback: Salvar como pendente
    // Primeiro capturamos o snapshot para não perder o contexto
    const resSnapshot = await ServicoSnapshot.capturarSnapshotMensagem(mensagemMapeada, clienteWhatsApp, registrador);
    const snapshot = resSnapshot.sucesso ? resSnapshot.dados : null;

    const resSalvar = await salvarComoNotificacaoPendente(destinatario, textoSeguro, snapshot, transacaoId);
    
    // Registra falha na transação original, mas sucesso no salvamento pendente
    await atualizarStatusTransacao(gerenciadorTransacoes, transacaoId, false, tentativaEnvio.erro, registrador);
    
    return resSalvar.sucesso 
      ? Resultado.sucesso({ metodoUsado: 'salvo_pendente' }) 
      : Resultado.falha(tentativaEnvio.erro);
  };

  /**
   * Envia mensagem direta (Ex: Avisos do sistema, Broadcasts)
   */
  const enviarMensagemDireta = async (destinatario, texto, opcoes = {}) => {
    const resTexto = obterRespostaSegura(texto);
    if (!resTexto.sucesso) return resTexto;

    if (destinatario === 'status@broadcast') {
      return Resultado.falha(new Error("Envio para Status bloqueado por segurança"));
    }

    const tentativa = await EstrategiasEnvio.envioDireto(clienteWhatsApp, destinatario, resTexto.dados);

    if (tentativa.sucesso) {
      if (opcoes.transacaoId) {
        await atualizarStatusTransacao(gerenciadorTransacoes, opcoes.transacaoId, true, null, registrador);
      }
      return tentativa;
    }

    // Fallback para pendente
    registrador.warn(`[MsgServ] Falha no envio direto. Salvando pendente.`);
    await salvarComoNotificacaoPendente(destinatario, resTexto.dados, null, opcoes.transacaoId);
    
    if (opcoes.transacaoId) {
      await atualizarStatusTransacao(gerenciadorTransacoes, opcoes.transacaoId, false, tentativa.erro, registrador);
    }

    return Resultado.falha(tentativa.erro);
  };

  /**
   * Envia mensagem baseada em transação processada (Orquestrador)
   */
  const enviarMensagemComTransacao = async (dados) => {
    const { resposta, chatId, messageKey, transacaoId } = dados;
    
    // Simula uma estrutura mínima de mensagem para o envioBaileysNativo conseguir citar
    const mockMensagem = messageKey ? { 
      key: messageKey, 
      _data: { 
        key: messageKey,
        // Adiciona estrutura mínima de mensagem para evitar crash no Baileys ao tentar ler o conteúdo citado
        message: { conversation: 'Mídia processada' }
      } 
    } : null;

    if (mockMensagem) {
      return enviarResposta({ from: chatId, ...mockMensagem }, resposta, transacaoId);
    } else {
      return enviarMensagemDireta(chatId, resposta, { transacaoId });
    }
  };

  /**
   * Processa notificações pendentes
   */
  const processarNotificacoesPendentes = async () => {
    if (gerenciadorNotificacoes) {
      return gerenciadorNotificacoes.processar(clienteWhatsApp);
    }
    return Resultado.sucesso({ processadas: 0, msg: 'Gerenciador não disponível' });
  };

  // Interface Pública
  return Object.freeze({
    enviarResposta,
    enviarMensagemDireta,
    enviarMensagemComTransacao,
    processarNotificacoesPendentes,
    
    // Utilitários expostos (Fachada para os submódulos)
    capturarSnapshotMensagem: (msg) => ServicoSnapshot.capturarSnapshotMensagem(msg, clienteWhatsApp, registrador),
    gerarTextoContexto: ServicoSnapshot.gerarTextoContexto,
    Resultado
  });
};

module.exports = criarServicoMensagem;
