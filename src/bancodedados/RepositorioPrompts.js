// src/bancodedados/RepositorioPrompts.js
/**
 * RepositorioPrompts - Repositório para prompts do sistema (Funcional)
 */

const criarRepositorioNeDB = require('./RepositorioNeDB');
const { Resultado } = require('./Repositorio');

/**
 * Fábrica para o Repositório de Prompts
 */
const criarRepositorioPrompts = (caminhoBanco, registrador) => {
    const base = criarRepositorioNeDB(caminhoBanco, registrador);

    const definirPrompt = async (idChat, nome, texto) => {
        const textoFormatado = `Seu nome é ${nome}. ${texto}`;
        return base.atualizar(
            { chatId: idChat, name: nome }, 
            { chatId: idChat, name: nome, text: textoFormatado }, 
            { upsert: true }
        );
    };

    const obterPrompt = async (idChat, nome) => {
        return base.encontrarUm({ chatId: idChat, name: nome });
    };

    const listarPrompts = async (idChat) => {
        return base.encontrar({ chatId: idChat });
    };

    const excluirPrompt = async (idChat, nome) => {
        return base.remover({ chatId: idChat, name: nome });
    };

    return {
        ...base,
        definirPrompt,
        obterPrompt,
        listarPrompts,
        excluirPrompt
    };
};

module.exports = criarRepositorioPrompts;
