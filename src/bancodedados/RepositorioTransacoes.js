// src/bancodedados/RepositorioTransacoes.js
/**
 * RepositorioTransacoes - Repositório específico para transações (Funcional)
 */

const criarRepositorioNeDB = require('./RepositorioNeDB');
const { Resultado } = require('./Repositorio');
const crypto = require('crypto');

/**
 * Fábrica para o Repositório de Transações
 */
const criarRepositorioTransacoes = (caminhoBanco, registrador) => {
    const base = criarRepositorioNeDB(caminhoBanco, registrador);

    // Criar índices iniciais
    base.garantirIndice('id');
    base.garantirIndice('status');
    base.garantirIndice('dataCriacao');
    base.garantirIndice('messageId');
    base.garantirIndice('chatId');

    const criarTransacao = async (dadosTransacao) => {
        const agora = new Date();
        const idTransacao = dadosTransacao.id ? `tx_${dadosTransacao.id}` : `tx_${agora.getTime()}_${crypto.randomBytes(4).toString('hex')}`;

        const transacao = {
            id: idTransacao,
            messageId: dadosTransacao.id,
            chatId: dadosTransacao.chatId,
            senderId: dadosTransacao.senderId,
            dataCriacao: agora,
            ultimaAtualizacao: agora,
            tipo: dadosTransacao.tipo,
            status: 'criada',
            tentativas: 0,
            historico: [{
                data: agora,
                status: 'criada',
                detalhes: 'Transação criada'
            }],
            ...(dadosTransacao.textoOriginal && { textoOriginal: dadosTransacao.textoOriginal }),
            ...(dadosTransacao.caption && { caption: dadosTransacao.caption }),
        };

        return base.inserir(transacao);
    };

    const adicionarDadosRecuperacao = async (idTransacao, dadosRecuperacao) => {
        const agora = new Date();
        return base.atualizar(
            { id: idTransacao },
            { 
                $set: { 
                    dadosRecuperacao,
                    ultimaAtualizacao: agora
                },
                $push: {
                    historico: {
                        data: agora,
                        status: 'dados_recuperacao_adicionados',
                        detalhes: 'Dados para recuperação persistidos'
                    }
                }
            }
        );
    };

    const atualizarStatus = async (idTransacao, status, detalhes) => {
        const agora = new Date();
        return base.atualizar(
            { id: idTransacao },
            { 
                $set: { 
                    status,
                    ultimaAtualizacao: agora
                },
                $push: {
                    historico: {
                        data: agora,
                        status,
                        detalhes
                    }
                }
            }
        );
    };

    const adicionarResposta = async (idTransacao, resposta) => {
        const agora = new Date();
        return base.atualizar(
            { id: idTransacao },
            { 
                $set: { 
                    resposta,
                    ultimaAtualizacao: agora
                },
                $push: {
                    historico: {
                        data: agora,
                        status: 'resposta_gerada',
                        detalhes: 'Resposta gerada pela IA'
                    }
                }
            }
        );
    };

    const registrarFalhaEntrega = async (idTransacao, erro) => {
        const detalhesErro = `Falha na entrega: ${String(erro)}`;
        return atualizarStatus(idTransacao, 'falha_entrega', detalhesErro);
    };

    const buscarTransacoesIncompletas = async () => {
        return base.encontrar({
            status: { $in: ['processando', 'resposta_gerada', 'falha_temporaria'] },
            resposta: { $exists: true },
            dadosRecuperacao: { $exists: true }
        });
    };

    const limparTransacoesAntigas = async (diasRetencao = 7) => {
        const dataLimite = new Date(Date.now() - diasRetencao * 24 * 60 * 60 * 1000);
        const resultado = await base.remover({ 
            dataCriacao: { $lt: dataLimite },
            status: { $in: ['entregue', 'falha_permanente'] }
        }, { multi: true });
        
        return Resultado.mapear(resultado, numRemovidos => {
            if (numRemovidos > 0) registrador.info(`[Transacoes] Removidas ${numRemovidos} transações antig`);
            return numRemovidos;
        });
    };

    const obterEstatisticas = async () => {
        const contarPorStatus = async (status) => {
            const resultado = await base.contar({ status });
            return Resultado.mapear(resultado, contagem => ({ status, contagem }));
        };
        
        const rTotal = await base.contar({});
        const rCriadas = await contarPorStatus('criada');
        const rProcessando = await contarPorStatus('processando'); 
        const rEntregues = await contarPorStatus('entregue');
        const rFalhasTemp = await contarPorStatus('falha_temporaria');
        const rFalhasPerm = await contarPorStatus('falha_permanente');
        
        return Resultado.encadear(rTotal, total => 
            Resultado.encadear(rCriadas, criadas => 
                Resultado.encadear(rProcessando, processando => 
                    Resultado.encadear(rEntregues, entregues => 
                        Resultado.encadear(rFalhasTemp, falhasTemp => 
                            Resultado.encadear(rFalhasPerm, falhasPerm => {
                                const taxaSucesso = total > 0 ? (entregues.contagem / total * 100).toFixed(2) + '%' : '0%';
                                return Resultado.sucesso({
                                    total,
                                    criadas: criadas.contagem,
                                    processando: processando.contagem,
                                    entregues: entregues.contagem,
                                    falhasTemporarias: falhasTemp.contagem,
                                    falhasPermanentes: falhasPerm.contagem,
                                    taxaSucesso
                                });
                            })
                        )
                    )
                )
            )
        );
    };

    return {
        ...base,
        criarTransacao,
        adicionarDadosRecuperacao,
        atualizarStatus,
        adicionarResposta,
        registrarFalhaEntrega,
        buscarTransacoesIncompletas,
        limparTransacoesAntigas,
        obterEstatisticas,
        buscarTransacaoPorId: (id) => base.encontrarUm({ id }),
        removerTransacaoPorId: (id) => base.remover({ id }, {})
    };
};

module.exports = criarRepositorioTransacoes;
