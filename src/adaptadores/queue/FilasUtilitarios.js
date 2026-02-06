// FilasUtilitarios.js

/**
 * FilasUtilitarios - Funções puras para operações comuns
 */

const _ = require('lodash/fp');
const { Resultado } = require('../../utilitarios/Ferrovia');
const ArquivoUtils = require('../../utilitarios/ArquivoUtils');

const FilasUtilitarios = {
  /**
   * Gera um identificador único
   * @returns {string} Identificador hexadecimal
   */
  gerarId: () => require('crypto').randomBytes(8).toString('hex'),

  /**
   * Limpa arquivo temporário
   * @param {string} caminhoArquivo - Caminho para o arquivo
   * @returns {Promise<Resultado>} Resultado da operação
   */
  limparArquivo: (caminhoArquivo) => ArquivoUtils.removerArquivo(caminhoArquivo)
};

module.exports = FilasUtilitarios;
