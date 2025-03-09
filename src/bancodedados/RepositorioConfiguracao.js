// src/db/RepositorioConfiguracao.js
/**
 * RepositorioConfiguracao - Repositório específico para configurações
 * 
 * Adiciona métodos específicos de domínio para configurações.
 */

const RepositorioNeDB = require('./RepositorioNeDB');
const { Resultado } = require('./Repositorio');

class RepositorioConfiguracao extends RepositorioNeDB {
  /**
   * Obtém configurações para um chat específico
   * @param {string} idChat - ID do chat
   * @param {Object} configPadrao - Configuração padrão se não existir
   * @returns {Promise<Resultado>} Resultado com as configurações
   */
  async obterConfigChat(idChat, configPadrao = {}) {
    const resultado = await this.encontrarUm({ chatId: idChat });
    
    return Resultado.mapear(resultado, dados => {
      return dados ? { ...configPadrao, ...dados } : configPadrao;
    });
  }
  
  /**
   * Define configuração para um chat
   * @param {string} idChat - ID do chat
   * @param {string} param - Chave da configuração
   * @param {any} valor - Valor da configuração
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async definirConfig(idChat, param, valor) {
    return this.atualizar(
      { chatId: idChat },
      { $set: { [param]: valor } },
      { upsert: true }
    );
  }
  
  /**
   * Reseta as configurações de um chat
   * @param {string} idChat - ID do chat
   * @param {Object} configPadrao - Configurações padrão
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async resetarConfig(idChat, configPadrao) {
    return this.atualizar(
      { chatId: idChat },
      { $set: configPadrao },
      { upsert: true }
    );
  }

  /**
   * Obtém configurações para vários chats
   * @param {Array<string>} idsChat - Lista de IDs de chat
   * @param {Object} configPadrao - Configuração padrão para chats sem config
   * @returns {Promise<Resultado>} Resultado com configurações mapeadas por chatId
   */
  async obterConfigsMultiplos(idsChat, configPadrao = {}) {
    const resultado = await this.encontrar({ 
      chatId: { $in: idsChat } 
    });
    
    return Resultado.mapear(resultado, configs => {
      // Transformar lista em mapa de chatId -> config
      const mapaConfigs = configs.reduce((mapa, config) => {
        mapa[config.chatId] = config;
        return mapa;
      }, {});
      
      // Garantir que todos os IDs tenham uma config
      return idsChat.reduce((mapa, id) => {
        mapa[id] = mapaConfigs[id] || {...configPadrao};
        return mapa;
      }, {});
    });
  }
}

module.exports = RepositorioConfiguracao;