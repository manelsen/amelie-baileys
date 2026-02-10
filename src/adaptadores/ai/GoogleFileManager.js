/**
 * GoogleFileManager - Adaptador para gerenciamento de arquivos na API Google AI
 * 
 * Isola a lógica de upload, busca, deleção e polling de arquivos.
 */

const { GoogleAIFileManager } = require("@google/generative-ai/server");
const { Resultado } = require('../../utilitarios/Ferrovia');

class GoogleFileManager {
    constructor(logger, apiKey, resiliencia) {
        this.logger = logger;
        this.manager = new GoogleAIFileManager(apiKey);
        this.executarComResiliencia = resiliencia; // Função injetada do GerenciadorAI
        this.TIMEOUT_UPLOAD = 180000; // 3 minutos
    }

    /**
     * Faz upload de um arquivo local para o Google AI
     */
    async upload(caminhoArquivo, opcoes) {
        this.logger.debug(`[Arquv] Upload: ${caminhoArquivo}`);
        return await this.executarComResiliencia(
            'uploadArquivoGoogle',
            () => this.manager.uploadFile(caminhoArquivo, opcoes),
            this.TIMEOUT_UPLOAD
        );
    }

    /**
     * Obtém o status de um arquivo no Google AI
     */
    async obterStatus(nomeArquivo) {
        return await this.executarComResiliencia(
            'getArquivoGoogle',
            () => this.manager.getFile(nomeArquivo)
        );
    }

    /**
     * Deleta um arquivo do Google AI
     */
    async deletar(nomeArquivo) {
        if (!nomeArquivo) return Resultado.sucesso(true);

        const resultado = await this.executarComResiliencia(
            'deleteArquivoGoogle',
            () => this.manager.deleteFile(nomeArquivo)
        );

        if (resultado.sucesso) {
            this.logger.debug(`[Arquv] Arquivo deletado: ${nomeArquivo}`);
            return Resultado.sucesso(true);
        } else {
            this.logger.error(`[Arquv] Falha ao deletar ${nomeArquivo}: ${resultado.erro.message}`);
            return Resultado.sucesso(false); // Não bloqueante
        }
    }

    /**
     * Realiza polling até que o arquivo esteja pronto ou falhe
     */
    async aguardarProcessamento(nomeArquivo, maxTentativas = 18) {
        let tentativas = 0;
        const delay = 10000;

        while (tentativas < maxTentativas) {
            this.logger.debug(`[Arquv] Aguardando processamento [${nomeArquivo}] (${tentativas + 1}/${maxTentativas})`);
            
            await new Promise(r => setTimeout(r, delay));
            const res = await this.obterStatus(nomeArquivo);
            
            if (!res.sucesso) return res;

            const estado = res.dados.state;
            if (estado === 'SUCCEEDED' || estado === 'ACTIVE') {
                return Resultado.sucesso(res.dados);
            }
            
            if (estado === 'FAILED') {
                return Resultado.falha(new Error(`Falha no processamento do arquivo [${nomeArquivo}] pelo Google AI`));
            }

            tentativas++;
        }

        return Resultado.falha(new Error(`Timeout processando arquivo [${nomeArquivo}]`));
    }
}

module.exports = GoogleFileManager;
