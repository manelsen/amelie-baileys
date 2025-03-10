/**
 * ServicoMensagem - Centraliza o envio de mensagens no sistema
 * 
 * Implementa o padrão funcional com funções puras e imutabilidade
 * para garantir consistência nas respostas e citações.
 */

// Funções puras para processamento de mensagens
const limparTextoResposta = (texto) => {
  if (!texto || typeof texto !== 'string') {
    return "Não foi possível gerar uma resposta válida.";
  }
  
  // Remover prefixos comuns
  let textoLimpo = texto.replace(/^(?:amélie:[\s]*)+/i, '');
  textoLimpo = textoLimpo.replace(/^(?:amelie:[\s]*)+/i, '');

  // Normalizar quebras de linha
  textoLimpo = textoLimpo.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
  
  return textoLimpo.trim();
};

const obterRespostaSegura = (texto) => {
  if (!texto || typeof texto !== 'string' || texto.trim() === '') {
    return "Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente.";
  }
  return limparTextoResposta(texto);
};

const registrarLogEnvio = (registrador, mensagemOriginal, sucesso, detalhes) => {
  const remetente = mensagemOriginal?.from || mensagemOriginal?.author || 'desconhecido';
  const tipoMensagem = mensagemOriginal?.hasMedia ? 
    (mensagemOriginal.type || 'mídia') : 'texto';
  
  if (sucesso) {
    registrador.debug(`✅ Resposta enviada como citação para ${remetente} (${tipoMensagem})`);
  } else {
    registrador.warn(`⚠️ Não foi possível usar citação para ${remetente}: ${detalhes}`);
  }
};

const criarServicoMensagem = (registrador, clienteWhatsApp) => {
  /**
   * Envia resposta à mensagem original
   * @param {Object} mensagemOriginal - Mensagem original para responder
   * @param {string} texto - Texto da resposta
   * @param {string|null} transacaoId - ID opcional da transação
   * @returns {Promise<boolean>} Sucesso do envio
   */
  const enviarResposta = async (mensagemOriginal, texto, transacaoId = null) => {
    try {
      const textoSeguro = obterRespostaSegura(texto);
      
      // Verificação de segurança para mensagem original
      if (!mensagemOriginal || typeof mensagemOriginal.reply !== 'function') {
        const destinatario = mensagemOriginal?.from || mensagemOriginal?.author;
        
        if (!destinatario) {
          throw new Error("Impossível determinar destinatário para resposta");
        }
        
        registrarLogEnvio(registrador, mensagemOriginal, false, "Método reply não disponível");
        return await clienteWhatsApp.enviarMensagem(destinatario, textoSeguro);
      }

      // Tentar usar o método reply da mensagem original (garantindo citação)
      try {
        await mensagemOriginal.reply(textoSeguro);
        registrarLogEnvio(registrador, mensagemOriginal, true);
        return true;
      } catch (erroReply) {
        // Se falhar com reply, tentar envio direto
        registrador.warn(`Falha ao usar reply: ${erroReply.message}. Tentando envio direto.`);
        
        const destinatario = mensagemOriginal.from || mensagemOriginal.author;
        if (!destinatario) {
          throw new Error("Impossível determinar destinatário para resposta após falha no reply");
        }
        
        await clienteWhatsApp.enviarMensagem(destinatario, textoSeguro);
        registrarLogEnvio(registrador, mensagemOriginal, false, "Fallback para envio direto");
        return true;
      }
    } catch (erro) {
      registrador.error(`Erro ao enviar resposta: ${erro.message}`, { erro });
      
      // Tentar salvar como notificação pendente em caso de erro
      try {
        if (mensagemOriginal && mensagemOriginal.from) {
          await clienteWhatsApp.salvarNotificacaoPendente(
            mensagemOriginal.from, 
            texto, 
            { transacaoId }
          );
          registrador.info(`Mensagem salva como notificação pendente para ${mensagemOriginal.from}`);
        }
      } catch (erroSalvar) {
        registrador.error(`Falha ao salvar notificação pendente: ${erroSalvar.message}`);
      }
      
      return false;
    }
  };
  
  // Retornar objeto com métodos puros
  return Object.freeze({
    enviarResposta
  });
};

module.exports = criarServicoMensagem;