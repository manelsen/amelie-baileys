const path = require('path');
const LimpadorTemp = require('../utilitarios/LimpadorTemp');

/**
 * Serviço de Limpeza e Manutenção Periódica (Funcional)
 */
const criarServicoLimpeza = (logger, componentes) => {
    const diretorioTemp = path.join(process.cwd(), 'temp');

    const executarLimpezaTemp = async () => {
        await LimpadorTemp.limpar(diretorioTemp, 30, logger);
    };

    const executarProcessamentoRapido = async () => {
        const { clienteWhatsApp, gerenciadorTransacoes, gerenciadorNotificacoes, filasMidia, gerenciadorMensagens } = componentes;

        if (clienteWhatsApp.pronto && filasMidia && gerenciadorMensagens) {
            try {
                const resultadoLimpeza = await gerenciadorTransacoes.limparTransacoesIncompletas();
                if (resultadoLimpeza > 0) {
                    logger.info(`[Lmpza] ${resultadoLimpeza} transações incompletas removidas.`);
                }
                
                const resNotif = await gerenciadorNotificacoes.processar(clienteWhatsApp);
                const resTrans = await gerenciadorTransacoes.processarTransacoesPendentes(clienteWhatsApp);

                const total = (resNotif.sucesso ? resNotif.dados : 0) + (resTrans.sucesso ? resTrans.dados : 0);
                if (total > 0) {
                    logger.info(`[Lmpza] Processamento rápido concluído: ${total} itens tratados.`);
                }
            } catch (erro) {
                logger.error(`[Lmpza] Erro no processamento rápido: ${erro.message}`);
            }
        }
    };

    const executarLimpezaProfunda = async () => {
        const { clienteWhatsApp, gerenciadorTransacoes, gerenciadorNotificacoes, filasMidia } = componentes;

        if (clienteWhatsApp.pronto && filasMidia) {
            try {
                logger.info('[Lmpza] Iniciando limpeza profunda diária...');
                await gerenciadorNotificacoes.limparAntigas(1);
                await gerenciadorTransacoes.limparTransacoesAntigas(1);
                await gerenciadorTransacoes.limparTransacoesIncompletas();
                await filasMidia.limparTrabalhosPendentes();
                logger.info('[Lmpza] Limpeza profunda concluída.');
            } catch (erro) {
                logger.error(`[Lmpza] Erro na limpeza profunda: ${erro.message}`);
            }
        }
    };

    let jaIniciado = false;

    const iniciar = () => {
        if (jaIniciado) {
            logger.warn('[Lmpza] Serviço de manutenção já foi iniciado. Ignorando chamada duplicada.');
            return;
        }
        jaIniciado = true;

        logger.info('[Lmpza] Serviço de manutenção iniciado.');

        // Limpeza inicial imediata (Pasta Temp)
        LimpadorTemp.limpar(diretorioTemp, 30, logger);

        // Loop de processamento rápido (5s)
        setInterval(() => executarProcessamentoRapido(), 5000);

        // Loop de limpeza de arquivos temporários (1h)
        setInterval(() => executarLimpezaTemp(), 60 * 60 * 1000);

        // Loop de limpeza profunda (24h)
        setInterval(() => executarLimpezaProfunda(), 24 * 60 * 60 * 1000);
    };

    return {
        iniciar,
        executarLimpezaTemp,
        executarProcessamentoRapido,
        executarLimpezaProfunda
    };
};

module.exports = criarServicoLimpeza;
