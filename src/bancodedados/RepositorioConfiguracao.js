// src/bancodedados/RepositorioConfiguracao.js
/**
 * RepositorioConfiguracao - Repositório específico para configurações (Funcional)
 */

const criarRepositorioNeDB = require('./RepositorioNeDB');
const { Resultado } = require('./Repositorio');

/**
 * Fábrica para o Repositório de Configurações
 */
const criarRepositorioConfiguracao = (caminhoBanco, registrador) => {
    const base = criarRepositorioNeDB(caminhoBanco, registrador);

    const obterConfigChat = async (idChat, configPadrao = {}) => {
        const resultado = await base.encontrarUm({ chatId: idChat });
        return Resultado.mapear(resultado, dados => {
            return dados ? { ...configPadrao, ...dados } : configPadrao;
        });
    };

    const definirConfig = async (idChat, param, valor) => {
        return base.atualizar(
            { chatId: idChat },
            { $set: { [param]: valor } },
            { upsert: true }
        );
    };

    const resetarConfig = async (idChat, configPadrao) => {
        return base.atualizar(
            { chatId: idChat },
            { $set: configPadrao },
            { upsert: true }
        );
    };

    const obterConfigsMultiplos = async (idsChat, configPadrao = {}) => {
        const resultado = await base.encontrar({ 
            chatId: { $in: idsChat } 
        });
        
        return Resultado.mapear(resultado, configs => {
            const mapaConfigs = configs.reduce((mapa, config) => {
                mapa[config.chatId] = config;
                return mapa;
            }, {});
            
            return idsChat.reduce((mapa, id) => {
                mapa[id] = mapaConfigs[id] || {...configPadrao};
                return mapa;
            }, {});
        });
    };

    return {
        ...base,
        obterConfigChat,
        definirConfig,
        resetarConfig,
        obterConfigsMultiplos
    };
};

module.exports = criarRepositorioConfiguracao;
