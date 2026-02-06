/**
 * ProcessadorDocumentoAI - Lógica de análise de documentos via Google AI
 */

const path = require('path');
const { Resultado } = require('../../../utilitarios/Ferrovia');
const { obterInstrucaoDocumento } = require('../../../config/InstrucoesSistema');

class ProcessadorDocumentoAI {
    constructor(logger, componentes) {
        this.logger = logger;
        this.obterModelo = componentes.obterModelo;
        this.fileManager = componentes.fileManager;
        this.executarResiliente = componentes.executarResiliente;
        this.verificarCache = componentes.verificarCache;
        this.cache = componentes.cache;
    }

    /**
     * Processa um documento inline (buffer pequeno)
     */
    async processarDocumentoInline(documentoData, prompt, config) {
        const tipo = 'documentoInline';
        const mimeType = documentoData.mimetype || 'application/octet-stream';
        const tipoDocLog = mimeType.split('/')[1]?.split('+')[0] || mimeType.split('/')[1] || 'documento';
        
        // 1. Verificar Cache
        const resCache = await this.verificarCache(tipo, { dadosAnexo: documentoData, prompt }, config, this.cache, this.logger, tipoDocLog);
        if (resCache.sucesso && resCache.dados.hit) return Resultado.sucesso(resCache.dados.valor);

        // 2. Preparar Modelo
        const configAI = {
            ...config,
            systemInstruction: config.systemInstruction || obterInstrucaoDocumento()
        };
        const modelo = this.obterModelo(configAI);
        const partes = [
            { inlineData: { mimeType: mimeType, data: documentoData.data } },
            { text: prompt || `Analise este documento (${tipoDocLog}) e forneça um resumo.` }
        ];

        // 3. Executar
        const resExec = await this.executarResiliente('processarDocumentoInline', () => modelo.generateContent(partes), 180000);
        if (!resExec.sucesso) return resExec;

        return await this.finalizarProcessamento(resExec.dados, tipoDocLog, config, resCache.dados?.chaveCache);
    }

    /**
     * Processa um documento via arquivo (PDFs grandes etc)
     */
    async processarDocumentoArquivo(caminhoDocumento, prompt, config) {
        const tipo = 'documentoArquivo';
        const mimeType = config.mimeType || 'application/octet-stream';
        const tipoDocLog = mimeType.split('/')[1] || 'documento';
        let nomeGoogle = null;

        try {
            // 1. Verificar Cache
            const resCache = await this.verificarCache(tipo, { caminhoArquivo: caminhoDocumento, prompt }, config, this.cache, this.logger, tipoDocLog);
            if (resCache.sucesso && resCache.dados.hit) return Resultado.sucesso(resCache.dados.valor);

            // 2. Upload e Polling
            let mimeTypeParaUpload = mimeType === 'application/octet-stream' ? 'text/plain' : mimeType;
            const resUpload = await this.fileManager.upload(caminhoDocumento, {
                mimeType: mimeTypeParaUpload,
                displayName: path.basename(caminhoDocumento) || `${tipoDocLog.toUpperCase()} Enviado`
            });
            if (!resUpload.sucesso) return resUpload;
            nomeGoogle = resUpload.dados.file.name;

            const resWait = await this.fileManager.aguardarProcessamento(nomeGoogle, 15);
            if (!resWait.sucesso) return resWait;

            // 3. Análise
            const configAI = { ...config, systemInstruction: config.systemInstruction || obterInstrucaoDocumento() };
            const modelo = this.obterModelo(configAI);
            const promptTexto = prompt || `Analise este documento (${tipoDocLog}) e forneça um resumo.`;
            const partes = [
                { fileData: { mimeType: resWait.dados.mimeType, fileUri: resWait.dados.uri } },
                { text: promptTexto }
            ];

            const resExec = await this.executarResiliente('processarDocumentoArquivo', () => modelo.generateContent(partes), 180000);
            if (!resExec.sucesso) return resExec;

            return await this.finalizarProcessamento(resExec.dados, tipoDocLog, config, resCache.dados?.chaveCache);
        } finally {
            if (nomeGoogle) await this.fileManager.deletar(nomeGoogle);
        }
    }

    /**
     * Placeholder para finalizar processamento
     */
    async finalizarProcessamento(resultadoApi, tipo, config, chaveCache) {
        return Resultado.sucesso(resultadoApi); 
    }
}

module.exports = ProcessadorDocumentoAI;
