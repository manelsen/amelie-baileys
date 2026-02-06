// src/bancodedados/Repositorio.js
/**
 * Repositorio - Interface base funcional para acesso a dados
 * 
 * Define o contrato para todas as implementações de repositórios
 * seguindo princípios de programação funcional (Railway Pattern).
 */

const { Resultado } = require('../utilitarios/Ferrovia');

/**
 * Cria uma interface de repositório padrão.
 * Serve como base (molde) para implementações concretas (NeDB, MongoDB, etc).
 * 
 * @param {Object} implementacao - Objeto contendo as funções concretas
 * @returns {Object} Interface do repositório
 */
const criarRepositorio = (implementacao = {}) => {
  const lancarErro = (metodo) => async () => {
    throw new Error(`Método ${metodo} não implementado no repositório concreto.`);
  };

  return {
    encontrarUm: implementacao.encontrarUm || lancarErro('encontrarUm'),
    encontrar: implementacao.encontrar || lancarErro('encontrar'),
    inserir: implementacao.inserir || lancarErro('inserir'),
    atualizar: implementacao.atualizar || lancarErro('atualizar'),
    remover: implementacao.remover || lancarErro('remover'),
    contar: implementacao.contar || lancarErro('contar')
  };
};

module.exports = { criarRepositorio, Resultado };
