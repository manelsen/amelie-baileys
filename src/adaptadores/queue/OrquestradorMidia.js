/**
 * OrquestradorMidia - Processamento assíncrono de mídias para Amélie (Funcional)
 */

const _ = require('lodash/fp');
const FilasConfiguracao = require('./FilasConfiguracao');
const FilasProcessadoresMidia = require('./FilasProcessadoresMidia');
const FilasUtilitarios = require('./FilasUtilitarios');

/**
 * Fábrica do Orquestrador de Mídia
 * @param {Object} logger 
 * @param {Object} componentes 
 */
const criarOrquestradorMidia = (logger, componentes) => {
    const { gerenciadorAI, configManager, servicoMensagem } = componentes;

    /**
     * Processador genérico para Imagem e Áudio (Fluxo Curto)
     */
    const criarProcessadorSimples = (tipo) => async (job, cb) => {
        const { 
            data, imageData, audioData, docData, 
            chatId, messageId, messageKey, transacaoId, remetenteName, userPrompt 
        } = job;
        
        try {
            logger.info(`[${_.capitalize(tipo)}] Processando ${transacaoId}`);

            const midiaBuffer = data || imageData || audioData || docData;
            if (!midiaBuffer) throw new Error(`Dados do ${tipo} inválidos ou ausentes`);

            const resultadoConfig = await FilasConfiguracao.obterConfig(configManager, logger, chatId, tipo);
            const config = resultadoConfig.sucesso ? resultadoConfig.dados : {};

            let resposta;
            if (tipo === 'imagem') {
                const promptFinal = FilasConfiguracao.prepararPrompt(logger, 'imagem', userPrompt, config.modoDescricao);
                const resAI = await FilasProcessadoresMidia.processarImagem(gerenciadorAI, logger, midiaBuffer, promptFinal, config);
                if (!resAI.sucesso) throw resAI.erro;
                resposta = resAI.dados;
            } else if (tipo === 'audio') {
                const resAI = await FilasProcessadoresMidia.processarAudio(gerenciadorAI, logger, midiaBuffer, transacaoId, config);
                if (!resAI.sucesso) throw resAI.erro;
                resposta = resAI.dados;
            } else if (tipo === 'documento') {
                const resAI = await FilasProcessadoresMidia.processarDocumento(gerenciadorAI, logger, midiaBuffer, userPrompt, config);
                if (!resAI.sucesso) throw resAI.erro;
                resposta = resAI.dados;
            }

            await servicoMensagem.enviarMensagemComTransacao({
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
            logger.error(`[${_.capitalize(tipo)}] Erro no job ${transacaoId}: ${erro.message}`);
            cb(erro);
        }
    };

    /**
     * Processador para Vídeos (Fluxo Longo com Upload Google)
     */
    const criarProcessadorVideo = () => async (job, cb) => {
        const { tempFilename, chatId, messageId, messageKey, transacaoId, remetenteName, userPrompt, mimeType } = job;
        let fileUri = null;
        let fileName = null;

        try {
            logger.info(`[Video] Processando ${transacaoId}`);

            const uploadRes = await gerenciadorAI.uploadArquivoGoogle(tempFilename, {
                mimeType: mimeType || 'video/mp4',
                displayName: `Video_${transacaoId}`
            });
            if (!uploadRes.sucesso) throw uploadRes.erro;
            
            fileUri = uploadRes.dados.file.uri;
            fileName = uploadRes.dados.file.name;

            let pronto = false;
            let tentativas = 0;
            while (!pronto && tentativas < 20) {
                const status = await gerenciadorAI.getArquivoGoogle(fileName);
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

            const resultadoConfig = await FilasConfiguracao.obterConfig(configManager, logger, chatId, 'video');
            const config = resultadoConfig.sucesso ? resultadoConfig.dados : {};
            const promptFinal = FilasConfiguracao.prepararPrompt(logger, 'video', userPrompt, config.modoDescricao);

            const resAI = await gerenciadorAI.gerarConteudoDeArquivoUri(fileUri, mimeType, promptFinal, config);
            if (!resAI.sucesso) throw resAI.erro;
            
            const resposta = resAI.dados;

            await servicoMensagem.enviarMensagemComTransacao({
                resposta,
                chatId,
                messageId,
                messageKey,
                transacaoId,
                remetenteName,
                tipo: 'video'
            });

            await FilasUtilitarios.limparArquivo(tempFilename);
            await gerenciadorAI.deleteArquivoGoogle(fileName);

            cb(null, { sucesso: true });
        } catch (erro) {
            logger.error(`[Vídeo] Erro no job ${transacaoId}: ${erro.message}`);
            if (tempFilename) await FilasUtilitarios.limparArquivo(tempFilename);
            if (fileName) await gerenciadorAI.deleteArquivoGoogle(fileName);
            cb(erro);
        }
    };

    return {
        criarProcessadorSimples,
        criarProcessadorVideo
    };
};

module.exports = criarOrquestradorMidia;
