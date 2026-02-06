// src/bancodedados/RepositorioNeDB.js
/**
 * RepositorioNeDB - Implementação funcional de Repositorio para NeDB
 */

const Datastore = require('@seald-io/nedb');
const { criarRepositorio, Resultado } = require('./Repositorio');
const fs = require('fs');
const path = require('path');

/**
 * Fábrica para o Repositório NeDB
 * @param {string} caminhoBanco 
 * @param {Object} registrador 
 */
const criarRepositorioNeDB = (caminhoBanco, registrador) => {
    let bancoDados;

    try {
        const diretorio = path.dirname(caminhoBanco);
        if (!fs.existsSync(diretorio)) {
            fs.mkdirSync(diretorio, { recursive: true });
            registrador.info(`[NeDB] Diretório criado: ${diretorio}`);
        }
        
        fs.accessSync(diretorio, fs.constants.R_OK | fs.constants.W_OK);
        
        bancoDados = new Datastore({ 
            filename: caminhoBanco, 
            autoload: true,
            onload: (err) => {
                if (err) registrador.error(`[NeDB] Erro ao carregar banco: ${err.message}`);
            }
        });
    } catch (erro) {
        registrador.error(`[NeDB] Erro ao inicializar repositório: ${erro.message}`);
        throw erro;
    }

    // Implementação das funções concretas
    const encontrarUm = async (consulta) => new Promise(resolver => {
        bancoDados.findOne(consulta, (erro, documento) => {
            if (erro) {
                registrador.error(`[NeDB] Erro ao buscar documento: ${erro.message}`);
                resolver(Resultado.falha(erro));
            } else {
                resolver(Resultado.sucesso(documento));
            }
        });
    });

    const encontrar = async (consulta, opcoes = {}) => new Promise(resolver => {
        let cursor = bancoDados.find(consulta);
        
        if (opcoes.ordenar) cursor = cursor.sort(opcoes.ordenar);
        if (opcoes.pular) cursor = cursor.skip(opcoes.pular);
        if (opcoes.limite) cursor = cursor.limit(opcoes.limite);
        
        cursor.exec((erro, documentos) => {
            if (erro) {
                registrador.error(`[NeDB] Erro ao buscar documentos: ${erro.message}`);
                resolver(Resultado.falha(erro));
            } else {
                const documentosImutaveis = documentos.map(doc => ({ ...doc }));
                resolver(Resultado.sucesso(documentosImutaveis));
            }
        });
    });

    const inserir = async (documento) => {
        const copiaDocumento = { ...documento };
        return new Promise(resolver => {
            bancoDados.insert(copiaDocumento, (erro, novoDoc) => {
                if (erro) {
                    registrador.error(`[NeDB] Erro ao inserir documento: ${erro.message}`);
                    resolver(Resultado.falha(erro));
                } else {
                    resolver(Resultado.sucesso(novoDoc));
                }
            });
        });
    };

    const atualizar = async (consulta, atualizacao, opcoes = {}) => new Promise(resolver => {
        bancoDados.update(consulta, atualizacao, opcoes, (erro, numAfetados, documentosAfetados, upsert) => {
            if (erro) {
                registrador.error(`[NeDB] Erro ao atualizar documentos: ${erro.message}`);
                resolver(Resultado.falha(erro));
            } else {
                resolver(Resultado.sucesso({ 
                    numAfetados, 
                    documentosAfetados: documentosAfetados ? { ...documentosAfetados } : null, 
                    upsert 
                }));
            }
        });
    });

    const remover = async (consulta, opcoes = {}) => new Promise(resolver => {
        bancoDados.remove(consulta, opcoes, (erro, numRemovidos) => {
            if (erro) {
                registrador.error(`[NeDB] Erro ao remover documentos: ${erro.message}`);
                resolver(Resultado.falha(erro));
            } else {
                resolver(Resultado.sucesso(numRemovidos));
            }
        });
    });

    const contar = async (consulta) => new Promise(resolver => {
        bancoDados.count(consulta, (erro, contagem) => {
            if (erro) {
                registrador.error(`[NeDB] Erro ao contar documentos: ${erro.message}`);
                resolver(Resultado.falha(erro));
            } else {
                resolver(Resultado.sucesso(contagem));
            }
        });
    });

    const garantirIndice = async (nomeCampo, opcoes = {}) => new Promise(resolver => {
        bancoDados.ensureIndex({ fieldName: nomeCampo, ...opcoes }, (erro) => {
            if (erro) {
                registrador.error(`[NeDB] Erro ao criar índice: ${erro.message}`);
                resolver(Resultado.falha(erro));
            } else {
                resolver(Resultado.sucesso(true));
            }
        });
    });

    // Retorna a interface base populada com as funções concretas
    return {
        ...criarRepositorio({
            encontrarUm,
            encontrar,
            inserir,
            atualizar,
            remover,
            contar
        }),
        garantirIndice
    };
};

module.exports = criarRepositorioNeDB;
