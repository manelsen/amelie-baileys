// src/db/Repositorio.js
/**
 * Repositorio - Interface base para acesso a dados
 * 
 * Define o contrato para todas as implementações de repositórios
 * seguindo princípios de programação funcional.
 */

// Estrutura Resultado para tratamento funcional de erros (Padrão Ferroviário)
const Resultado = {
  sucesso: (dados) => ({ sucesso: true, dados, erro: null }),
  falha: (erro) => ({ sucesso: false, dados: null, erro }),
  
  // Funções utilitárias para encadeamento
  mapear: (resultado, fn) => resultado.sucesso ? Resultado.sucesso(fn(resultado.dados)) : resultado,
  encadear: (resultado, fn) => resultado.sucesso ? fn(resultado.dados) : resultado,
  
  // Manipuladores de resultado
  dobrar: (resultado, aoSucesso, aoFalhar) => 
    resultado.sucesso ? aoSucesso(resultado.dados) : aoFalhar(resultado.erro)
};

/**
 * Interface base para todos os repositórios
 * Todas as operações retornam um Resultado para tratamento funcional de erros
 */
class Repositorio {
  /**
   * Encontra um único documento
   * @param {Object} consulta - Critérios de busca
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async encontrarUm(consulta) {
    throw new Error("Método encontrarUm deve ser implementado pela classe concreta");
  }

  /**
   * Encontra múltiplos documentos
   * @param {Object} consulta - Critérios de busca
   * @param {Object} opcoes - Opções como limite, pular, ordenar
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async encontrar(consulta, opcoes = {}) {
    throw new Error("Método encontrar deve ser implementado pela classe concreta");
  }

  /**
   * Insere um novo documento
   * @param {Object} documento - Documento a ser inserido
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async inserir(documento) {
    throw new Error("Método inserir deve ser implementado pela classe concreta");
  }

  /**
   * Atualiza documentos
   * @param {Object} consulta - Critérios de busca
   * @param {Object} atualizacao - Atualizações a aplicar
   * @param {Object} opcoes - Opções como upsert, multi
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async atualizar(consulta, atualizacao, opcoes = {}) {
    throw new Error("Método atualizar deve ser implementado pela classe concreta");
  }

  /**
   * Remove documentos
   * @param {Object} consulta - Critérios de busca
   * @param {Object} opcoes - Opções como multi
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async remover(consulta, opcoes = {}) {
    throw new Error("Método remover deve ser implementado pela classe concreta");
  }

  /**
   * Conta documentos
   * @param {Object} consulta - Critérios de busca
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async contar(consulta) {
    throw new Error("Método contar deve ser implementado pela classe concreta");
  }
}

module.exports = { Repositorio, Resultado };