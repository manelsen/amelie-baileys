// src/db/RepositorioUsuarios.js
/**
 * RepositorioUsuarios - Repositório para usuários
 */

const RepositorioNeDB = require('./RepositorioNeDB');
const { Resultado } = require('./Repositorio');

class RepositorioUsuarios extends RepositorioNeDB {
  /**
   * Obtém ou cria um registro de usuário
   * @param {string} remetente - ID do remetente
   * @param {Object} cliente - Instância do cliente WhatsApp
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async obterOuCriarUsuario(remetente, cliente) {
    const resultado = await this.encontrarUm({ id: remetente });
    
    return Resultado.encadear(resultado, async usuario => {
      if (usuario) {
        return Resultado.sucesso(usuario);
      }
      
      try {
        // Buscar informações do contato
        let nome;
        try {
          const contato = await cliente.getContactById(remetente);
          nome = contato.pushname || contato.name || contato.shortName;
        } catch (erroContato) {
          nome = null;
        }
        
        if (!nome || nome.trim() === '') {
          const idSufixo = remetente.substring(0, 6);
          nome = `Usuario${idSufixo}`;
        }

        const novoUsuario = {
          id: remetente,
          nome: nome,
          dataEntrada: new Date()
        };
        
        const resultadoInsercao = await this.inserir(novoUsuario);
        
        return Resultado.mapear(resultadoInsercao, usuarioInserido => {
          this.registrador.info(`Novo usuário registrado: ${usuarioInserido.nome}`);
          return usuarioInserido;
        });
      } catch (erro) {
        // Criar um usuário básico em caso de erro
        const idSufixo = remetente.substring(0, 6);
        const usuarioBasico = {
          id: remetente,
          nome: `Usuario${idSufixo}`,
          dataEntrada: new Date()
        };
        
        const resultadoInsercaoFallback = await this.inserir(usuarioBasico);
        return resultadoInsercaoFallback;
      }
    });
  }
  
  /**
   * Atualiza preferências do usuário
   * @param {string} idUsuario - ID do usuário
   * @param {Object} preferencias - Preferências a atualizar
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async atualizarPreferencias(idUsuario, preferencias) {
    return this.atualizar(
      { id: idUsuario },
      { $set: { preferencias } }
    );
  }
  
  /**
   * Busca usuários por nome ou parte do nome
   * @param {string} termoBusca - Termo para busca
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async buscarPorNome(termoBusca) {
    // Criando uma expressão regular para busca case-insensitive
    const regex = new RegExp(termoBusca, 'i');
    return this.encontrar({ nome: { $regex: regex } });
  }
}

module.exports = RepositorioUsuarios;