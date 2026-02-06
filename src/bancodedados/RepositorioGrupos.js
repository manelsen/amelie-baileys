// src/bancodedados/RepositorioGrupos.js
/**
 * RepositorioGrupos - Repositório para grupos de WhatsApp (Funcional)
 */

const criarRepositorioNeDB = require('./RepositorioNeDB');
const { Resultado } = require('./Repositorio');

/**
 * Fábrica para o Repositório de Grupos
 */
const criarRepositorioGrupos = (caminhoBanco, registrador) => {
    const base = criarRepositorioNeDB(caminhoBanco, registrador);

    const obterOuCriarGrupo = async (idGrupo, dadosGrupo = {}) => {
        const resultadoBusca = await base.encontrarUm({ id: idGrupo });

        if (resultadoBusca.sucesso && resultadoBusca.dados) return resultadoBusca;
        if (!resultadoBusca.sucesso) return resultadoBusca;

        let nomeGrupo = dadosGrupo.nome || (idGrupo?.substring ? `Grupo_${idGrupo.substring(0, 6)}` : 'GrupoDesconhecido');
        
        const novoGrupo = {
            id: idGrupo,
            title: nomeGrupo,
            createdAt: new Date(),
            membros: []
        };

        const resultadoInsercao = await base.inserir(novoGrupo);
        return Resultado.mapear(resultadoInsercao, grupoInserido => {
            registrador.info(`[Grupos] Novo grupo registrado: ${grupoInserido.title}`);
            return grupoInserido;
        });
    };

    const adicionarMembro = async (idGrupo, idMembro) => {
        return base.atualizar(
            { id: idGrupo },
            { $addToSet: { membros: idMembro } }
        );
    };

    const removerMembro = async (idGrupo, idMembro) => {
        return base.atualizar(
            { id: idGrupo },
            { $pull: { membros: idMembro } }
        );
    };

    return {
        ...base,
        obterOuCriarGrupo,
        adicionarMembro,
        removerMembro
    };
};

module.exports = criarRepositorioGrupos;
