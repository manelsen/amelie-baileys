// FilasCriadores.js

/**
 * FilasCriadores - Funções para criação e gerenciamento de filas
 * 
 * @author Belle Utsch (adaptado por Manel)
 */

const BetterQueue = require('better-queue');
const EventEmitter = require('events');
const _ = require('lodash/fp');
const { Resultado } = require('../../utilitarios/Ferrovia');

/**
 * Wrapper para simular a interface do Bull usando BetterQueue
 */
class QueueWrapper extends EventEmitter {
  constructor(name, options = {}) {
    super();
    this.name = name;
    this.initialOptions = options || {};
    this.queue = null;
    this.processor = null;
    
    // Configurações padrão do BetterQueue baseadas nas opções recebidas
    this.bqOptions = {
      maxRetries: this.initialOptions.defaultJobOptions?.maxRetries || 3,
      retryDelay: this.initialOptions.defaultJobOptions?.retryDelay || 30000,
      afterProcessDelay: this.initialOptions.defaultJobOptions?.afterProcessDelay || 0,
      maxTimeout: this.initialOptions.defaultJobOptions?.timeout || undefined, // Mapeia timeout
      concurrent: 1
    };

    // Tratamento especial para filas que podem não ter processador explícito (ex: problemas)
    if (name && name.includes('problemas')) {
      this._inicializarFilaLog();
    }
  }

  _inicializarFilaLog() {
    this.queue = new BetterQueue((input, cb) => {
      // Apenas consome e loga (ou descarta)
      // console.log(`[${this.name}] Item processado/logado:`, input);
      cb(null, true);
    }, this.bqOptions);
  }

  _inicializarFila(concurrency = 1) {
    if (this.queue) return; // Já inicializada

    const options = { ...this.bqOptions, concurrent: concurrency };
    
    this.queue = new BetterQueue(async (input, cb) => {
      // console.log(`[QueueWrapper:${this.name}] Processando item ${input.id || 'sem_id'}`); // DEBUG
      if (!this.processor) {
        // console.error(`[QueueWrapper:${this.name}] ERRO: Processador não definido!`);
        return cb(new Error('Processador não definido'));
      }

      // Cria objeto Job simulando Bull
      // input pode ser o objeto wrapper {id, data, timestamp} ou os dados diretos
      const job = {
        id: input.id || `job_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        data: input.data || input, // Desembrulha se tiver .data, senão usa o próprio input
        processedOn: Date.now(),
        timestamp: input.timestamp || Date.now(),
        progress: (p) => {
          if (this.queue) this.queue.emit('task_progress', input.id || job.id, p);
          this.emit('progress', job, p);
        }
      };

      this.emit('active', job);

      try {
        // console.log(`[QueueWrapper:${this.name}] Executando processor para job ${job.id}`);
        const result = await this.processor(job);
        // console.log(`[QueueWrapper:${this.name}] Job ${job.id} concluído com sucesso.`);
        this.emit('completed', job, result);
        cb(null, result);
      } catch (error) {
        // console.error(`[QueueWrapper:${this.name}] Job ${job.id} falhou: ${error.message}`);
        this.emit('failed', job, error);
        cb(error);
      }
    }, options);

    // Repassar eventos internos do BetterQueue se necessário
    // this.queue.on('task_failed', ...)
  }

  add(name, data, opts) {
    // Normalizar argumentos (Bull suporta .add(name, data) ou .add(data))
    let jobData = data;
    if (typeof name !== 'string') {
        opts = data;
        jobData = name;
    }
    
    // Se a fila ainda não existe (producer mode ou antes do process), 
    // inicializa com concorrência 1 e sem processador (vai falhar se processar agora, ou buffering?)
    // BetterQueue começa a processar imediatamente. Se não tiver processador, precisamos definir um.
    // Se estamos adicionando, assumimos que eventualmente haverá um processador OU é a fila de problemas.
    if (!this.queue) {
       // Solução: Inicializa um processador que verifica `this.processor` dinamicamente.
       this._inicializarFila(1);
    }

    return new Promise((resolve, reject) => {
        try {
            // Push jobData (dados reais) diretamente
            // console.log(`[QueueWrapper:${this.name}] Adicionando item à fila...`); // DEBUG
            const ticket = this.queue.push(jobData);
            
            // Simular objeto Job retornado pelo Bull para o chamador
            const jobSimulado = {
                id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                data: jobData, // Retorna os dados originais
                timestamp: Date.now()
            };
            
            // Tentar capturar o ID real se o ticket tiver
            if (ticket && ticket.id) jobSimulado.id = ticket.id;
            // console.log(`[QueueWrapper:${this.name}] Item adicionado com ID simulado ${jobSimulado.id}`); // DEBUG

            resolve(jobSimulado);
        } catch (e) {
            // console.error(`[QueueWrapper:${this.name}] Erro ao adicionar: ${e.message}`);
            reject(e);
        }
    });
  }

  process(name, concurrency, handler) {
    // Normalizar argumentos
    let realHandler = handler;
    let realConcurrency = concurrency;
    
    if (typeof name === 'function') {
        realHandler = name;
        realConcurrency = 1;
    } else if (typeof name === 'number') {
        realConcurrency = name;
        realHandler = concurrency;
    } else if (typeof concurrency === 'function') {
        realHandler = concurrency;
        realConcurrency = 1; 
    }
    
    this.processor = realHandler;
    
    // Se fila já existe, atualiza concorrência? (Difícil em BQ após init).
    // Se fila não existe, cria com a concorrência certa.
    if (!this.queue) {
        this._inicializarFila(realConcurrency);
    }
  }

  // Métodos de compatibilidade para Monitoramento (Stubs)
  async getJobCounts() {
    const stats = this.queue ? this.queue.getStats() : {};
    return {
      waiting: 0,
      active: 0,
      completed: stats.total || 0,
      failed: 0,
      delayed: 0
    };
  }

  async getJobs() { return []; }
  async clean() { return []; }
  async empty() { return; }
}

/**
 * CriadoresFilas - Funções puras para criar e configurar filas
 */
const FilasCriadores = {
  /**
   * Cria objetos de fila
   * @param {Object} configFilas - Configuração das filas
   * @returns {Resultado} Filas criadas
   */
  criarFilas: _.curry((configFilas) => {
    try {
      // Usar composição para criar as filas (Wrapper)
      const filas = {
        imagem: {
          upload:        new QueueWrapper('midia-upload-imagem', configFilas),
          analise:       new QueueWrapper('midia-analise-imagem', configFilas),
          principal:     new QueueWrapper('midia-principal-imagem', {
            ...configFilas,
            defaultJobOptions: {
              ...configFilas.defaultJobOptions,
              timeout: 60000 // 1 minuto
            }
          })
        },
        audio: {
            principal: new QueueWrapper('midia-principal-audio', {
                ...configFilas,
                defaultJobOptions: {
                  ...configFilas.defaultJobOptions,
                  timeout: 120000 // 2 minutos para transcrição
                }
              })
        },
        documento: {
            principal: new QueueWrapper('midia-principal-documento', {
                ...configFilas,
                defaultJobOptions: {
                  ...configFilas.defaultJobOptions,
                  timeout: 300000 // 5 minutos para leitura e análise
                }
              })
        },
        video: {
          upload:        new QueueWrapper('midia-upload-video', configFilas),
          processamento: new QueueWrapper('midia-processamento-video', configFilas),
          analise:       new QueueWrapper('midia-analise-video', configFilas),
          principal:     new QueueWrapper('midia-principal-video', {
            ...configFilas,
            defaultJobOptions: {
              ...configFilas.defaultJobOptions,
              timeout: 300000 // 5 minutos
            }
          })
        },
        problemas: new QueueWrapper('midia-problemas', configFilas)
      };

      return Resultado.sucesso(filas);
    } catch (erro) {
      return Resultado.falha(erro);
    }
  }),

  /**
   * Configura eventos para uma fila
   * @param {Object} registrador - Logger
   * @param {QueueWrapper} fila - Fila a ser configurada
   * @param {string} nomeEtapa - Nome da etapa para logs
   * @param {QueueWrapper} filaProblemas - Fila para registrar problemas
   * @returns {QueueWrapper} Fila configurada
   */
  configurarEventos: _.curry((registrador, fila, nomeEtapa, filaProblemas) => {
    fila.on('active', (job) => {
      // Opcional: Logar início
    });

    fila.on('progress', (job, progress) => {
      // Opcional: Logar progresso
    });

    fila.on('completed', (job, result) => {
      const duracao = Date.now() - (job.processedOn || job.timestamp);
      // Opcional: Logar sucesso
    });

    fila.on('failed', (job, error) => {
      const duracao = Date.now() - (job.processedOn || job.timestamp);
      registrador.error(`[${nomeEtapa}] Job ${job.id} falhou após ${duracao}ms: ${error.message}`);

      // Registrar falha para análise posterior
      filaProblemas.add('falha-job', {
        etapa: nomeEtapa,
        jobId: job.id,
        erro: error.message,
        stack: error.stack,
        data: job.data ? _.omit(['imageData', 'tempFilename'], job.data) : null,
        timestamp: Date.now()
      });
      // Removido .catch pois BQ.push retorna objeto/ticket, não promise (depende da versao, mas geralmente é sync ou callback).
      // Se QueueWrapper.add retornar promise ou nada, precisamos ajustar. 
      // BQ push retorna id ou ticket. Não é promise. 
      // Então removemos o .catch() aqui.
    });

    fila.on('error', (error) => {
      registrador.error(`[${nomeEtapa}] Erro na fila: ${error.message}`);
    });

    // Stalled não existe exatamente no BQ em memória, mas mantemos o listener vazio ou removido
    
    return fila;
  }),

  /**
   * Configura todas as filas com seus respectivos eventos
   * @param {Object} registrador - Logger
   * @param {Object} filas - Estrutura de filas
   * @returns {Object} Filas configuradas
   */
  configurarTodasFilas: _.curry((registrador, filas) => {
    // Usando composição para configurar todas as filas
    return _.pipe(
      // Configurar filas de imagem
      filas => ({
        ...filas,
        imagem: {
          upload: FilasCriadores.configurarEventos(registrador, filas.imagem.upload, 'Upload-Imagem', filas.problemas),
          analise: FilasCriadores.configurarEventos(registrador, filas.imagem.analise, 'Análise-Imagem', filas.problemas),
          principal: FilasCriadores.configurarEventos(registrador, filas.imagem.principal, 'Principal-Imagem', filas.problemas)
        }
      }),
      // Configurar filas de áudio
      filas => ({
        ...filas,
        audio: {
            principal: FilasCriadores.configurarEventos(registrador, filas.audio.principal, 'Principal-Áudio', filas.problemas)
        }
      }),
      // Configurar filas de documento
      filas => ({
        ...filas,
        documento: {
            principal: FilasCriadores.configurarEventos(registrador, filas.documento.principal, 'Principal-Documento', filas.problemas)
        }
      }),
      // Configurar filas de vídeo
      filas => ({
        ...filas,
        video: {
          upload: FilasCriadores.configurarEventos(registrador, filas.video.upload, 'Upload-Vídeo', filas.problemas),
          processamento: FilasCriadores.configurarEventos(registrador, filas.video.processamento, 'Processamento-Vídeo', filas.problemas),
          analise: FilasCriadores.configurarEventos(registrador, filas.video.analise, 'Análise-Vídeo', filas.problemas),
          principal: FilasCriadores.configurarEventos(registrador, filas.video.principal, 'Principal-Vídeo', filas.problemas)
        }
      })
    )(filas);
  })
};

module.exports = FilasCriadores;
