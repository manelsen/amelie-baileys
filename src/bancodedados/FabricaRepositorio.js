// src/bancodedados/FabricaRepositorio.js
/**
 * FabricaRepositorio - Fábrica funcional de repositórios
 */

const path = require('path');
const criarRepositorioNeDB = require('./RepositorioNeDB');
const criarRepositorioConfiguracao = require('./RepositorioConfiguracao');
const criarRepositorioTransacoes = require('./RepositorioTransacoes');
const criarRepositorioPrompts = require('./RepositorioPrompts');
const criarRepositorioGrupos = require('./RepositorioGrupos');
const criarRepositorioUsuarios = require('./RepositorioUsuarios');

/**
 * Cria uma fábrica de repositórios
 * @param {Object} registrador 
 * @param {string} diretorioBanco 
 */
const criarFabricaRepositorio = (registrador, diretorioBanco = path.join(process.cwd(), 'db')) => {
    const repositorios = {};
    
    const mapaFabricas = {
        'configuracao': criarRepositorioConfiguracao,
        'transacoes': criarRepositorioTransacoes,
        'prompts': criarRepositorioPrompts,
        'grupos': criarRepositorioGrupos,
        'usuarios': criarRepositorioUsuarios
    };

    const obterRepositorio = (nomeEntidade, usarEspecifica = true) => {
        if (!repositorios[nomeEntidade]) {
            const caminhoBanco = path.join(diretorioBanco, `${nomeEntidade}.db`);
            
            if (usarEspecifica && mapaFabricas[nomeEntidade]) {
                const fabrica = mapaFabricas[nomeEntidade];
                repositorios[nomeEntidade] = fabrica(caminhoBanco, registrador);
            } else {
                repositorios[nomeEntidade] = criarRepositorioNeDB(caminhoBanco, registrador);
            }
        }
        return repositorios[nomeEntidade];
    };

    return {
        obterRepositorio,
        obterRepositorioConfiguracao: () => obterRepositorio('configuracao'),
        obterRepositorioTransacoes: () => obterRepositorio('transacoes'),
        obterRepositorioPrompts: () => obterRepositorio('prompts'),
        obterRepositorioGrupos: () => obterRepositorio('grupos'),
        obterRepositorioUsuarios: () => obterRepositorio('usuarios')
    };
};

module.exports = criarFabricaRepositorio;
