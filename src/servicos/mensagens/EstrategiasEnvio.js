/**
 * EstrategiasEnvio - Módulo com estratégias para envio de mensagens
 * 
 * Separa a lógica de "Como enviar" da lógica de negócio.
 */

const { Resultado } = require('../../utilitarios/Ferrovia');

/**
 * Estratégia Principal: Envio usando o adaptador Baileys (com suporte nativo a Quote)
 * @param {Object} clienteWhatsApp - O adaptador ClienteBaileys
 * @param {string} destinatario - JID do destinatário
 * @param {string} texto - O corpo da mensagem
 * @param {Object} mensagemOriginal - Objeto da mensagem original (para extrair key de citação)
 * @returns {Promise<Resultado>}
 */
const envioBaileysNativo = async (clienteWhatsApp, destinatario, texto, mensagemOriginal) => {
  try {
    // Tenta extrair o objeto cru para citação
    // Se for mensagem mapeada, tenta pegar _data ou o próprio objeto
    const objetoQuoted = mensagemOriginal?._data || mensagemOriginal;

    const resultado = await clienteWhatsApp.enviarTexto(destinatario, texto, {
      quoted: objetoQuoted
    });

    if (resultado.sucesso) {
      return Resultado.sucesso({ metodoUsado: 'baileys_nativo', dados: resultado.dados });
    }
    
    // Se falhou, propaga o erro retornado pelo adaptador
    return Resultado.falha(resultado.erro || new Error("Falha desconhecida no adaptador Baileys"));

  } catch (erro) {
    return Resultado.falha(erro);
  }
};

/**
 * Estratégia de Fallback: Envio Direto (sem citação)
 * Usado quando a citação falha ou não é possível.
 */
const envioDireto = async (clienteWhatsApp, destinatario, texto) => {
  try {
    const resultado = await clienteWhatsApp.enviarTexto(destinatario, texto);
    
    if (resultado.sucesso) {
      return Resultado.sucesso({ metodoUsado: 'direto_sem_citacao', dados: resultado.dados });
    }
    return Resultado.falha(resultado.erro);
  } catch (erro) {
    return Resultado.falha(erro);
  }
};

/**
 * Estratégia de Contexto Reconstruído
 * Usada quando não conseguimos citar tecnicamente (ex: mensagem antiga demais),
 * mas queremos manter o contexto visualmente no texto.
 */
const envioComContextoManual = async (clienteWhatsApp, destinatario, texto, textoContexto) => {
  try {
    const conteudoFinal = `${textoContexto}\n\n${texto}`;
    const resultado = await clienteWhatsApp.enviarTexto(destinatario, conteudoFinal);

    if (resultado.sucesso) {
      return Resultado.sucesso({ metodoUsado: 'contexto_manual', dados: resultado.dados });
    }
    return Resultado.falha(resultado.erro);
  } catch (erro) {
    return Resultado.falha(erro);
  }
};

module.exports = {
  envioBaileysNativo,
  envioDireto,
  envioComContextoManual
};
