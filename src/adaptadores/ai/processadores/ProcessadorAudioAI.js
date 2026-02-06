/**
 * ProcessadorAudioAI - Lógica de transcrição e análise de áudio via Google AI
 */

const { Resultado } = require('../../../utilitarios/Ferrovia');
const { obterInstrucaoAudio } = require('../../../config/InstrucoesSistema');

class ProcessadorAudioAI {
    constructor(logger, componentes) {
        this.logger = logger;
        this.obterModelo = componentes.obterModelo;
        this.executarResiliente = componentes.executarResiliente;
        this.verificarCache = componentes.verificarCache;
        this.cache = componentes.cache;
    }

    /**
     * Processa um áudio (buffer)
     */
    async processarAudio(audioData, audioId, config) {
        const tipo = 'audio';
        
        // 1. Verificar Cache (usando audioId como parte do prompt para cache)
        const resCache = await this.verificarCache(tipo, { dadosAnexo: audioData, prompt: audioId }, config, this.cache, this.logger);
        if (resCache.sucesso && resCache.dados.hit) return Resultado.sucesso(resCache.dados.valor);

        // 2. Preparar Modelo e Conteúdo
        const configAI = {
            ...config,
            temperature: 0.1, // Temperatura baixa para transcrição fiel
            systemInstruction: config.systemInstruction || obterInstrucaoAudio()
        };
        
        const modelo = this.obterModelo(configAI);
        const partes = [
            { inlineData: { mimeType: audioData.mimetype, data: audioData.data } },
            { text: 'Você é uma IA especializada em transcrição de áudio. Transcreva o áudio em anexo palavra por palavra, sem qualquer comentário adicional. Sua tarefa inicia com a transcrição da primeira palavra e termina com a transcrição da última palavra.' }
        ];

        // 3. Executar
        const resExec = await this.executarResiliente('processarAudio', () => modelo.generateContent(partes));
        if (!resExec.sucesso) return resExec;

        // 4. Finalizar (tratar resposta e salvar cache)
        const resFinal = await this.finalizarProcessamento(resExec.dados, tipo, config, resCache.dados?.chaveCache);
        
        // Adicionar prefixo de transcrição se for sucesso
        if (resFinal.sucesso) {
            resFinal.dados = `[Transcrição de Áudio]\n\n${resFinal.dados}`;
        }
        
        return resFinal;
    }

    /**
     * Placeholder para finalizar processamento - será sobrescrito pelo GerenciadorAI
     */
    async finalizarProcessamento(resultadoApi, tipo, config, chaveCache) {
        return Resultado.sucesso(resultadoApi); 
    }
}

module.exports = ProcessadorAudioAI;
