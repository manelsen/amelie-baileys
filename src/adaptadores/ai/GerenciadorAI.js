/**
 * AdaptadorAI - Módulo funcional para interação com modelos de IA (Google Generative AI)
 */

const _ = require('lodash/fp');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const NodeCache = require('node-cache');
const Bottleneck = require('bottleneck');
const {
  obterInstrucaoPadrao,
} = require('../../config/InstrucoesSistema');
const { salvarConteudoBloqueado } = require('../../utilitarios/ArquivoUtils');
const { Resultado } = require('../../utilitarios/Ferrovia');
const { criarCircuitBreaker } = require('./CircuitBreaker');
const GoogleFileManager = require('./GoogleFileManager');
const ProcessadorVisualAI = require('./processadores/ProcessadorVisualAI');
const ProcessadorAudioAI = require('./processadores/ProcessadorAudioAI');
const ProcessadorDocumentoAI = require('./processadores/ProcessadorDocumentoAI');

// --- Constantes ---
const DEFAULT_MODEL = "gemini-3-flash-preview";
const CACHE_TTL_SEGUNDOS = 3600;
const CACHE_MAX_ENTRADAS = 500;
const RATE_LIMITER_MAX_CONCORRENTE = 20;
const RATE_LIMITER_MIN_TEMPO_MS = 1000 / 30;
const TIMEOUT_API_GERAL_MS = 90000;
const TIMEOUT_API_UPLOAD_MS = 180000;
const MAX_TENTATIVAS_API = 5;
const TEMPO_ESPERA_BASE_MS = 5000;
const CIRCUIT_BREAKER_LIMITE_FALHAS = 5;
const CIRCUIT_BREAKER_TEMPO_RESET_MS = 60000;

// --- Helpers ---
const gerarHash = (data) => crypto.createHash('sha256').update(data || '').digest('hex');

const limparResposta = _.pipe(
  _.toString,
  _.replace(/^(?:amélie|amelie):[\s]*/gi, ''),
  _.replace(/[*_]/g, ''),
  _.replace(/^#+\s*/gm, ''),
  _.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
  _.replace(/^[-*]\s+/gm, ''),
  _.replace(/\r\n|\r|\n{2,}/g, '\n\n'),
  _.trim
);

const criarChaveCache = async (tipo, payload, config) => {
  const configHash = gerarHash(JSON.stringify({
    model: config.model || DEFAULT_MODEL,
    temperature: config.temperature,
    systemInstructions: config.systemInstructions
  }));

  let conteudoHash;
  switch (tipo) {
    case 'texto': conteudoHash = gerarHash(payload.texto); break;
    case 'imagem':
    case 'audio':
    case 'documentoInline': conteudoHash = gerarHash((payload.dadosAnexo?.data || '') + (payload.prompt || '')); break;
    case 'documentoArquivo':
    case 'video': conteudoHash = gerarHash((payload.caminhoArquivo || '') + (payload.prompt || '')); break;
    default: conteudoHash = 'desconhecido';
  }
  return `${tipo}_${conteudoHash}_${configHash}`;
};

const criarAdaptadorAI = (dependencias) => {
  const { registrador, apiKey } = dependencias;
  const genAI = new GoogleGenerativeAI(apiKey);
  const cacheRespostas = new NodeCache({ stdTTL: CACHE_TTL_SEGUNDOS, maxKeys: CACHE_MAX_ENTRADAS, useClones: false });
  const rateLimiter = new Bottleneck({ maxConcurrent: RATE_LIMITER_MAX_CONCORRENTE, minTime: RATE_LIMITER_MIN_TEMPO_MS });
  const circuitBreaker = criarCircuitBreaker({ limiteFalhas: CIRCUIT_BREAKER_LIMITE_FALHAS, tempoResetMs: CIRCUIT_BREAKER_TEMPO_RESET_MS });

  const executarComResiliencia = async (nome, fn, timeout = TIMEOUT_API_GERAL_MS) => {
    let tentativas = 0;
    while (tentativas < MAX_TENTATIVAS_API) {
      if (!circuitBreaker.podeExecutar()) return Resultado.falha(new Error("IA Indisponível (CB)"));
      try {
        const res = await Promise.race([
          rateLimiter.schedule(() => fn()),
          new Promise((_, r) => setTimeout(() => r(new Error(`Timeout ${timeout}ms em ${nome}`)), timeout))
        ]);
        circuitBreaker.registrarSucesso();
        return Resultado.sucesso(res);
      } catch (err) {
        tentativas++;
        registrador.warn(`[AI][${nome}] Tentativa ${tentativas} falhou: ${err.message}`);
        circuitBreaker.registrarFalha();
        if (tentativas < MAX_TENTATIVAS_API && (err.message.includes('503') || err.message.includes('Timeout'))) {
          await new Promise(r => setTimeout(r, TEMPO_ESPERA_BASE_MS * Math.pow(2, tentativas - 1)));
          continue;
        }
        return Resultado.falha(err);
      }
    }
    return Resultado.falha(new Error("Excedeu tentativas"));
  };

  const processarRespostaIA = (res, tipo, origem) => {
    if (res.response?.promptFeedback?.blockReason || res.response?.candidates?.[0]?.finishReason === 'SAFETY') {
      return Resultado.falha(new Error("Conteúdo bloqueado por SAFETY"));
    }
    const texto = res.response?.text();
    if (!texto) return Resultado.falha(new Error("Resposta vazia"));
    return Resultado.sucesso(limparResposta(texto));
  };

  const verificarCache = async (tipo, payload, config, cache, reg) => {
    try {
      const chave = await criarChaveCache(tipo, payload, config);
      const hit = cache.get(chave);
      if (hit) { reg.info(`[Cache] HIT ${tipo}`); return Resultado.sucesso({ hit: true, valor: hit, chaveCache: chave }); }
      return Resultado.sucesso({ hit: false, chaveCache: chave });
    } catch (e) { return Resultado.falha(e); }
  };

  const obterModeloGenerico = (cfg, defaultInstruction) => genAI.getGenerativeModel({
    model: cfg.model || DEFAULT_MODEL,
    generationConfig: _.pick(['temperature', 'topK', 'topP', 'maxOutputTokens'], cfg),
    systemInstruction: cfg.systemInstructions || defaultInstruction
  });

  const componentesBase = {
    obterModelo: (cfg) => obterModeloGenerico(cfg, obterInstrucaoPadrao()),
    executarResiliente: executarComResiliencia,
    verificarCache,
    cache: cacheRespostas
  };

  const fileManager = new GoogleFileManager(registrador, apiKey, executarComResiliencia);
  const processadorVisual = new ProcessadorVisualAI(registrador, { ...componentesBase, fileManager });
  const processadorAudio = new ProcessadorAudioAI(registrador, componentesBase);
  const processadorDoc = new ProcessadorDocumentoAI(registrador, { ...componentesBase, fileManager });

  // Injetar finalizador comum
  [processadorVisual, processadorAudio, processadorDoc].forEach(p => {
    p.finalizarProcessamento = async (res, tipo, cfg, chave) => {
      const resProc = processarRespostaIA(res, tipo, cfg.dadosOrigem);
      if (resProc.sucesso && chave) cacheRespostas.set(chave, resProc.dados);
      return resProc;
    };
  });

  return {
    processarTexto: async (texto, config) => {
      const resCache = await verificarCache('texto', { texto }, config, cacheRespostas, registrador);
      if (resCache.sucesso && resCache.dados.hit) return Resultado.sucesso(resCache.dados.valor);
      const modelo = obterModeloGenerico(config, obterInstrucaoPadrao());
      const resExec = await executarComResiliencia('texto', () => modelo.generateContent(texto));
      if (!resExec.sucesso) return resExec;
      const resProc = processarRespostaIA(resExec.dados, 'texto', config.dadosOrigem);
      if (resProc.sucesso && resCache.dados?.chaveCache) cacheRespostas.set(resCache.dados.chaveCache, resProc.dados);
      return resProc;
    },
    processarImagem: (d, p, c) => processadorVisual.processarImagem(d, p, c),
    processarVideo: (path, p, c) => processadorVisual.processarVideo(path, p, c),
    processarAudio: (d, id, c) => processadorAudio.processarAudio(d, id, c),
    processarDocumentoInline: (d, p, c) => processadorDoc.processarDocumentoInline(d, p, c),
    processarDocumentoArquivo: (path, p, c) => processadorDoc.processarDocumentoArquivo(path, p, c),
    uploadArquivoGoogle: (p, o) => fileManager.upload(p, o),
    deleteArquivoGoogle: (n) => fileManager.deletar(n),
    getArquivoGoogle: (n) => fileManager.obterStatus(n),
    gerarConteudoDeArquivoUri: async (uri, mime, prompt, config) => {
      const modelo = obterModeloGenerico(config, obterInstrucaoPadrao());
      const resExec = await executarComResiliencia('uri', () => modelo.generateContent([{ fileData: { mimeType: mime, fileUri: uri } }, { text: prompt }]));
      return processarRespostaIA(resExec.dados, config.tipoMidia || 'arquivo', config.dadosOrigem);
    }
  };
};

module.exports = criarAdaptadorAI;
