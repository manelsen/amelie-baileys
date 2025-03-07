/**
 * FilaProcessador - Gerencia filas de processamento assíncrono
 * 
 * Este módulo centraliza o gerenciamento de filas de processamento,
 * especialmente para operações demoradas como processamento de vídeo.
 */

const Queue = require('bull');
const fs = require('fs');
const path = require('path');
const toobusy = require('toobusy-js'); // Adicione esta dependência com npm install toobusy-js

class FilaProcessador {
  /**
   * Cria uma instância do gerenciador de filas
   * @param {Object} registrador - Objeto logger para registro de eventos
   * @param {Object} gerenciadorAI - Instância do gerenciador de IA
   * @param {Object} clienteWhatsApp - Instância do cliente WhatsApp
   * @param {Object} opcoes - Opções de configuração
   */
  constructor(registrador, gerenciadorAI, clienteWhatsApp, opcoes = {}) {
    this.registrador = registrador;
    this.gerenciadorAI = gerenciadorAI;
    this.clienteWhatsApp = clienteWhatsApp;
    this.opcoes = {
      enviarRespostaDireta: true,
      ...opcoes
    };
    
    // Callback para retornar resultados ao invés de enviar diretamente
    this.resultCallback = null;
    
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    };
    
    // Configuração comum para todas as filas
    const defaultConfig = {
      redis: redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    };
    
    // Criação de filas separadas para cada etapa do processamento
    this.videoUploadQueue = new Queue('video-upload', defaultConfig);
    this.videoProcessingCheckQueue = new Queue('video-processing-check', defaultConfig);
    this.videoAnalysisQueue = new Queue('video-analysis', defaultConfig);
    
    // Fila principal para compatibilidade com código existente
    this.videoQueue = new Queue('video-processing', {
      ...defaultConfig,
      defaultJobOptions: {
        ...defaultConfig.defaultJobOptions,
        timeout: 180000 // 3 minutos para a fila principal
      }
    });
    
    // Fila para vídeos problemáticos
    this.problemVideosQueue = new Queue('problem-videos', defaultConfig);
    
    this.configurarProcessadores();
    this.iniciarMonitoramento();
    
    // Configurar monitoramento do event loop
    toobusy.maxLag(500); // Configurar o limite máximo de lag (em ms)
    this.iniciarMonitoramentoEventLoop();
    
    this.registrador.info('Sistema de filas inicializado com processamento em estágios');
  }
  
  /**
   * Define o callback para receber os resultados do processamento
   * @param {Function} callback - Função a ser chamada com os resultados
   */
  setResultCallback(callback) {
    this.resultCallback = callback;
    this.registrador.info('✅ Callback de resposta configurado para o processador de vídeos');
  }

  /**
   * Inicia o monitoramento do event loop
   */
  iniciarMonitoramentoEventLoop() {
    // Monitorar o event loop a cada 30 segundos
    setInterval(() => {
      const lag = toobusy.lag();
      this.registrador.debug(`Event loop lag: ${lag}ms`);
      
      // Alertar se o lag for alto
      if (lag > 300) {
        this.registrador.warn(`⚠️ Event loop lag elevado: ${lag}ms`);
      }
    }, 30000);
    
    // Registrar quando o sistema estiver muito ocupado
    toobusy.onLag((currentLag) => {
      this.registrador.warn(`🔥 Event loop crítico! Lag atual: ${currentLag}ms`);
    });
  }

  /**
   * Salva arquivo bloqueado por segurança para análise posterior
   * @param {string} caminhoArquivo - Caminho do arquivo original
   * @param {Object} dados - Dados do job e do erro
   * @returns {Promise<boolean>} Sucesso da operação
   */
  async salvarArquivoBloqueado(caminhoArquivo, dados) {
    try {
      // Criar diretório blocked se não existir
      const diretorioBlocked = path.join(process.cwd(), 'blocked');
      if (!fs.existsSync(diretorioBlocked)) {
        fs.mkdirSync(diretorioBlocked, { recursive: true });
        this.registrador.info(`Diretório para arquivos bloqueados criado: ${diretorioBlocked}`);
      }
      
      // Verificar se o arquivo existe
      if (!fs.existsSync(caminhoArquivo)) {
        this.registrador.warn(`Arquivo ${caminhoArquivo} não existe para ser salvo como bloqueado`);
        return false;
      }
      
      // Gerar nome único para o arquivo
      const extensao = path.extname(caminhoArquivo);
      const timestamp = new Date().toISOString().replace(/[:.-]/g, '_');
      const nomeArquivoBloqueado = `blocked_${timestamp}${extensao}`;
      const caminhoArquivoBloqueado = path.join(diretorioBlocked, nomeArquivoBloqueado);
      
      // Copiar o arquivo
      fs.copyFileSync(caminhoArquivo, caminhoArquivoBloqueado);
      
      // Criar objeto de metadados
      const metadados = {
        arquivoOriginal: caminhoArquivo,
        arquivoBloqueado: caminhoArquivoBloqueado,
        timestamp: new Date().toISOString(),
        tipoArquivo: dados.mimeType || 'desconhecido',
        erro: dados.erro || 'Erro desconhecido',
        remetente: {
          id: dados.senderNumber || 'desconhecido',
          // Outras informações do remetente podem ser adicionadas aqui
        },
        grupo: dados.chatId?.endsWith('@g.us') ? {
          id: dados.chatId,
          // Outras informações do grupo podem ser adicionadas aqui
        } : null,
        mensagem: {
          id: dados.messageId || 'desconhecido',
          prompt: dados.userPrompt || '',
        },
        transacaoId: dados.transacaoId || 'desconhecido'
      };
      
      // Salvar metadados em um arquivo JSON
      const nomeArquivoMetadados = `${path.basename(nomeArquivoBloqueado, extensao)}.json`;
      const caminhoArquivoMetadados = path.join(diretorioBlocked, nomeArquivoMetadados);
      fs.writeFileSync(
        caminhoArquivoMetadados,
        JSON.stringify(metadados, null, 2),
        'utf8'
      );
      
      this.registrador.warn(`⚠️ Arquivo bloqueado por segurança salvo em: ${caminhoArquivoBloqueado}`);
      this.registrador.warn(`⚠️ Metadados do arquivo bloqueado salvos em: ${caminhoArquivoMetadados}`);
      
      return true;
    } catch (erro) {
      this.registrador.error(`Erro ao salvar arquivo bloqueado: ${erro.message}`);
      return false;
    }
  }

  /**
   * Configura os processadores das filas
   */
  configurarProcessadores() {
    // 1. Processador para upload de vídeo
    this.videoUploadQueue.process('upload-video', 3, async (job) => {
      const { tempFilename, chatId, messageId, mimeType, userPrompt, senderNumber, transacaoId, remetenteName } = job.data;
      
      try {
        this.registrador.info(`[Etapa 1] Iniciando upload de vídeo: ${tempFilename} (Job ${job.id})`);
        
        // Verificar se o arquivo existe
        if (!fs.existsSync(tempFilename)) {
          throw new Error("Arquivo temporário do vídeo não encontrado");
        }
        
        // Fazer upload para o Google AI
        const respostaUpload = await this.gerenciadorAI.gerenciadorArquivos.uploadFile(tempFilename, {
          mimeType: mimeType || 'video/mp4',
          displayName: "Vídeo Enviado"
        });
        
        this.registrador.info(`[Etapa 1] Upload concluído, nome do arquivo: ${respostaUpload.file.name}`);
        
        // Adicionar à fila de verificação de processamento
        await this.videoProcessingCheckQueue.add('check-processing', {
          fileName: respostaUpload.file.name,
          tempFilename,
          chatId,
          messageId,
          mimeType,
          userPrompt,
          senderNumber,
          transacaoId,
          remetenteName,
          uploadTimestamp: Date.now()
        });
        
        return { success: true, fileName: respostaUpload.file.name };
      } catch (erro) {
        this.registrador.error(`[Etapa 1] Erro no upload do vídeo: ${erro.message}`, { erro, jobId: job.id });
        
        // Verificar se é um erro de segurança
        if (erro.message.includes('SAFETY') || erro.message.includes('safety') || 
            erro.message.includes('blocked') || erro.message.includes('Blocked')) {
          await this.salvarArquivoBloqueado(tempFilename, {
            mimeType,
            erro: erro.message,
            senderNumber,
            chatId,
            messageId,
            userPrompt,
            transacaoId,
            jobId: job.id
          });
          
          // Notificar via callback ou diretamente
          if (this.resultCallback) {
            this.resultCallback({
              resposta: "Este conteúdo não pôde ser processado por questões de segurança.",
              chatId,
              messageId,
              senderNumber,
              transacaoId,
              isError: true,
              errorType: 'safety',
              remetenteName
            });
          } else if (this.opcoes.enviarRespostaDireta) {
            await this.clienteWhatsApp.enviarMensagem(
              senderNumber, 
              "Este conteúdo não pôde ser processado por questões de segurança."
            );
          }
        } else {
          // Notificar sobre outros tipos de erro
          const errorMessage = this.obterMensagemErroAmigavel(erro);
          
          if (this.resultCallback) {
            this.resultCallback({
              resposta: errorMessage,
              chatId,
              messageId,
              senderNumber,
              transacaoId,
              isError: true,
              errorType: 'general',
              remetenteName
            });
          } else if (this.opcoes.enviarRespostaDireta) {
            await this.clienteWhatsApp.enviarMensagem(senderNumber, errorMessage);
          }
        }
        
        // Limpar arquivo temporário em caso de erro (apenas se não for bloqueio de segurança)
        if (!erro.message.includes('SAFETY') && !erro.message.includes('safety')) {
          this.limparArquivoTemporario(tempFilename);
        }
        
        throw erro;
      }
    });
    
// 2. Processador para verificação do estado de processamento
this.videoProcessingCheckQueue.process('check-processing', 3, async (job) => {
  const { fileName, tempFilename, chatId, messageId, mimeType, userPrompt, senderNumber, transacaoId, uploadTimestamp, remetenteName, tentativas = 0 } = job.data;
  
  try {
    this.registrador.info(`[Etapa 2] Verificando processamento do vídeo: ${fileName} (Job ${job.id}), tentativa ${tentativas + 1}`);
    
    // Obter estado atual do arquivo
    let arquivo = await this.gerenciadorAI.gerenciadorArquivos.getFile(fileName);
    const maxTentativas = 12;
    
    // Controle para mensagens de progresso - só enviar uma a cada 20 segundos
    const ultimaMensagemTimestamp = job.data.ultimaMensagemTimestamp || 0;
    const enviarAtualizacao = Date.now() - ultimaMensagemTimestamp > 20000;
    
    // Verificar o estado do arquivo
    if (arquivo.state === "PROCESSING") {
      // Se ainda está processando e não excedeu o limite de tentativas, reagendar
      if (tentativas < maxTentativas) {
        this.registrador.info(`[Etapa 2] Vídeo ainda em processamento, reagendando verificação... (tentativa ${tentativas + 1})`);
        
        // Enviar mensagem de progresso apenas se necessário
        if (enviarAtualizacao) {
          const mensagemProgresso = "Seu vídeo está sendo processado... isso pode levar alguns minutos para vídeos longos ou complexos.";
          
          if (this.resultCallback) {
            this.resultCallback({
              resposta: mensagemProgresso,
              chatId,
              messageId,
              senderNumber,
              transacaoId,
              isProgress: true,
              remetenteName
            });
          } else if (this.opcoes.enviarRespostaDireta) {
            await this.clienteWhatsApp.enviarMensagem(senderNumber, mensagemProgresso);
          }
          
          // Reagendar esta verificação após 10 segundos
          await this.videoProcessingCheckQueue.add('check-processing', {
            ...job.data,
            tentativas: tentativas + 1,
            ultimaMensagemTimestamp: Date.now()
          }, { delay: 10000 });
        } else {
          // Reagendar sem enviar mensagem
          await this.videoProcessingCheckQueue.add('check-processing', {
            ...job.data,
            tentativas: tentativas + 1
          }, { delay: 10000 });
        }
        
        return { success: true, status: "PROCESSING", tentativas: tentativas + 1 };
      } else {
        throw new Error("Tempo máximo de processamento excedido");
      }
    } else if (arquivo.state === "FAILED") {
      throw new Error("Falha no processamento do vídeo pelo Google AI");
    } 
    
    // Estados válidos para prosseguir: SUCCEEDED ou ACTIVE
    if (arquivo.state !== "SUCCEEDED" && arquivo.state !== "ACTIVE") {
      throw new Error(`Estado inesperado do arquivo: ${arquivo.state}`);
    }
    
    this.registrador.info(`[Etapa 2] Vídeo processado com sucesso, estado: ${arquivo.state}`);
    
    // Adicionar à fila de análise
    await this.videoAnalysisQueue.add('analyze-video', {
      fileName,
      tempFilename,
      chatId,
      messageId,
      mimeType,
      userPrompt,
      senderNumber,
      transacaoId,
      fileState: arquivo.state,
      fileUri: arquivo.uri,
      fileMimeType: arquivo.mimeType,
      remetenteName
    });
    
    return { success: true, status: arquivo.state };
  } catch (erro) {
    this.registrador.error(`[Etapa 2] Erro na verificação do processamento: ${erro.message}`, { erro, jobId: job.id });
    
    // Verificar se é um erro de segurança
    if (erro.message.includes('SAFETY') || erro.message.includes('safety') || 
        erro.message.includes('blocked') || erro.message.includes('Blocked')) {
      await this.salvarArquivoBloqueado(tempFilename, {
        mimeType,
        erro: erro.message,
        senderNumber,
        chatId,
        messageId,
        userPrompt,
        transacaoId,
        jobId: job.id
      });
      
      // Notificar via callback ou diretamente
      if (this.resultCallback) {
        this.resultCallback({
          resposta: "Este conteúdo não pôde ser processado por questões de segurança.",
          chatId,
          messageId,
          senderNumber,
          transacaoId,
          isError: true,
          errorType: 'safety',
          remetenteName
        });
      } else if (this.opcoes.enviarRespostaDireta) {
        await this.clienteWhatsApp.enviarMensagem(
          senderNumber, 
          "Este conteúdo não pôde ser processado por questões de segurança."
        );
      }
    } else {
      // Notificar sobre outros tipos de erro
      const errorMessage = this.obterMensagemErroAmigavel(erro);
      
      if (this.resultCallback) {
        this.resultCallback({
          resposta: errorMessage,
          chatId,
          messageId,
          senderNumber,
          transacaoId,
          isError: true,
          errorType: 'general',
          remetenteName
        });
      } else if (this.opcoes.enviarRespostaDireta) {
        await this.clienteWhatsApp.enviarMensagem(senderNumber, errorMessage);
      }
    }
    
    // Limpar arquivo temporário em caso de erro (apenas se não for bloqueio de segurança)
    if (!erro.message.includes('SAFETY') && !erro.message.includes('safety')) {
      this.limparArquivoTemporario(tempFilename);
    }
    
    // Tentar excluir o arquivo do Google AI em caso de erro
    try {
      await this.gerenciadorAI.gerenciadorArquivos.deleteFile(fileName);
    } catch (errDelete) {
      this.registrador.warn(`Não foi possível excluir o arquivo remoto: ${errDelete.message}`);
    }
    
    throw erro;
  }
});
    
    // 3. Processador para análise do vídeo
    this.videoAnalysisQueue.process('analyze-video', 3, async (job) => {
      const { 
        fileName, tempFilename, chatId, messageId, mimeType, userPrompt, senderNumber, 
        transacaoId, fileState, fileUri, fileMimeType, remetenteName 
      } = job.data;
      
      try {
        this.registrador.info(`[Etapa 3] Iniciando análise do vídeo: ${fileName} (Job ${job.id})`);
        
        // Obter configurações do usuário
        const config = await this.obterConfigProcessamento(chatId);
        
        // Obter modelo
        const modelo = this.gerenciadorAI.obterOuCriarModelo(config);
        
        // Preparar partes de conteúdo
        const partesConteudo = [
          {
            fileData: {
              mimeType: fileMimeType,
              fileUri: fileUri
            }
          },
          {
            text: (config.systemInstructions || `Seu nome é Amélie. Você é uma assistente de AI multimídia acessível integrada ao WhatsApp, criada e idealizada pela equipe da Belle Utsch e é dessa forma que você responde quando lhe pedem pra falar sobre si. 
        
        Seu propósito é auxiliar as pessoas trazendo acessibilidade ao Whatsapp. Você é capaz de processar texto, audio, imagem e video, mas, por enquanto, somente responde em texto. 

        Sua transcrição de audios, quando ativada, é verbatim. Transcreva o que foi dito, palavra a palavra.

        Sua audiodescrição de imagens é profissional e segue as melhores práticas.
        
        Seus comandos podem ser encontrados digitando !ajuda. 
        
        Se alguém perguntar, aqui está sua lista de comandos: 
        !cego - Aplica configurações para usuários com deficiência visual; 
        !audio - Liga/desliga a transcrição de áudio; 
        !video - Liga/desliga a interpretação de vídeo; 
        !imagem - Liga/desliga a audiodescrição de imagem; 
        !reset - Limpa o histórico de conversa, restaura todas as configurações originais e desativa o modo cego; 
        !prompt set <nome> <texto> - Define uma nova personalidade; 
        !prompt get <nome> - Mostra uma personalidade existente; 
        !prompt list - Lista todas as personalidades; 
        !prompt use <nome> - Usa uma personalidade específica; 
        !prompt clear - Remove a personalidade ativa; 
        !config set <param> <valor> - Define um parâmetro de configuração; 
        !config get [param] - Mostra a configuração atual; 
        !users - Lista os usuários do grupo; 
        !ajuda - Mostra a mensagem de ajuda. 
        
        Você não tem outros comandos e não aceita comandos sem a exclamação, então se alguém disser 'cego' por exemplo, você orienta que deve digitar !cego.         
        Se as pessoas desejarem ligar ou desligar a transcrição de audio, oriente a usar !audio. Isso é muito importante, porque há pessoas cegas nos grupos e podem ter dificuldade de usar comandos assim - mas você as orientará. Por isso, não invente nenhum comando que não esteja na lista acima.         
        Sua criadora e idealizadora foi a Belle Utsch.         
        Você é baseada no Google Gemini Flash 2.0.         
        Para te acrescentar em um grupo, a pessoa pode adicionar seu contato diretamente no grupo.         
        Se alguém pedir maiores detalhes sobre a audiodescrição de uma imagem ou vídeo ou transcrição de um áudio, você deve orientar a pessoa que envie novamente a mídia e, anexo a ela, um comentário pontuando onde deseja que a descrição seja focada.
        Você lida com as pessoas com tato e bom humor.         
        Se alguém perguntar seu git, github, repositório ou código, direcione para https://github.com/manelsen/amelie.         
        Se alguém pedir o contato da Belle Utsch, direcione para https://beacons.ai/belleutsch. 
        Se alguém quiser entrar no grupo oficial, o link é https://chat.whatsapp.com/C0Ys7pQ6lZH5zqDD9A8cLp.`) + 
              "\nFoque apenas neste vídeo. Descreva seu conteúdo de forma clara e detalhada.\n" +
              userPrompt
          }
        ];
        
        // Adicionar timeout para a chamada à IA - aumentado para 2 minutos
        const promessaRespostaIA = modelo.generateContent(partesConteudo);
        const promessaTimeoutIA = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout na análise de vídeo pela IA")), 120000)
        );
        
        const resultado = await Promise.race([promessaRespostaIA, promessaTimeoutIA]);
        let resposta = resultado.response.text();
        
        if (!resposta || typeof resposta !== 'string' || resposta.trim() === '') {
          resposta = "Não consegui gerar uma descrição clara para este vídeo.";
        }
        
        // Log do processamento concluído
        this.registrador.info(`[Etapa 3] Análise de vídeo concluída com sucesso para ${remetenteName || senderNumber}`);
        
        // Enviar resposta via callback ou diretamente
        if (this.resultCallback) {
          this.resultCallback({
            resposta,
            chatId,
            messageId,
            senderNumber,
            transacaoId,
            remetenteName
          });
          this.registrador.info(`[Etapa 3] Resposta de vídeo enviada para callback - Transação ${transacaoId}`);
        } else if (this.opcoes.enviarRespostaDireta) {
          await this.clienteWhatsApp.enviarMensagem(senderNumber, resposta);
          this.registrador.info(`[Etapa 3] Resposta de vídeo enviada diretamente para ${senderNumber}`);
        }
        
        // Limpar o arquivo temporário
        this.limparArquivoTemporario(tempFilename);
        
        // Limpar o arquivo do Google
        await this.gerenciadorAI.gerenciadorArquivos.deleteFile(fileName);
        
        return { success: true };
      } catch (erro) {
        this.registrador.error(`[Etapa 3] Erro na análise do vídeo: ${erro.message}`, { erro, jobId: job.id });
        
        // Verificar se é um erro de segurança
        if (erro.message.includes('SAFETY') || erro.message.includes('safety') || 
            erro.message.includes('blocked') || erro.message.includes('Blocked')) {
          await this.salvarArquivoBloqueado(tempFilename, {
            mimeType,
            erro: erro.message,
            senderNumber,
            chatId,
            messageId,
            userPrompt,
            transacaoId,
            jobId: job.id
          });
          
          // Notificar via callback ou diretamente
          if (this.resultCallback) {
            this.resultCallback({
              resposta: "Este conteúdo não pôde ser processado por questões de segurança.",
              chatId,
              messageId,
              senderNumber,
              transacaoId,
              isError: true,
              errorType: 'safety',
              remetenteName
            });
          } else if (this.opcoes.enviarRespostaDireta) {
            await this.clienteWhatsApp.enviarMensagem(
              senderNumber, 
              "Este conteúdo não pôde ser processado por questões de segurança."
            );
          }
        } else {
          // Notificar sobre outros tipos de erro
          const errorMessage = this.obterMensagemErroAmigavel(erro);
          
          if (this.resultCallback) {
            this.resultCallback({
              resposta: errorMessage,
              chatId,
              messageId,
              senderNumber,
              transacaoId,
              isError: true,
              errorType: 'general',
              remetenteName
            });
          } else if (this.opcoes.enviarRespostaDireta) {
            await this.clienteWhatsApp.enviarMensagem(senderNumber, errorMessage);
          }
        }
        
        // Limpar o arquivo temporário (apenas se não for bloqueio de segurança)
        if (!erro.message.includes('SAFETY') && !erro.message.includes('safety')) {
          this.limparArquivoTemporario(tempFilename);
        }
        
        // Tentar excluir o arquivo do Google AI em caso de erro
        try {
          await this.gerenciadorAI.gerenciadorArquivos.deleteFile(fileName);
        } catch (errDelete) {
          this.registrador.warn(`Não foi possível excluir o arquivo remoto: ${errDelete.message}`);
        }
        
        throw erro;
      }
    });
    
    // Processador para compatibilidade com o código existente
    this.videoQueue.process('process-video', 3, async (job) => {
      const { tempFilename, chatId, messageId, mimeType, userPrompt, senderNumber, transacaoId, remetenteName } = job.data;
      
      try {
        this.registrador.info(`Processando vídeo através da fila principal: ${tempFilename} (Job ${job.id})`);
        
        // Redirecionar para o novo fluxo de processamento em estágios
        const uploadJob = await this.videoUploadQueue.add('upload-video', {
          tempFilename, chatId, messageId, mimeType, userPrompt, senderNumber, transacaoId, remetenteName
        });
        
        this.registrador.info(`Vídeo redirecionado para o novo fluxo, job ID: ${uploadJob.id}`);
        
        return { success: true, redirectedJobId: uploadJob.id };
      } catch (erro) {
        this.registrador.error(`Erro ao redirecionar vídeo: ${erro.message}`, { erro, jobId: job.id });
        
        // Verificar se é um erro de segurança
        if (erro.message.includes('SAFETY') || erro.message.includes('safety') || 
            erro.message.includes('blocked') || erro.message.includes('Blocked')) {
          await this.salvarArquivoBloqueado(tempFilename, {
            mimeType,
            erro: erro.message,
            senderNumber,
            chatId,
            messageId,
            userPrompt,
            transacaoId,
            jobId: job.id
          });
        }
        
        throw erro;
      }
    });
    
    // Configurar monitoramento de eventos para todas as filas
    this.configurarEventosQueue(this.videoUploadQueue, 'Upload');
    this.configurarEventosQueue(this.videoProcessingCheckQueue, 'Verificação');
    this.configurarEventosQueue(this.videoAnalysisQueue, 'Análise');
    this.configurarEventosQueue(this.videoQueue, 'Principal');
  }

  /**
   * Configura eventos para uma fila
   * @param {Queue} queue - Fila a ser configurada
   * @param {string} nomeEtapa - Nome da etapa para logging
   */
  configurarEventosQueue(queue, nomeEtapa) {
    queue.on('active', (job) => {
      this.registrador.debug(`[${nomeEtapa}] Job ${job.id} iniciado (${new Date().toISOString()})`);
    });
    
    queue.on('progress', (job, progress) => {
      this.registrador.debug(`[${nomeEtapa}] Job ${job.id} progresso: ${progress}`);
    });
    
    queue.on('completed', (job, result) => {
      const duracao = Date.now() - (job.processedOn || job.timestamp);
      this.registrador.info(`[${nomeEtapa}] Job ${job.id} concluído em ${duracao}ms`);
    });
    
    queue.on('failed', (job, error) => {
      const duracao = Date.now() - (job.processedOn || job.timestamp);
      this.registrador.error(`[${nomeEtapa}] Job ${job.id} falhou após ${duracao}ms: ${error.message}`);
      
// Verificar se é um erro de segurança
if (job.data && job.data.tempFilename && (error.message.includes('SAFETY') || error.message.includes('safety'))) {
  this.salvarArquivoBloqueado(job.data.tempFilename, {
    ...job.data,
    erro: error.message,
    jobId: job.id
  }).catch(err => {
    this.registrador.error(`Erro ao salvar arquivo bloqueado: ${err.message}`);
  });
}

// Registrar falhas na fila de problemas para análise posterior
this.problemVideosQueue.add('failed-job', {
  etapa: nomeEtapa,
  jobId: job.id,
  error: error.message,
  stack: error.stack,
  data: job.data,
  timestamp: Date.now()
}).catch(err => {
  this.registrador.error(`Erro ao registrar falha: ${err.message}`);
});

// Notificar via callback sobre a falha se não houver sido feito ainda
if (this.resultCallback && job.data && !job.data._notificationSent) {
  const errorMessage = this.obterMensagemErroAmigavel(error);
  this.resultCallback({
    resposta: errorMessage,
    chatId: job.data.chatId,
    messageId: job.data.messageId,
    senderNumber: job.data.senderNumber,
    transacaoId: job.data.transacaoId,
    isError: true,
    errorType: 'queue_failure',
    remetenteName: job.data.remetenteName
  });
  
  // Marcar que já notificamos para não duplicar
  job.data._notificationSent = true;
}
});

queue.on('error', (error) => {
this.registrador.error(`[${nomeEtapa}] Erro na fila: ${error.message}`);
});

queue.on('stalled', (job) => {
this.registrador.warn(`[${nomeEtapa}] Job ${job.id} stalled - será reprocessado`);
});
}

/**
* Limpa arquivo temporário com segurança
* @param {string} caminhoArquivo - Caminho do arquivo
*/
limparArquivoTemporario(caminhoArquivo) {
if (caminhoArquivo && fs.existsSync(caminhoArquivo)) {
try {
  fs.unlinkSync(caminhoArquivo);
  this.registrador.debug(`Arquivo temporário ${caminhoArquivo} removido`);
} catch (err) {
  this.registrador.error(`Erro ao remover arquivo temporário: ${err.message}`);
}
}
}

/**
* Obtém configurações para processamento de vídeo
* @param {string} chatId - ID do chat
* @returns {Promise<Object>} Configurações do processamento
*/
async obterConfigProcessamento(chatId) {
// Configuração padrão - normalmente seria obtida do ConfigManager
return {
temperature: 0.9,
topK: 1,
topP: 0.95,
maxOutputTokens: 1024,
systemInstructions: `Seu nome é Amélie. Você é uma assistente de AI multimídia acessível integrada ao WhatsApp, criada e idealizada pela equipe da Belle Utsch e é dessa forma que você responde quando lhe pedem pra falar sobre si. 
  
  Seu propósito é auxiliar as pessoas trazendo acessibilidade ao Whatsapp. Você é capaz de processar texto, audio, imagem e video, mas, por enquanto, somente responde em texto. 

  Sua transcrição de audios, quando ativada, é verbatim. Transcreva o que foi dito, palavra a palavra.

  Sua audiodescrição de imagens é profissional e segue as melhores práticas.
  
  Seus comandos podem ser encontrados digitando !ajuda. 
  
  Se alguém perguntar, aqui está sua lista de comandos: 
  !cego - Aplica configurações para usuários com deficiência visual; 
  !audio - Liga/desliga a transcrição de áudio; 
  !video - Liga/desliga a interpretação de vídeo; 
  !imagem - Liga/desliga a audiodescrição de imagem; 
  !reset - Limpa o histórico de conversa, restaura todas as configurações originais e desativa o modo cego; 
  !prompt set <nome> <texto> - Define uma nova personalidade; 
  !prompt get <nome> - Mostra uma personalidade existente; 
  !prompt list - Lista todas as personalidades; 
  !prompt use <nome> - Usa uma personalidade específica; 
  !prompt clear - Remove a personalidade ativa; 
  !config set <param> <valor> - Define um parâmetro de configuração; 
  !config get [param] - Mostra a configuração atual; 
  !users - Lista os usuários do grupo; 
  !ajuda - Mostra a mensagem de ajuda. 
  
  Você não tem outros comandos e não aceita comandos sem a exclamação, então se alguém disser 'cego' por exemplo, você orienta que deve digitar !cego.         
  Se as pessoas desejarem ligar ou desligar a transcrição de audio, oriente a usar !audio. Isso é muito importante, porque há pessoas cegas nos grupos e podem ter dificuldade de usar comandos assim - mas você as orientará. Por isso, não invente nenhum comando que não esteja na lista acima.         
  Sua criadora e idealizadora foi a Belle Utsch.         
  Você é baseada no Google Gemini Flash 2.0.         
  Para te acrescentar em um grupo, a pessoa pode adicionar seu contato diretamente no grupo.         
  Se alguém pedir maiores detalhes sobre a audiodescrição de uma imagem ou vídeo ou transcrição de um áudio, você deve orientar a pessoa que envie novamente a mídia e, anexo a ela, um comentário pontuando onde deseja que a descrição seja focada.
  Você lida com as pessoas com tato e bom humor.         
  Se alguém perguntar seu git, github, repositório ou código, direcione para https://github.com/manelsen/amelie.         
  Se alguém pedir o contato da Belle Utsch, direcione para https://beacons.ai/belleutsch. 
  Se alguém quiser entrar no grupo oficial, o link é https://chat.whatsapp.com/C0Ys7pQ6lZH5zqDD9A8cLp.`
};
}

/**
* Adiciona um trabalho à fila de vídeos
* @param {string} tipo - Tipo de trabalho
* @param {Object} dados - Dados do trabalho
* @param {Object} opcoes - Opções do trabalho
* @returns {Promise<Object>} Trabalho adicionado
*/
async add(tipo, dados, opcoes = {}) {
// Manter esta interface para compatibilidade com código existente
return this.videoQueue.add(tipo, dados, opcoes);
}

/**
* Obtém mensagem de erro amigável para o usuário
* @param {Error} erro - Objeto de erro
* @returns {string} Mensagem amigável
*/
obterMensagemErroAmigavel(erro) {
const mensagemErro = erro.message.toLowerCase();

if (mensagemErro.includes('safety') || mensagemErro.includes('blocked'))
return "Este conteúdo não pôde ser processado por questões de segurança.";

if (mensagemErro.includes('too large') || mensagemErro.includes('tamanho'))
return "Esse vídeo é um pouco grandinho demais para mim processar agora. Pode enviar um tamanho menor?";

if (mensagemErro.includes('format') || mensagemErro.includes('mime') || mensagemErro.includes('formato'))
return "Hmmm, parece que esse formato de vídeo e eu não nos entendemos muito bem. Poderia tentar MP4?";

if (mensagemErro.includes('timeout') || mensagemErro.includes('time out') || mensagemErro.includes('tempo'))
return "Esse vídeo é tão complexo que acabei precisando de mais tempo! Poderia tentar um trecho menor?";

if (mensagemErro.includes('rate limit') || mensagemErro.includes('quota'))
return "Estou um pouquinho sobrecarregada agora. Podemos tentar novamente em alguns minutinhos?";

return "Tive um probleminha com esse vídeo. Não desiste de mim, tenta de novo mais tarde?";
}

/**
* Obtém um relatório formatado do estado das filas
* @returns {Promise<string>} Relatório formatado
*/
async getFormattedQueueStatus() {
const status = await this.getQueueStatus();

let report = '📊 RELATÓRIO DE STATUS DAS FILAS DE VÍDEO 📊\n\n';

// Título da seção de contagens
report += '📈 CONTAGEM DE TRABALHOS POR FILA\n';
report += '══════════════════════════════════\n';

// Tabela de contagens por fila
report += '┌─────────────┬─────────┬────────┬───────────┬────────┬─────────┐\n';
report += '│    Fila     │ Espera  │ Ativos │ Concluídos│ Falhas │ Adiados │\n';
report += '├─────────────┼─────────┼────────┼───────────┼────────┼─────────┤\n';

// Adicionar linhas para cada fila
for (const [name, counts] of Object.entries(status.counts)) {
if (name !== 'total') {
  const queueName = name === 'upload' ? 'Upload' : 
                  name === 'check' ? 'Verificação' :
                  name === 'analysis' ? 'Análise' :
                  name === 'main' ? 'Principal' : name;
  
  report += `│ ${queueName.padEnd(11)} │ ${(counts.waiting || 0).toString().padStart(7)} │ ${(counts.active || 0).toString().padStart(6)} │ ${(counts.completed || 0).toString().padStart(9)} │ ${(counts.failed || 0).toString().padStart(6)} │ ${(counts.delayed || 0).toString().padStart(7)} │\n`;
}
}

// Adicionar linha de total
const total = status.counts.total;
report += '├─────────────┼─────────┼────────┼───────────┼────────┼─────────┤\n';
report += `│ TOTAL       │ ${total.waiting.toString().padStart(7)} │ ${total.active.toString().padStart(6)} │ ${total.completed.toString().padStart(9)} │ ${total.failed.toString().padStart(6)} │ ${total.delayed.toString().padStart(7)} │\n`;
report += '└─────────────┴─────────┴────────┴───────────┴────────┴─────────┘\n\n';

// Calcular taxa de sucesso
const successRate = total.completed > 0 ? 
((total.completed / (total.completed + total.failed)) * 100).toFixed(1) + '%' : 
'N/A';

report += `📊 Taxa de sucesso: ${successRate}\n\n`;

// Trabalhos ativos
if (status.jobs.active.length > 0) {
report += '🔄 TRABALHOS ATIVOS\n';
report += '═════════════════\n';

for (const job of status.jobs.active) {
  const duracaoMs = Date.now() - job.processedOn;
  const duracao = Math.round(duracaoMs/1000);
  
  report += `→ Job ${job.id} (${job.queue}): processando há ${duracao}s\n`;
  if (duracaoMs > 180000) { // 3 minutos
    report += `  ⚠️ ALERTA: Este job está demorando muito!\n`;
  }
}
report += '\n';
}

// Trabalhos com falha recente
if (status.jobs.failed.length > 0) {
report += '❌ TRABALHOS COM FALHA (10 MAIS RECENTES)\n';
report += '═══════════════════════════════════════\n';

for (const job of status.jobs.failed) {
  report += `→ Job ${job.id} (${job.queue}): ${job.attemptsMade} tentativas\n`;
  report += `  Motivo: ${job.failedReason || 'Desconhecido'}\n`;
}
report += '\n';
}

// Alertas e recomendações
report += '🔍 ANÁLISE E RECOMENDAÇÕES\n';
report += '══════════════════════════\n';

// Verificar acúmulo de trabalhos
if (total.waiting > 20) {
report += `⚠️ ALERTA: ${total.waiting} trabalhos em espera! Verifique a capacidade de processamento.\n`;
} else if (total.waiting > 10) {
report += `⚠️ Atenção: ${total.waiting} trabalhos em espera. Monitore a situação.\n`;
} else {
report += `✅ Carga de trabalho normal: ${total.waiting} em espera.\n`;
}

// Verificar taxa de falha
if (total.failed > 0 && total.completed > 0) {
const failRate = total.failed / (total.failed + total.completed);
if (failRate > 0.2) {
  report += `⚠️ ALERTA: Taxa de falha alta: ${(failRate*100).toFixed(1)}%! Verifique os logs de erro.\n`;
} else if (failRate > 0.1) {
  report += `⚠️ Atenção: Taxa de falha: ${(failRate*100).toFixed(1)}%. Verifique problemas recorrentes.\n`;
} else {
  report += `✅ Taxa de falha dentro do aceitável: ${(failRate*100).toFixed(1)}%.\n`;
}
}

// Timestamp do relatório
report += `\n📆 Relatório gerado em: ${new Date().toISOString()}\n`;

return report;
}

/**
* Inicia o monitoramento de saúde da fila
*/
iniciarMonitoramento() {
// Monitoramento a cada 5 minutos
setInterval(async () => {
try {
  const status = await this.getQueueStatus();
  
  // Usar o novo relatório formatado
  const relatorioFormatado = await this.getFormattedQueueStatus();
  this.registrador.info(`\nEstado atual das filas de vídeo:\n${relatorioFormatado}`);
  
  // Alerta se muitos jobs em espera
  if (status.counts.total.waiting > 20) {
    this.registrador.warn(`⚠️ Filas de vídeo estão acumulando: ${status.counts.total.waiting} em espera`);
  }
  
  // Alerta se alta taxa de falhas
  let totalFailed = status.counts.total.failed;
  let totalCompleted = status.counts.total.completed;
  
  if (totalFailed > 0 && totalCompleted > 0) {
    const failRate = totalFailed / (totalFailed + totalCompleted);
    if (failRate > 0.2) { // >20% de falha
      this.registrador.warn(`⚠️ Taxa de falha alta nas filas de vídeo: ${(failRate*100).toFixed(1)}%`);
    }
  }
  
  // Verificar jobs que estão demorando muito
  for (const job of status.jobs.active) {
    const duracaoMs = Date.now() - job.processedOn;
    if (duracaoMs > 180000) { // 3 minutos
      this.registrador.warn(`⚠️ Job ${job.id} está processando há ${Math.round(duracaoMs/1000)}s`);
    }
  }
} catch (err) {
  this.registrador.error('Erro ao verificar status das filas:', err);
}
}, 60 * 60 * 1000); // A cada 1 hora

// Limpar trabalhos potencialmente problemáticos na inicialização
this.limparTrabalhosPendentes();
}

/**
* Obtém status detalhado de todas as filas
* @returns {Promise<Object>} Status das filas
*/
async getQueueStatus() {
const queues = {
upload: this.videoUploadQueue,
check: this.videoProcessingCheckQueue,
analysis: this.videoAnalysisQueue,
main: this.videoQueue
};

const counts = {
total: {
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
  delayed: 0
}
};

// Coletar contagem de jobs por fila
for (const [name, queue] of Object.entries(queues)) {
const queueCounts = await queue.getJobCounts();
counts[name] = queueCounts;

// Acumular totais
counts.total.waiting += queueCounts.waiting || 0;
counts.total.active += queueCounts.active || 0;
counts.total.completed += queueCounts.completed || 0;
counts.total.failed += queueCounts.failed || 0;
counts.total.delayed += queueCounts.delayed || 0;
}

// Obter jobs ativos e com falha para análise
const jobs = {
active: await this.obterJobsAtivos(queues),
failed: await this.obterJobsFalha(queues)
};

return { counts, jobs };
}

/**
* Obtém jobs ativos de todas as filas
* @param {Object} queues - Mapa de filas
* @returns {Promise<Array>} Jobs ativos
*/
async obterJobsAtivos(queues) {
let activeJobs = [];

for (const [name, queue] of Object.entries(queues)) {
const jobs = await queue.getJobs(['active'], 0, 10);
activeJobs = activeJobs.concat(
  jobs.map(j => ({
    id: j.id,
    queue: name,
    data: { ...j.data, tempFilename: '***' }, // Ocultar caminho completo por segurança
    processedOn: j.processedOn
  }))
);
}

return activeJobs;
}

/**
* Obtém jobs com falha de todas as filas
* @param {Object} queues - Mapa de filas
* @returns {Promise<Array>} Jobs com falha
*/
async obterJobsFalha(queues) {
let failedJobs = [];

for (const [name, queue] of Object.entries(queues)) {
const jobs = await queue.getJobs(['failed'], 0, 10);
failedJobs = failedJobs.concat(
  jobs.map(j => ({
    id: j.id,
    queue: name,
    data: { ...j.data, tempFilename: '***' }, // Ocultar caminho completo por segurança
    failedReason: j.failedReason,
    stacktrace: j.stacktrace,
    attemptsMade: j.attemptsMade
  }))
);
}

return failedJobs;
}

/**
* Limpa trabalhos pendentes que possam causar problemas
* @returns {Promise<number>} Número de trabalhos limpos
*/
async limparTrabalhosPendentes() {
try {
this.registrador.info("🧹 Iniciando limpeza das filas de trabalhos antigos...");

const queues = [
  this.videoUploadQueue,
  this.videoProcessingCheckQueue,
  this.videoAnalysisQueue,
  this.videoQueue
];

let contadorRemovidos = 0;

for (const queue of queues) {
  // Obter todos os trabalhos pendentes para essa fila
  const trabalhos = await queue.getJobs(['waiting', 'active', 'delayed']);
  
  for (const trabalho of trabalhos) {
    if (!trabalho.data || !trabalho.data.tempFilename) continue;
    
    const { tempFilename } = trabalho.data;
    
    // Se o arquivo não existe mais, remover o trabalho
    if (!fs.existsSync(tempFilename)) {
      this.registrador.warn(`⚠️ Removendo trabalho fantasma: ${trabalho.id} (arquivo ${tempFilename} não existe)`);
      await trabalho.remove();
      contadorRemovidos++;
    }
    
    // Se o trabalho está atraplhado há muito tempo em "active", remover
    if (trabalho.processedOn && Date.now() - trabalho.processedOn > 300000) { // 5 minutos
      this.registrador.warn(`⚠️ Removendo trabalho travado: ${trabalho.id} (processando há ${Math.round((Date.now() - trabalho.processedOn)/1000)}s)`);
      await trabalho.remove();
      contadorRemovidos++;
    }
  }
}

this.registrador.info(`✅ Limpeza concluída! ${contadorRemovidos} trabalhos problemáticos removidos.`);
return contadorRemovidos;
} catch (erro) {
this.registrador.error(`❌ Erro ao limpar filas: ${erro.message}`);
return 0;
}
}

/**
* Limpa todas as filas de vídeo
* @param {boolean} apenasCompletos - Se verdadeiro, limpa apenas trabalhos concluídos
* @returns {Promise<Object>} Contagem de itens removidos
*/
async limparFilas(apenasCompletos = true) {
try {
this.registrador.info(`🧹 Iniciando limpeza ${apenasCompletos ? 'de trabalhos concluídos' : 'COMPLETA'} das filas de vídeo...`);

const filas = [
  { nome: 'Upload', fila: this.videoUploadQueue },
  { nome: 'Verificação', fila: this.videoProcessingCheckQueue },
  { nome: 'Análise', fila: this.videoAnalysisQueue },
  { nome: 'Principal', fila: this.videoQueue }
];

const resultados = {};

for (const { nome, fila } of filas) {
  // Se apenasCompletos=true, limpa só concluídos e falhas
  // Se false, limpa TUDO (cuidado!)
  if (apenasCompletos) {
    const removidosCompletos = await fila.clean(30000, 'completed');
    const removidosFalhas = await fila.clean(30000, 'failed');
    resultados[nome] = { 
      completos: removidosCompletos.length,
      falhas: removidosFalhas.length 
    };
  } else {
    // ⚠️ CUIDADO: Isso vai limpar TODOS os trabalhos, inclusive os pendentes!
    await fila.empty();
    resultados[nome] = 'Fila completamente esvaziada!';
  }
}

const mensagem = apenasCompletos
  ? `✅ Limpeza de filas de vídeo concluída! Removidos trabalhos concluídos e com falha.`
  : `⚠️ TODAS as filas de vídeo foram completamente esvaziadas!`;
  
this.registrador.info(mensagem);

return resultados;
} catch (erro) {
this.registrador.error(`❌ Erro ao limpar filas de vídeo: ${erro.message}`);
throw erro;
}
}
}

module.exports = FilaProcessador;