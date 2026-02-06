const criarGerenciadorMensagensBase = require('./GerenciadorMensagens');

/**
 * AdaptadorGerenciadorMensagens - Fachada funcional para o Gerenciador de Mensagens
 * @param {Object} logger 
 * @param {Object} clienteWhatsApp 
 * @param {Object} configManager 
 * @param {Object} gerenciadorAI 
 * @param {Object} filasMidia 
 * @param {Object} gerenciadorTransacoes 
 * @param {Object} servicoMensagem 
 */
const criarGerenciadorMensagens = (
    logger, 
    clienteWhatsApp, 
    configManager, 
    gerenciadorAI, 
    filasMidia, 
    gerenciadorTransacoes, 
    servicoMensagem
) => {
    const dependencias = {
        registrador: logger,
        clienteWhatsApp,
        gerenciadorConfig: configManager,
        gerenciadorAI,
        filasMidia,
        gerenciadorTransacoes,
        servicoMensagem
    };
    
    // Retorna a implementação funcional direta
    return criarGerenciadorMensagensBase(dependencias);
};

module.exports = criarGerenciadorMensagens;
