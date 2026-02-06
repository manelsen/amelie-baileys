/**
 * ProcessadorVisualAI - Lógica de análise de Imagem e Vídeo via Google AI
 */

const _ = require('lodash/fp');
const { Resultado } = require('../../../utilitarios/Ferrovia');
const { obterPromptVideoLegenda } = require('../../../config/InstrucoesSistema');

class ProcessadorVisualAI {
    constructor(logger, componentes) {
        this.logger = logger;
        this.obterModelo = componentes.obterModelo;
        this.fileManager = componentes.fileManager;
        this.executarResiliente = componentes.executarResiliente;
        this.verificarCache = componentes.verificarCache;
        this.cache = componentes.cache;
    }

    /**
     * Processa uma imagem (buffer)
     */
    async processarImagem(imagemData, prompt, config) {
        const tipo = 'imagem';
        
        // 1. Verificar Cache
        const resCache = await this.verificarCache(tipo, { dadosAnexo: imagemData, prompt }, config, this.cache, this.logger);
        if (resCache.sucesso && resCache.dados.hit) return Resultado.sucesso(resCache.dados.valor);

        // 2. Executar
        const modelo = this.obterModelo(config);
        const partes = [
            { inlineData: { data: imagemData.data, mimeType: imagemData.mimetype } },
            { text: config.systemInstructions || (prompt || "Descreva esta imagem.") }
        ];

        const resExec = await this.executarResiliente('processarImagem', () => modelo.generateContent(partes));
        if (!resExec.sucesso) return resExec;

        return this.finalizarProcessamento(resExec.dados, tipo, config, resCache.dados?.chaveCache);
    }

    /**
     * Processa um vídeo (arquivo local)
     */
    async processarVideo(caminhoVideo, prompt, config) {
        const tipo = 'video';
        const mimeType = config.mimeType || 'video/mp4';
        let nomeGoogle = null;

        try {
            // 1. Verificar Cache
            const resCache = await this.verificarCache(tipo, { caminhoArquivo: caminhoVideo, prompt }, config, this.cache, this.logger);
            if (resCache.sucesso && resCache.dados.hit) return Resultado.sucesso(resCache.dados.valor);

            // 2. Upload e Polling
            const resUpload = await this.fileManager.upload(caminhoVideo, { mimeType, displayName: "Vídeo Enviado" });
            if (!resUpload.sucesso) return resUpload;
            nomeGoogle = resUpload.dados.file.name;

            const resWait = await this.fileManager.aguardarProcessamento(nomeGoogle, 18);
            if (!resWait.sucesso) return resWait;

            // 3. Análise
            const modoLegenda = config.modoDescricao === 'legenda' || config.usarLegenda === true;
            const promptFinal = modoLegenda ? (prompt || obterPromptVideoLegenda()) : (prompt || "Analise este vídeo e forneça um resumo.");
            
            const modelo = this.obterModelo(config);
            const partes = [
                { fileData: { mimeType: resWait.dados.mimeType, fileUri: resWait.dados.uri } },
                { text: promptFinal }
            ];

            const resExec = await this.executarResiliente('processarVideo', () => modelo.generateContent(partes));
            if (!resExec.sucesso) return resExec;

            return await this.finalizarProcessamento(resExec.dados, tipo, config, resCache.dados?.chaveCache);
        } finally {
            if (nomeGoogle) await this.fileManager.deletar(nomeGoogle);
        }
    }

    /**
     * Placeholder para finalizar processamento - será sobrescrito pelo GerenciadorAI
     */
    async finalizarProcessamento(resultadoApi, tipo, config, chaveCache) {
        return Resultado.sucesso(resultadoApi); 
    }
}

module.exports = ProcessadorVisualAI;
