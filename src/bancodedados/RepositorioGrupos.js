// src/db/RepositorioGrupos.js
/**
 * RepositorioGrupos - Repositório para grupos de WhatsApp
 */

const RepositorioNeDB = require('./RepositorioNeDB');
const { Resultado } = require('./Repositorio');

class RepositorioGrupos extends RepositorioNeDB {
  /**
   * Obtém ou cria um registro de grupo
   * @param {Object} chat - Objeto do chat
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async obterOuCriarGrupo(chat) {
    const idGrupo = chat.id._serialized;
    const resultado = await this.encontrarUm({ id: idGrupo });
    
    return Resultado.encadear(resultado, async grupo => {
      // Se o grupo existe, verificar se precisa atualizar o título
      if (grupo) {
        if (grupo.title !== chat.name) {
          const resultadoAtualizacao = await this.atualizar(
            { id: idGrupo }, 
            { $set: { title: chat.name } }
          );
          
          return Resultado.mapear(resultadoAtualizacao, () => grupo);
        }
        return Resultado.sucesso(grupo);
      }
      
      // Criar novo grupo
      const novoGrupo = {
        id: idGrupo,
        title: chat.name || `Grupo_${idGrupo.substring(0, 6)}`,
        createdAt: new Date()
      };
      
      const resultadoInsercao = await this.inserir(novoGrupo);
      
      return Resultado.mapear(resultadoInsercao, grupoInserido => {
        this.registrador.info(`Novo grupo registrado: ${grupoInserido.title}`);
        return grupoInserido;
      });
    });
  }
  
  /**
   * Adiciona membro ao grupo
   * @param {string} idGrupo - ID do grupo
   * @param {string} idMembro - ID do membro
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async adicionarMembro(idGrupo, idMembro) {
    return this.atualizar(
      { id: idGrupo },
      { $addToSet: { membros: idMembro } }
    );
  }
  
  /**
   * Remove membro do grupo
   * @param {string} idGrupo - ID do grupo
   * @param {string} idMembro - ID do membro
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async removerMembro(idGrupo, idMembro) {
    return this.atualizar(
      { id: idGrupo },
      { $pull: { membros: idMembro } }
    );
  }
  
  /**
   * Lista todos os grupos
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async listarGrupos() {
    return this.encontrar({}, { ordenar: { title: 1 } });
  }
}

module.exports = RepositorioGrupos;