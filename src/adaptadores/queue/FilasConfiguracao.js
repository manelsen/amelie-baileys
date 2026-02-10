// FilasConfiguracao.js

/**
 * FilasConfiguracao - Funções para gerenciamento de configurações
 * 
 * @author Belle Utsch (adaptado por Manel)
 */

const _ = require('lodash/fp');
const { Resultado } = require('../../utilitarios/Ferrovia');

const {
  obterInstrucaoImagem,
  obterInstrucaoImagemCurta,
  obterInstrucaoVideo,
  obterInstrucaoVideoCurta,
  obterInstrucaoVideoLegenda,
  obterPromptImagem,
  obterPromptImagemCurto,
  obterPromptVideo,
  obterPromptVideoCurto,
  obterPromptVideoLegenda
} = require('../../config/InstrucoesSistema');

/**
 * Configuracao - Funções puras para configuração do sistema
 */
const FilasConfiguracao = {
  /**
   * Cria configuração das filas
   * @returns {Object} Configuração de filas
   */
  criarConfigFilas: () => ({
    defaultJobOptions: {
      maxRetries: 3,
      retryDelay: 30000,
      afterProcessDelay: 100 // Pequeno delay para aliviar CPU
    }
  }),

  /**
   * Obtém configurações para processamento de mídia
   * @param {Object} gerenciadorConfig - Gerenciador de configurações
   * @param {Object} registrador - Logger para registro
   * @param {string} chatId - ID do chat
   * @param {string} tipoMidia - Tipo de mídia
   * @returns {Promise<Resultado>} Configurações
   */
  obterConfig: _.curry(async (gerenciadorConfig, registrador, chatId, tipoMidia) => {
    try {
      const config = await gerenciadorConfig.obterConfig(chatId);

      // Verificação explícita para legenda ativa
      if (config.usarLegenda === true && tipoMidia === 'video') {
        registrador.debug(`[Config] Modo legenda ativo para vídeo.`);
        config.modoDescricao = 'legenda';
      }

      const modoDescricao = config.modoDescricao || 'curto';
      

      // Obter a instrução padrão para a mídia/modo
      const obterInstrucaoPadrao = _.cond([
        [_.matches({ tipo: 'imagem', modo: 'curto' }), _.constant(obterInstrucaoImagemCurta())],
        [_.matches({ tipo: 'imagem', modo: 'longo' }), _.constant(obterInstrucaoImagem())],
        [_.matches({ tipo: 'video', modo: 'curto' }), _.constant(obterInstrucaoVideoCurta())],
        [_.matches({ tipo: 'video', modo: 'longo' }), _.constant(obterInstrucaoVideo())],
        [_.matches({ tipo: 'video', modo: 'legenda' }), _.constant(obterInstrucaoVideoLegenda())],
        [_.stubTrue, _.constant(null)] // Caso padrão (sem instrução específica)
      ]);
      const instrucaoPadraoMidia = obterInstrucaoPadrao({ tipo: tipoMidia, modo: modoDescricao });

      // Não combinar aqui. Retornar ambos separadamente.
      const promptPersonalizado = config.systemInstructions; // Pode ser nulo
      
      

      return Resultado.sucesso({
        temperature: config.temperature || 0.7,
        topK: config.topK || 1,
        topP: config.topP || 0.95,
        maxOutputTokens: config.maxOutputTokens || 1024,
        model: "gemini-2.0-flash",
        systemInstructions: promptPersonalizado, // Retorna SÓ o prompt personalizado (ou null)
        instrucaoPadraoMidia: instrucaoPadraoMidia, // Retorna a instrução padrão separadamente
        modoDescricao,
        usarLegenda: config.usarLegenda
      });
    } catch (erro) {
      registrador.warn(`Erro ao obter configurações: ${erro.message}, usando padrão`);

      // Configuração padrão
      return Resultado.sucesso({
        temperature: 0.9,
        topK: 1,
        topP: 0.95,
        maxOutputTokens: 1024,
        model: "gemini-2.0-flash",
        modoDescricao: 'curto'
      });
    }
  }),

  /**
   * Prepara o prompt do usuário com base no modo
   * @param {Object} registrador - Logger
   * @param {string} tipoMidia - Tipo de mídia
   * @param {string} promptUsuario - Prompt original
   * @param {string} modoDescricao - Modo de descrição
   * @returns {string} Prompt processado
   */
  prepararPrompt: _.curry((registrador, tipoMidia, promptUsuario, modoDescricao) => {
    if (_.isEmpty(promptUsuario)) {
      // Verificação mais explícita para o modo legenda
      if (tipoMidia === 'video' && modoDescricao === 'legenda') {
        registrador.debug('[Config] Modo legenda ativo para vídeo.');
        return obterPromptVideoLegenda();
      }

      // Resto do código com o cond original
      return _.cond([
        [_.matches({ tipo: 'imagem', modo: 'longo' }), () => {
          
          return obterPromptImagem();
        }],
        [_.matches({ tipo: 'imagem', modo: 'curto' }), () => {
          
          return obterPromptImagemCurto();
        }],
        [_.matches({ tipo: 'video', modo: 'longo' }), () => {
          
          return obterPromptVideo();
        }],
        [_.matches({ tipo: 'video', modo: 'curto' }), () => {
          
          return obterPromptVideoCurto();
        }],
        [_.matches({ tipo: 'video', modo: 'legenda' }), () => {
          
          return obterPromptVideoLegenda();
        }],
        [_.stubTrue, _.constant(promptUsuario)]
      ])({ tipo: tipoMidia, modo: modoDescricao });
    }

    return promptUsuario;
  })
};

module.exports = FilasConfiguracao;