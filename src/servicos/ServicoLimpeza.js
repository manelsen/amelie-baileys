/**
 * Serviço de Limpeza e Manutenção Periódica
 */
class ServicoLimpeza {
    constructor(logger, componentes) {
        this.logger = logger;
        this.componentes = componentes;
    }

    iniciar() {
        this.logger.info('[Limpeza] Serviço de manutenção iniciado.');
        
        // Loop de processamento rápido (5s)
        setInterval(() => this.executarProcessamentoRapido(), 5000);

        // Loop de limpeza profunda (24h)
        setInterval(() => this.executarLimpezaProfunda(), 24 * 60 * 60 * 1000);
    }

    async executarProcessamentoRapido() {
        const { clienteWhatsApp, gerenciadorTransacoes, gerenciadorNotificacoes, filasMidia, gerenciadorMensagens } = this.componentes;

        if (clienteWhatsApp.pronto && filasMidia && gerenciadorMensagens) {
            try {
                // Mudar para debug para não poluir o console a cada 5s
                const resultadoLimpeza = await gerenciadorTransacoes.limparTransacoesIncompletas();
                if (resultadoLimpeza > 0) {
                    this.logger.info(`[Limpeza] ${resultadoLimpeza} transações incompletas removidas.`);
                }
                
                const resNotif = await gerenciadorNotificacoes.processar(clienteWhatsApp);
                const resTrans = await gerenciadorTransacoes.processarTransacoesPendentes(clienteWhatsApp);

                const total = (resNotif.sucesso ? resNotif.dados : 0) + (resTrans.sucesso ? resTrans.dados : 0);
                if (total > 0) {
                    this.logger.info(`[Limpeza] Processamento rápido concluído: ${total} itens tratados.`);
                }
            } catch (erro) {
                this.logger.error(`[Limpeza] Erro no processamento rápido: ${erro.message}`);
            }
        }
    }

    async executarLimpezaProfunda() {
        const { clienteWhatsApp, gerenciadorTransacoes, gerenciadorNotificacoes, filasMidia } = this.componentes;

        if (clienteWhatsApp.pronto && filasMidia) {
            try {
                this.logger.info('[Limpeza] Iniciando limpeza profunda diária...');
                await gerenciadorNotificacoes.limparAntigas(1);
                await gerenciadorTransacoes.limparTransacoesAntigas(1);
                await gerenciadorTransacoes.limparTransacoesIncompletas();
                await filasMidia.limparTrabalhosPendentes();
                this.logger.info('[Limpeza] Limpeza profunda concluída.');
            } catch (erro) {
                this.logger.error(`[Limpeza] Erro na limpeza profunda: ${erro.message}`);
            }
        }
    }
}

module.exports = ServicoLimpeza;
