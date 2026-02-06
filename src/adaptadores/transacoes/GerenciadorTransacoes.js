const EventEmitter = require('events');
const path = require('path');
const { Resultado } = require('../../bancodedados/Repositorio');
const RegistradorDebugProxy = require('./RegistradorDebugProxy');
const criarFabricaRepositorio = require('../../bancodedados/FabricaRepositorio');

/**
 * GerenciadorTransacoes - Gerenciamento de ciclo de vida das transações (Funcional)
 */
const criarGerenciadorTransacoes = (registradorOriginal, diretorioDB = path.join(process.cwd(), 'db')) => {
    const eventos = new EventEmitter();
    const registrador = new RegistradorDebugProxy(registradorOriginal);
    const fabricaRepositorio = criarFabricaRepositorio(registradorOriginal, diretorioDB);
    const repoTransacoes = fabricaRepositorio.obterRepositorioTransacoes();

    const limparTransacoesAntigas = async (diasRetencao = 7) => {
        const resultado = await repoTransacoes.limparTransacoesAntigas(diasRetencao);
        return Resultado.dobrar(
            resultado,
            (numRemovidas) => numRemovidas,
            (erro) => {
                registrador.error(`Erro ao limpar transações antigas: ${erro.message}`);
                throw erro;
            }
        );
    };

    const atualizarStatusTransacao = async (transacaoId, status, detalhes) => {
        const resultado = await repoTransacoes.atualizarStatus(transacaoId, status, detalhes);
        return Resultado.dobrar(
            resultado,
            (info) => info.numAfetados > 0,
            (erro) => {
                registrador.error(`Erro ao atualizar status da transação: ${erro.message}`);
                throw erro;
            }
        );
    };

    const marcarComoEntregue = async (transacaoId) => {
        const ok = await atualizarStatusTransacao(transacaoId, 'entregue', 'Mensagem entregue com sucesso');
        if (!ok) return false;

        const resultadoRemocao = await repoTransacoes.removerTransacaoPorId(transacaoId);
        return Resultado.dobrar(
            resultadoRemocao,
            (num) => {
                if (num > 0) registrador.info(`Transação ${transacaoId} marcada como entregue e removida.`);
                return num > 0;
            },
            (erro) => {
                registrador.error(`Erro ao remover transação ${transacaoId}: ${erro.message}`);
                return false;
            }
        );
    };

    const registrarFalhaEntrega = async (transacaoId, erro) => {
        const erroString = String(erro);
        const resultado = await repoTransacoes.registrarFalhaEntrega(transacaoId, erroString);
        return Resultado.dobrar(
            resultado,
            () => {
                registrador.warn(`Falha registrada para transação ${transacaoId}: ${erroString}`);
                return true;
            },
            (erroOp) => {
                registrador.error(`Erro ao registrar falha: ${String(erroOp)}`);
                throw erroOp;
            }
        );
    };

    const interfaceG = {
        on: (ev, cb) => eventos.on(ev, cb),
        emit: (ev, d) => eventos.emit(ev, d),

        limparTransacoesIncompletas: async () => {
            const resultadoBusca = await repoTransacoes.buscarTransacoesIncompletas();
            return Resultado.dobrar(
                resultadoBusca,
                async (transacoes) => {
                    if (!transacoes || transacoes.length === 0) return 0;
                    let limpas = 0;
                    for (const tx of transacoes) {
                        const res = await repoTransacoes.removerTransacaoPorId(tx.id);
                        if (res.sucesso && res.dados > 0) limpas++;
                    }
                    return limpas;
                },
                () => 0
            );
        },

        criarTransacao: async (mensagem, chat) => {
            const dados = {
                id: mensagem.id.id,
                chatId: chat.id._serialized,
                senderId: mensagem.id.remote,
                timestamp: new Date(mensagem.timestamp * 1000),
                tipo: mensagem.type
            };
            const res = await repoTransacoes.criarTransacao(dados);
            return Resultado.dobrar(res, (doc) => Resultado.sucesso(doc), (err) => { throw err; });
        },

        adicionarDadosRecuperacao: async (id, dados) => {
            const res = await repoTransacoes.adicionarDadosRecuperacao(id, dados);
            return Resultado.dobrar(res, (info) => info.numAfetados > 0, (err) => { throw err; });
        },

        recuperarTransacoesIncompletas: async () => {
            const res = await repoTransacoes.buscarTransacoesIncompletas();
            return Resultado.dobrar(res, async (txs) => {
                for (const tx of txs) {
                    eventos.emit('transacao_para_recuperar', tx);
                    await atualizarStatusTransacao(tx.id, 'recuperacao_em_andamento', 'Recuperada após restart');
                }
                return txs.length;
            }, (err) => { throw err; });
        },

        marcarComoProcessando: (id) => atualizarStatusTransacao(id, 'processando', 'Processamento iniciado'),
        
        adicionarRespostaTransacao: async (id, resposta) => {
            const res = await repoTransacoes.adicionarResposta(id, resposta);
            return Resultado.dobrar(res, (info) => info.numAfetados > 0, (err) => { throw err; });
        },

        marcarComoEntregue,
        registrarFalhaEntrega,
        atualizarStatusTransacao,

        processarTransacoesPendentes: async (cliente) => {
            if (!cliente) return Resultado.falha(new Error('Cliente necessário'));
            const resBusca = await repoTransacoes.buscarTransacoesIncompletas();
            if (!resBusca.sucesso) return resBusca;

            let sucessos = 0;
            for (const tx of resBusca.dados) {
                try {
                    if (tx.resposta && tx.chatId) {
                        await cliente.enviarMensagem(tx.chatId, tx.resposta);
                        await marcarComoEntregue(tx.id);
                        sucessos++;
                    }
                } catch (e) {
                    await registrarFalhaEntrega(tx.id, e);
                }
            }
            return Resultado.sucesso(sucessos);
        },

        limparTransacoesAntigas,
        obterEstatisticas: () => repoTransacoes.obterEstatisticas().then(r => Resultado.dobrar(r, s => s, e => { throw e; })),
        obterTransacao: (id) => repoTransacoes.buscarTransacaoPorId(id).then(r => Resultado.dobrar(r, t => t, e => { throw e; }))
    };

    // Inicialização
    limparTransacoesAntigas();
    setInterval(() => limparTransacoesAntigas(), 24 * 60 * 60 * 1000);
    registrador.info('Gerenciador de transações inicializado (Funcional)');

    return interfaceG;
};

module.exports = criarGerenciadorTransacoes;
