// src/bancodedados/RepositorioMongoDB.js
/**
 * RepositorioMongoDB - Implementação de Repositorio para MongoDB
 * 
 * Adapta a interface Repositorio para o MongoDB, tratando erros de forma funcional.
 */
const { MongoClient } = require('mongodb');
const { Repositorio, Resultado } = require('./Repositorio');

class RepositorioMongoDB extends Repositorio {
  /**
   * @param {string} stringConexao - String de conexão MongoDB
   * @param {string} nomeBanco - Nome do banco de dados
   * @param {string} nomeColecao - Nome da coleção
   * @param {Object} registrador - Objeto para registro de logs
   */
  constructor(stringConexao, nomeBanco, nomeColecao, registrador) {
    super();
    this.stringConexao = stringConexao;
    this.nomeBanco = nomeBanco;
    this.nomeColecao = nomeColecao;
    this.registrador = registrador;
    this.cliente = null;
    this.colecao = null;
  }

  /**
   * Garante conexão com MongoDB
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async garantirConexao() {
    if (this.colecao) return Resultado.sucesso(this.colecao);

    return new Promise(resolver => {
      MongoClient.connect(this.stringConexao)
        .then(cliente => {
          this.cliente = cliente;
          this.colecao = cliente.db(this.nomeBanco).collection(this.nomeColecao);
          this.registrador.info(`Conectado ao MongoDB: ${this.nomeColecao}`);
          resolver(Resultado.sucesso(this.colecao));
        })
        .catch(erro => {
          this.registrador.error(`Erro ao conectar MongoDB: ${erro.message}`);
          resolver(Resultado.falha(erro));
        });
    });
  }

  /**
   * Encontra um único documento
   * @param {Object} consulta - Critérios de busca
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async encontrarUm(consulta) {
    return new Promise(resolver => {
      this.garantirConexao()
        .then(resultado => Resultado.encadear(resultado, async () => {
          try {
            const documento = await this.colecao.findOne(consulta);
            // Imutabilidade - cria cópia do documento
            resolver(Resultado.sucesso(documento ? { ...documento } : null));
          } catch (erro) {
            this.registrador.error(`Erro ao buscar documento: ${erro.message}`);
            resolver(Resultado.falha(erro));
          }
        }))
        .catch(erro => resolver(Resultado.falha(erro)));
    });
  }

  /**
   * Encontra múltiplos documentos
   * @param {Object} consulta - Critérios de busca
   * @param {Object} opcoes - Opções como limite, pular, ordenar
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async encontrar(consulta, opcoes = {}) {
    return new Promise(resolver => {
      this.garantirConexao()
        .then(resultado => Resultado.encadear(resultado, async () => {
          try {
            let cursor = this.colecao.find(consulta);
            
            if (opcoes.ordenar) cursor = cursor.sort(opcoes.ordenar);
            if (opcoes.pular) cursor = cursor.skip(opcoes.pular);
            if (opcoes.limite) cursor = cursor.limit(opcoes.limite);
            
            const documentos = await cursor.toArray();
            // Imutabilidade - cria cópias dos documentos
            const documentosImutaveis = documentos.map(doc => ({ ...doc }));
            resolver(Resultado.sucesso(documentosImutaveis));
          } catch (erro) {
            this.registrador.error(`Erro ao buscar documentos: ${erro.message}`);
            resolver(Resultado.falha(erro));
          }
        }))
        .catch(erro => resolver(Resultado.falha(erro)));
    });
  }

  /**
   * Insere um novo documento
   * @param {Object} documento - Documento a ser inserido
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async inserir(documento) {
    // Criar cópia para garantir imutabilidade
    const copiaDocumento = { ...documento };

    return new Promise(resolver => {
      this.garantirConexao()
        .then(resultado => Resultado.encadear(resultado, async () => {
          try {
            const resultado = await this.colecao.insertOne(copiaDocumento);
            resolver(Resultado.sucesso({ ...copiaDocumento, _id: resultado.insertedId }));
          } catch (erro) {
            this.registrador.error(`Erro ao inserir documento: ${erro.message}`);
            resolver(Resultado.falha(erro));
          }
        }))
        .catch(erro => resolver(Resultado.falha(erro)));
    });
  }

  /**
   * Atualiza documentos
   * @param {Object} consulta - Critérios de busca
   * @param {Object} atualizacao - Atualizações a aplicar
   * @param {Object} opcoes - Opções como upsert, multi
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async atualizar(consulta, atualizacao, opcoes = {}) {
    return new Promise(resolver => {
      this.garantirConexao()
        .then(resultado => Resultado.encadear(resultado, async () => {
          try {
            const resultado = await this.colecao.updateMany(consulta, atualizacao, opcoes);
            resolver(Resultado.sucesso({
              numAfetados: resultado.modifiedCount,
              documentosAfetados: resultado.upsertedId ? { _id: resultado.upsertedId } : null,
              upsert: !!resultado.upsertedId
            }));
          } catch (erro) {
            this.registrador.error(`Erro ao atualizar documentos: ${erro.message}`);
            resolver(Resultado.falha(erro));
          }
        }))
        .catch(erro => resolver(Resultado.falha(erro)));
    });
  }

  /**
   * Remove documentos
   * @param {Object} consulta - Critérios de busca
   * @param {Object} opcoes - Opções como multi
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async remover(consulta, opcoes = {}) {
    return new Promise(resolver => {
      this.garantirConexao()
        .then(resultado => Resultado.encadear(resultado, async () => {
          try {
            const resultado = await this.colecao.deleteMany(consulta);
            resolver(Resultado.sucesso(resultado.deletedCount));
          } catch (erro) {
            this.registrador.error(`Erro ao remover documentos: ${erro.message}`);
            resolver(Resultado.falha(erro));
          }
        }))
        .catch(erro => resolver(Resultado.falha(erro)));
    });
  }

  /**
   * Conta documentos
   * @param {Object} consulta - Critérios de busca
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async contar(consulta) {
    return new Promise(resolver => {
      this.garantirConexao()
        .then(resultado => Resultado.encadear(resultado, async () => {
          try {
            const contagem = await this.colecao.countDocuments(consulta);
            resolver(Resultado.sucesso(contagem));
          } catch (erro) {
            this.registrador.error(`Erro ao contar documentos: ${erro.message}`);
            resolver(Resultado.falha(erro));
          }
        }))
        .catch(erro => resolver(Resultado.falha(erro)));
    });
  }

  /**
   * Cria índice para o banco de dados
   * @param {Object} nomeCampo - Campo para indexar
   * @param {Object} opcoes - Opções do índice
   * @returns {Promise<Resultado>} Resultado da operação
   */
  async garantirIndice(nomeCampo, opcoes = {}) {
    return new Promise(resolver => {
      this.garantirConexao()
        .then(resultado => Resultado.encadear(resultado, async () => {
          try {
            await this.colecao.createIndex({ [nomeCampo]: 1 }, opcoes);
            resolver(Resultado.sucesso(true));
          } catch (erro) {
            this.registrador.error(`Erro ao criar índice: ${erro.message}`);
            resolver(Resultado.falha(erro));
          }
        }))
        .catch(erro => resolver(Resultado.falha(erro)));
    });
  }
}

module.exports = RepositorioMongoDB;