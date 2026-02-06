/**
 * OrquestradorMidia - Processamento assíncrono de mídias para Amélie
 * Substitui o antigo FilasProcessadores focado em Bull/Redis.
 */

const _ = require('lodash/fp');
const FilasConfiguracao = require('./FilasConfiguracao');
const FilasProcessadoresMidia = require('./FilasProcessadoresMidia');
const FilasUtilitarios = require('./FilasUtilitarios');

class OrquestradorMidia {
    constructor(logger, componentes) {
        this.logger = logger;
        this.gerenciadorAI = componentes.gerenciadorAI;
        this.configManager = componentes.configManager;
        this.servicoMensagem = componentes.servicoMensagem;
    }

    /**
     * Processador genérico para Imagem e Áudio (Fluxo Curto)
     */
    criarProcessadorSimples(tipo) {
        return async (job, cb) => {
            const { 
                data, imageData, audioData, docData, // Suporte a múltiplos nomes de campo
                chatId, messageId, messageKey, transacaoId, remetenteName, userPrompt 
            } = job;
            
            try {
                this.logger.info(`[${_.capitalize(tipo)}] Processando job assíncrono - ${transacaoId}`);

                // Normalizar o buffer de mídia
                const midiaBuffer = data || imageData || audioData || docData;
                if (!midiaBuffer) throw new Error(`Dados do ${tipo} inválidos ou ausentes`);

                // 1. Obter Configurações do Usuário
                const resultadoConfig = await FilasConfiguracao.obterConfig(this.configManager, this.logger, chatId, tipo);
                const config = resultadoConfig.sucesso ? resultadoConfig.dados : {};

                // 2. Processar Mídia via IA
                let resposta;
                if (tipo === 'imagem') {
                    const promptFinal = FilasConfiguracao.prepararPrompt(this.logger, 'imagem', userPrompt, config.modoDescricao);
                    const resAI = await FilasProcessadoresMidia.processarImagem(this.gerenciadorAI, this.logger, midiaBuffer, promptFinal, config);
                    if (!resAI.sucesso) throw resAI.erro;
                    resposta = resAI.dados;
                } else if (tipo === 'audio') {
                    const resAI = await FilasProcessadoresMidia.processarAudio(this.gerenciadorAI, this.logger, midiaBuffer, transacaoId, config);
                    if (!resAI.sucesso) throw resAI.erro;
                    resposta = resAI.dados;
                } else if (tipo === 'documento') {
                    const resAI = await FilasProcessadoresMidia.processarDocumento(this.gerenciadorAI, this.logger, midiaBuffer, userPrompt, config);
                    if (!resAI.sucesso) throw resAI.erro;
                    resposta = resAI.dados;
                }

                // 3. Enviar Resposta
                await this.servicoMensagem.enviarMensagemComTransacao({
                    resposta,
                    chatId,
                    messageId,
                    messageKey,
                    transacaoId,
                    remetenteName,
                    tipo
                });

                cb(null, { sucesso: true });
            } catch (erro) {
                this.logger.error(`[${_.capitalize(tipo)}] Erro no job ${transacaoId}: ${erro.message}`);
                cb(erro);
            }
        };
    }

    /**
     * Processador para Vídeos (Fluxo Longo com Upload Google)
     */
    criarProcessadorVideo() {
        return async (job, cb) => {
            const { tempFilename, chatId, messageId, messageKey, transacaoId, remetenteName, userPrompt, mimeType } = job;
            let fileUri = null;
            let fileName = null;

            try {
                this.logger.info(`[Vídeo] Iniciando fluxo de upload/análise - ${transacaoId}`);

                // 1. Upload para Google AI
                const uploadRes = await this.gerenciadorAI.uploadArquivoGoogle(tempFilename, {
                    mimeType: mimeType || 'video/mp4',
                    displayName: `Video_${transacaoId}`
                });
                if (!uploadRes.sucesso) throw uploadRes.erro;
                
                fileUri = uploadRes.dados.file.uri;
                fileName = uploadRes.dados.file.name;

                // 2. Aguardar Processamento (Polling assíncrono simplificado)
                let pronto = false;
                let tentativas = 0;
                while (!pronto && tentativas < 20) {
                    const status = await this.gerenciadorAI.getArquivoGoogle(fileName);
                    if (status.sucesso && (status.dados.state === 'SUCCEEDED' || status.dados.state === 'ACTIVE')) {
                        pronto = true;
                    } else if (status.sucesso && status.dados.state === 'FAILED') {
                        throw new Error('Processamento do vídeo falhou no Google AI');
                    } else {
                        tentativas++;
                        await new Promise(r => setTimeout(r, 5000));
                    }
                }

                if (!pronto) throw new Error('Timeout no processamento do vídeo');

                // 3. Obter Config e Analisar
                const resultadoConfig = await FilasConfiguracao.obterConfig(this.configManager, this.logger, chatId, 'video');
                const config = resultadoConfig.sucesso ? resultadoConfig.dados : {};
                const promptFinal = FilasConfiguracao.prepararPrompt(this.logger, 'video', userPrompt, config.modoDescricao);

                const resAI = await this.gerenciadorAI.gerarConteudoDeArquivoUri(fileUri, mimeType, promptFinal, config);
                if (!resAI.sucesso) throw resAI.erro;
                
                const resposta = resAI.dados;

                // 4. Enviar Resposta
                await this.servicoMensagem.enviarMensagemComTransacao({
                    resposta,
                    chatId,
                    messageId,
                    messageKey,
                    transacaoId,
                    remetenteName,
                    tipo: 'video'
                });

                // 5. Cleanup
                await FilasUtilitarios.limparArquivo(tempFilename);
                await this.gerenciadorAI.deleteArquivoGoogle(fileName);

                cb(null, { sucesso: true });
            } catch (erro) {
                this.logger.error(`[Vídeo] Erro no job ${transacaoId}: ${erro.message}`);
                // Cleanup em caso de erro
                if (tempFilename) await FilasUtilitarios.limparArquivo(tempFilename);
                if (fileName) await this.gerenciadorAI.deleteArquivoGoogle(fileName);
                cb(erro);
            }
        };
    }
}

module.exports = OrquestradorMidia;
