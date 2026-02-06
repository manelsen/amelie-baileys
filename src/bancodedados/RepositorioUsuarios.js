// src/bancodedados/RepositorioUsuarios.js
/**
 * RepositorioUsuarios - Repositório para usuários (Funcional)
 */

const criarRepositorioNeDB = require('./RepositorioNeDB');
const { Resultado } = require('./Repositorio');

/**
 * Fábrica para o Repositório de Usuários
 */
const criarRepositorioUsuarios = (caminhoBanco, registrador) => {
    const base = criarRepositorioNeDB(caminhoBanco, registrador);

    const obterOuCriarUsuario = async (idUsuario, dadosUsuario = {}) => {
        const resultadoBusca = await base.encontrarUm({ id: idUsuario });

        if (resultadoBusca.sucesso && resultadoBusca.dados) return resultadoBusca;
        if (!resultadoBusca.sucesso) return resultadoBusca;

        let nomeUsuario = dadosUsuario.nome || (idUsuario?.substring ? `Usuário${idUsuario.substring(0, 6).replace(/[^0-9]/g, '')}` : 'UsuárioDesconhecido');
        
        const novoUsuario = {
            id: idUsuario,
            nome: nomeUsuario,
            dataEntrada: new Date(),
            preferencias: {}
        };

        const resultadoInsercao = await base.inserir(novoUsuario);
        return Resultado.mapear(resultadoInsercao, usuarioInserido => {
            registrador.info(`[Usuarios] Novo usuário registrado: ${usuarioInserido.nome}`);
            return usuarioInserido;
        });
    };

    const atualizarPreferencias = async (idUsuario, preferencias) => {
        return base.atualizar(
            { id: idUsuario },
            { $set: { preferencias } }
        );
    };

    const buscarPorNome = async (termoBusca) => {
        const regex = new RegExp(termoBusca, 'i');
        return base.encontrar({ nome: { $regex: regex } });
    };

    return {
        ...base,
        obterOuCriarUsuario,
        atualizarPreferencias,
        buscarPorNome
    };
};

module.exports = criarRepositorioUsuarios;
