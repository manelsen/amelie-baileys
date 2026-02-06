/**
 * FilasMidia - Versão Lite e Assíncrona via OrquestradorMidia
 * 
 * Substitui o sistema complexo de Bull/Redis por Better-Queue.
 * Mantém a interface pública para não quebrar o resto do sistema.
 */

const Queue = require('better-queue');
const OrquestradorMidia = require('./OrquestradorMidia');

const inicializarFilasMidia = (registrador, gerenciadorAI, gerenciadorConfig, servicoMensagem) => {
    registrador.info('✨ Inicializando Orquestrador de Mídia Assíncrono (Lite)...');

    const orquestrador = OrquestradorMidia(registrador, {
        gerenciadorAI,
        configManager: gerenciadorConfig,
        servicoMensagem
    });

    // Configuração das filas Better-Queue (Em memória, Assíncronas, Concorrência controlada)
    const filas = {
        imagem: new Queue(orquestrador.criarProcessadorSimples('imagem'), { concurrent: 10 }),
        audio: new Queue(orquestrador.criarProcessadorSimples('audio'), { concurrent: 10 }),
        documento: new Queue(orquestrador.criarProcessadorSimples('documento'), { concurrent: 5 }),
        video: new Queue(orquestrador.criarProcessadorVideo(), { concurrent: 2 }) // Vídeo é pesado, menos concorrência
    };

    registrador.info('✅ Filas Better-Queue inicializadas (Imagem: 10, Áudio: 10, Doc: 5, Vídeo: 2)');

    return {
        adicionarImagem: async (dados) => {
            return new Promise((resolve, reject) => {
                filas.imagem.push(dados, (err, result) => err ? reject(err) : resolve(result));
            });
        },

        adicionarVideo: async (dados) => {
            return new Promise((resolve, reject) => {
                filas.video.push(dados, (err, result) => err ? reject(err) : resolve(result));
            });
        },

        adicionarAudio: async (dados) => {
            return new Promise((resolve, reject) => {
                filas.audio.push(dados, (err, result) => err ? reject(err) : resolve(result));
            });
        },

        adicionarDocumento: async (dados) => {
            return new Promise((resolve, reject) => {
                filas.documento.push(dados, (err, result) => err ? reject(err) : resolve(result));
            });
        },

        limparTrabalhosPendentes: async () => {
            registrador.info('[FilasMidia] Limpeza de filas em memória solicitada.');
            // No Better-Queue em memória, os jobs pendentes são limpos automaticamente no restart.
            return true;
        },

        finalizar: () => {
            registrador.info('Sistema de filas de mídia finalizado.');
        }
    };
};

module.exports = inicializarFilasMidia;
