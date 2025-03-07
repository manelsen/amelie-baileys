/**
 * GerenciadorAI - Gerencia a interação com modelos de IA
 * 
 * Este módulo encapsula toda a interação com a API do Google Generative AI,
 * incluindo cache de modelos, tratamento de erros e timeout.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const crypto = require('crypto');
const IAPort = require('../../portas/IAPort');
const fs = require('fs');

class GerenciadorAI extends IAPort {
  /**
   * Cria uma instância do gerenciador de IA
   * @param {Object} registrador - Objeto logger para registro de eventos
   * @param {string} apiKey - Chave da API do Google Generative AI
   */
  constructor(registrador, apiKey) {
    super();
    this.registrador = registrador;
    this.apiKey = apiKey;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.gerenciadorArquivos = new GoogleAIFileManager(apiKey);
    this.cacheModelos = new Map();
    this.disjuntor = this.criarDisjuntor();
  }

  /**
   * Cria um disjuntor para proteção contra falhas na API
   * @returns {Object} Objeto disjuntor
   */
  criarDisjuntor() {
    return {
      falhas: 0,
      ultimaFalha: 0,
      estado: 'FECHADO', // FECHADO, ABERTO, SEMI_ABERTO
      limite: 5, // Número de falhas para abrir o circuito
      tempoReset: 60000, // 1 minuto para resetar
      
      registrarSucesso() {
        this.falhas = 0;
        this.estado = 'FECHADO';
      },
      
      registrarFalha() {
        this.falhas++;
        this.ultimaFalha = Date.now();
        
        if (this.falhas >= this.limite) {
          this.estado = 'ABERTO';
          return true; // Circuito aberto
        }
        return false; // Circuito ainda fechado
      },
      
      podeExecutar() {
        if (this.estado === 'FECHADO') return true;
        
        if (this.estado === 'ABERTO') {
          if (Date.now() - this.ultimaFalha > this.tempoReset) {
            this.estado = 'SEMI_ABERTO';
            return true;
          }
          return false;
        }
        
        return true;
      }
    };
  }

  /**
   * Gera uma chave única para cache de modelos
   * @param {Object} config - Configurações do modelo
   * @returns {string} Chave de cache
   */
  obterChaveCacheModelo(config) {
    const {
      model = "gemini-2.0-flash",
      temperature = 0.9,
      topK = 1,
      topP = 0.95,
      maxOutputTokens = 1024,
      systemInstruction = `Seu nome é Amélie. Você é uma assistente de AI multimídia acessível integrada ao WhatsApp, criada e idealizada pela equipe da Belle Utsch e é dessa forma que você responde quando lhe pedem pra falar sobre si. 
        
        Seu propósito é auxiliar as pessoas trazendo acessibilidade ao Whatsapp. Você é capaz de processar texto, audio, imagem e video, mas, por enquanto, somente responde em texto. 

        Sua transcrição de audios, quando ativada, é verbatim. Transcreva o que foi dito, palavra a palavra.

        Sua audiodescrição de imagens é profissional e segue as melhores práticas.
        
        Seus comandos podem ser encontrados digitando .ajuda. 
        
        Se alguém perguntar, aqui está sua lista de comandos: 
Use com um ponto antes da palavra de comando, sem espaço.

Comandos:

.cego - Aplica configurações para usuários com deficiência visual

.audio - Liga/desliga a transcrição de áudio
.video - Liga/desliga a interpretação de vídeo
.imagem - Liga/desliga a audiodescrição de imagem

.reset - Restaura todas as configurações originais e desativa o modo cego

.ajuda - Mostra esta mensagem de ajuda
        
        Você não tem outros comandos e não aceita comandos sem o ponto, então se alguém disser 'cego' por exemplo, você orienta que deve digitar !cego.         
        Se as pessoas desejarem ligar ou desligar a transcrição de audio, oriente a usar .audio. Isso é muito importante, porque há pessoas cegas nos grupos e podem ter dificuldade de usar comandos assim - mas você as orientará. Por isso, não invente nenhum comando que não esteja na lista acima.         
        Sua criadora e idealizadora foi a Belle Utsch.         
        Você é baseada no Google Gemini Flash 2.0.         
        Para te acrescentar em um grupo, a pessoa pode adicionar seu contato diretamente no grupo.         
        Se alguém pedir maiores detalhes sobre a audiodescrição de uma imagem ou vídeo ou transcrição de um áudio, você deve orientar a pessoa que envie novamente a mídia e, anexo a ela, um comentário pontuando onde deseja que a descrição seja focada.
        Você lida com as pessoas com tato e bom humor.         
        Se alguém perguntar seu git, github, repositório ou código, direcione para https://github.com/manelsen/amelie.         
        Se alguém pedir o contato da Belle Utsch, direcione para https://beacons.ai/belleutsch. 
        Se alguém quiser entrar no grupo oficial, o link é https://chat.whatsapp.com/C0Ys7pQ6lZH5zqDD9A8cLp.`
    } = config;
    
    return `${model}_${temperature}_${topK}_${topP}_${maxOutputTokens}_${crypto.createHash('md5').update(systemInstruction || '').digest('hex')}`;
  }

  /**
   * Obtém ou cria um modelo com as configurações especificadas
   * @param {Object} config - Configurações do modelo
   * @returns {Object} Instância do modelo
   */
  obterOuCriarModelo(config) {
    if (!this.disjuntor.podeExecutar()) {
      this.registrador.warn(`Requisição de modelo bloqueada pelo circuit breaker (estado: ${this.disjuntor.estado})`);
      throw new Error("Serviço temporariamente indisponível - muitas falhas recentes");
    }
    
    const chaveCache = this.obterChaveCacheModelo(config);
    
    if (this.cacheModelos.has(chaveCache)) {
      this.registrador.debug(`Usando modelo em cache com chave: ${chaveCache}`);
      return this.cacheModelos.get(chaveCache);
    }
    
    this.registrador.debug(`Criando novo modelo com chave: ${chaveCache}`);
    try {
      const novoModelo = this.genAI.getGenerativeModel({
        model: config.model || "gemini-2.0-flash",
        generationConfig: {
          temperature: config.temperature || 0.9,
          topK: config.topK || 1,
          topP: config.topP || 0.95,
          maxOutputTokens: config.maxOutputTokens || 1024,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        systemInstruction: config.systemInstruction || `Seu nome é Amélie. Você é uma assistente de AI multimídia acessível integrada ao WhatsApp, criada e idealizada pela equipe da Belle Utsch e é dessa forma que você responde quando lhe pedem pra falar sobre si. 
        
        Seu propósito é auxiliar as pessoas trazendo acessibilidade ao Whatsapp. Você é capaz de processar texto, audio, imagem e video, mas, por enquanto, somente responde em texto. 

        Sua transcrição de audios, quando ativada, é verbatim. Transcreva o que foi dito, palavra a palavra.

        Sua audiodescrição de imagens é profissional e segue as melhores práticas.
        
        Seus comandos podem ser encontrados digitando !ajuda. 
        
        Se alguém perguntar, aqui está sua lista de comandos: 
        
Use com um ponto antes da palavra de comando, sem espaço.

Comandos:

.cego - Aplica configurações para usuários com deficiência visual

.audio - Liga/desliga a transcrição de áudio
.video - Liga/desliga a interpretação de vídeo
.imagem - Liga/desliga a audiodescrição de imagem

.reset - Restaura todas as configurações originais e desativa o modo cego

.ajuda - Mostra esta mensagem de ajuda
        
        Você não tem outros comandos e não aceita comandos sem o ponto, então se alguém disser 'cego' por exemplo, você orienta que deve digitar !cego.         
        Se as pessoas desejarem ligar ou desligar a transcrição de audio, oriente a usar !audio. Isso é muito importante, porque há pessoas cegas nos grupos e podem ter dificuldade de usar comandos assim - mas você as orientará. Por isso, não invente nenhum comando que não esteja na lista acima.         
        Sua criadora e idealizadora foi a Belle Utsch.         
        Você é baseada no Google Gemini Flash 2.0.         
        Para te acrescentar em um grupo, a pessoa pode adicionar seu contato diretamente no grupo.         
        Se alguém pedir maiores detalhes sobre a audiodescrição de uma imagem ou vídeo ou transcrição de um áudio, você deve orientar a pessoa que envie novamente a mídia e, anexo a ela, um comentário pontuando onde deseja que a descrição seja focada.
        Você lida com as pessoas com tato e bom humor.         
        Se alguém perguntar seu git, github, repositório ou código, direcione para https://github.com/manelsen/amelie.         
        Se alguém pedir o contato da Belle Utsch, direcione para https://beacons.ai/belleutsch. 
        Se alguém quiser entrar no grupo oficial, o link é https://chat.whatsapp.com/C0Ys7pQ6lZH5zqDD9A8cLp.`
      });
      
      this.disjuntor.registrarSucesso();
      this.cacheModelos.set(chaveCache, novoModelo);
      
      if (this.cacheModelos.size > 10) {
        const chaveAntiga = Array.from(this.cacheModelos.keys())[0];
        this.cacheModelos.delete(chaveAntiga);
        this.registrador.debug(`Cache de modelos atingiu o limite. Removendo modelo mais antigo: ${chaveAntiga}`);
      }
      
      return novoModelo;
    } catch (erro) {
      const circuitoAberto = this.disjuntor.registrarFalha();
      if (circuitoAberto) {
        this.registrador.error(`Circuit breaker aberto após múltiplas falhas!`);
      }
      throw erro;
    }
  }

  /**
   * Implementação do método processarTexto da interface IAPort
   * @param {string} texto - Texto para processar
   * @param {Object} config - Configurações de processamento
   * @returns {Promise<string>} Resposta gerada
   */
  async processarTexto(texto, config) {
    try {
      const modelo = this.obterOuCriarModelo(config);
      
      // Adicionar timeout de 45 segundos
      const promessaResultado = modelo.generateContent(texto);
      const promessaTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout da API Gemini")), 45000)
      );
      
      const resultado = await Promise.race([promessaResultado, promessaTimeout]);
      let textoResposta = resultado.response.text();
      
      if (!textoResposta) {
        throw new Error('Resposta vazia gerada pelo modelo');
      }
      
      return this.limparResposta(textoResposta);
    } catch (erro) {
      this.registrador.error(`Erro ao processar texto: ${erro.message}`);
      return "Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente ou reformule sua pergunta.";
    }
  }

  /**
   * Implementação do método processarImagem da interface IAPort
   * @param {Object} imagemData - Dados da imagem
   * @param {string} prompt - Instruções para processamento
   * @param {Object} config - Configurações de processamento
   * @returns {Promise<string>} Resposta gerada
   */
  async processarImagem(imagemData, prompt, config) {
    try {
      const modelo = this.obterOuCriarModelo({
        ...config,
        // Instruções específicas para audiodescrição
        systemInstruction: (config.systemInstructions || `Seu nome é Amélie. Você é uma assistente de AI multimídia acessível integrada ao WhatsApp, criada e idealizada pela equipe da Belle Utsch e é dessa forma que você responde quando lhe pedem pra falar sobre si. 
        
        Seu propósito é auxiliar as pessoas trazendo acessibilidade ao Whatsapp. Você é capaz de processar texto, audio, imagem e video, mas, por enquanto, somente responde em texto. 

        Sua transcrição de audios, quando ativada, é verbatim. Transcreva o que foi dito, palavra a palavra.

        Sua audiodescrição de imagens é profissional e segue as melhores práticas.
        
        Seus comandos podem ser encontrados digitando !ajuda. 
        
        Se alguém perguntar, aqui está sua lista de comandos: 

Use com um ponto antes da palavra de comando, sem espaço.

Comandos:

.cego - Aplica configurações para usuários com deficiência visual

.audio - Liga/desliga a transcrição de áudio
.video - Liga/desliga a interpretação de vídeo
.imagem - Liga/desliga a audiodescrição de imagem

.reset - Restaura todas as configurações originais e desativa o modo cego

.ajuda - Mostra esta mensagem de ajuda

        Você não tem outros comandos e não aceita comandos sem o ponto, então se alguém disser 'cego' por exemplo, você orienta que deve digitar !cego.         
        Se as pessoas desejarem ligar ou desligar a transcrição de audio, oriente a usar !audio. Isso é muito importante, porque há pessoas cegas nos grupos e podem ter dificuldade de usar comandos assim - mas você as orientará. Por isso, não invente nenhum comando que não esteja na lista acima.         
        Sua criadora e idealizadora foi a Belle Utsch.         
        Você é baseada no Google Gemini Flash 2.0.         
        Para te acrescentar em um grupo, a pessoa pode adicionar seu contato diretamente no grupo.         
        Se alguém pedir maiores detalhes sobre a audiodescrição de uma imagem ou vídeo ou transcrição de um áudio, você deve orientar a pessoa que envie novamente a mídia e, anexo a ela, um comentário pontuando onde deseja que a descrição seja focada.
        Você lida com as pessoas com tato e bom humor.         
        Se alguém perguntar seu git, github, repositório ou código, direcione para https://github.com/manelsen/amelie.         
        Se alguém pedir o contato da Belle Utsch, direcione para https://beacons.ai/belleutsch. 
        Se alguém quiser entrar no grupo oficial, o link é https://chat.whatsapp.com/C0Ys7pQ6lZH5zqDD9A8cLp. 

        Analise esta imagem de forma extremamente detalhada para pessoas com deficiência visual.
Inclua:
1. Se for uma receita, recibo ou documento, transcreva o texto integralmente, verbatim, incluindo, mas não limitado, a CNPJ, produtos, preços, nomes de remédios, posologia, nome do profissional e CRM, etc.
2. Número exato de pessoas, suas posições e roupas (cores, tipos)
3. Ambiente e cenário completo, em todos os planos
4. Todos os objetos visíveis 
5. Movimentos e ações detalhadas
6. Expressões faciais
7. Textos visíveis
8. Qualquer outro detalhe relevante

Crie uma descrição organizada e acessível.`)
      });
      
      const parteImagem = {
        inlineData: {
          data: imagemData.data,
          mimeType: imagemData.mimetype
        }
      };
      
      const partesConteudo = [
        parteImagem,
        { text: prompt }
      ];
      
      // Adicionar timeout de 45 segundos
      const promessaResultado = modelo.generateContent(partesConteudo);
      const promessaTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout da API Gemini")), 45000)
      );
      
      const resultado = await Promise.race([promessaResultado, promessaTimeout]);
      let textoResposta = resultado.response.text();
      
      if (!textoResposta) {
        throw new Error('Resposta vazia gerada pelo modelo');
      }
      
      return this.limparResposta(textoResposta);
    } catch (erro) {
      this.registrador.error(`Erro ao processar imagem: ${erro.message}`);
      return "Desculpe, ocorreu um erro ao analisar esta imagem. Por favor, tente novamente com outra imagem ou reformule seu pedido.";
    }
  }

/**
 * Implementação do método processarAudio da interface IAPort
 * @param {Object} audioData - Dados do áudio
 * @param {string} audioId - Identificador único do áudio
 * @param {Object} config - Configurações de processamento
 * @returns {Promise<string>} Resposta gerada
 */
async processarAudio(audioData, audioId, config) {
  try {
    const modelo = this.obterOuCriarModelo({
      ...config,
      temperature: 0.3, // Menor temperatura para transcrição mais precisa
      systemInstruction: (config.systemInstructions || `Seu nome é Amélie. Você é uma assistente de AI multimídia acessível integrada ao WhatsApp, criada e idealizada pela equipe da Belle Utsch e é dessa forma que você responde quando lhe pedem pra falar sobre si. 
        
        Seu propósito é auxiliar as pessoas trazendo acessibilidade ao Whatsapp. Você é capaz de processar texto, audio, imagem e video, mas, por enquanto, somente responde em texto. 

        Sua transcrição de audios, quando ativada, é verbatim. Transcreva o que foi dito, palavra a palavra.

        Sua audiodescrição de imagens é profissional e segue as melhores práticas.
        
        Seus comandos podem ser encontrados digitando !ajuda. 
        
        Se alguém perguntar, aqui está sua lista de comandos: 

Use com um ponto antes da palavra de comando, sem espaço.

Comandos:

.cego - Aplica configurações para usuários com deficiência visual

.audio - Liga/desliga a transcrição de áudio
.video - Liga/desliga a interpretação de vídeo
.imagem - Liga/desliga a audiodescrição de imagem

.reset - Restaura todas as configurações originais e desativa o modo cego

.ajuda - Mostra esta mensagem de ajuda

        Você não tem outros comandos e não aceita comandos sem o ponto, então se alguém disser 'cego' por exemplo, você orienta que deve digitar !cego.         
        Se as pessoas desejarem ligar ou desligar a transcrição de audio, oriente a usar !audio. Isso é muito importante, porque há pessoas cegas nos grupos e podem ter dificuldade de usar comandos assim - mas você as orientará. Por isso, não invente nenhum comando que não esteja na lista acima.         
        Sua criadora e idealizadora foi a Belle Utsch.         
        Você é baseada no Google Gemini Flash 2.0.         
        Para te acrescentar em um grupo, a pessoa pode adicionar seu contato diretamente no grupo.         
        Se alguém pedir maiores detalhes sobre a audiodescrição de uma imagem ou vídeo ou transcrição de um áudio, você deve orientar a pessoa que envie novamente a mídia e, anexo a ela, um comentário pontuando onde deseja que a descrição seja focada.
        Você lida com as pessoas com tato e bom humor.         
        Se alguém perguntar seu git, github, repositório ou código, direcione para https://github.com/manelsen/amelie.         
        Se alguém pedir o contato da Belle Utsch, direcione para https://beacons.ai/belleutsch. 
        Se alguém quiser entrar no grupo oficial, o link é https://chat.whatsapp.com/C0Ys7pQ6lZH5zqDD9A8cLp.`) + 
        '\nFoque apenas no áudio mais recente. Transcreva verbatim o que foi dito.'
    });
    
    const arquivoAudioBase64 = audioData.data;
    
    const partesConteudo = [
      {
        inlineData: {
          mimeType: audioData.mimetype,
          data: arquivoAudioBase64
        }
      },
      { text: `Transcreva o áudio com ID ${audioId} e resuma seu conteúdo em português. Ignore qualquer contexto anterior.` }
    ];
    
    // Adicionar timeout
    const promessaResultado = modelo.generateContent(partesConteudo);
    const promessaTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Timeout da API Gemini")), 60000)
    );
    
    const resultado = await Promise.race([promessaResultado, promessaTimeout]);
    let textoResposta = resultado.response.text();
    
    if (!textoResposta) {
      throw new Error('Resposta vazia gerada pelo modelo');
    }
    
    return this.limparResposta(textoResposta);
  } catch (erro) {
    this.registrador.error(`Erro ao processar áudio: ${erro.message}`);
    
    // Verificar se é um erro de segurança
    if (erro.message.includes('SAFETY') || erro.message.includes('safety') || 
        erro.message.includes('blocked') || erro.message.includes('Blocked')) {
      
      // Salvar o áudio para análise posterior
      try {
        const diretorioBlocked = path.join(process.cwd(), 'blocked');
        if (!fs.existsSync(diretorioBlocked)) {
          fs.mkdirSync(diretorioBlocked, { recursive: true });
        }
        
        // Salvar o áudio
        const dataHora = new Date().toISOString().replace(/[:.-]/g, '_');
        const caminhoAudio = path.join(diretorioBlocked, `blocked_audio_${audioId}_${dataHora}.ogg`);
        
        const buffer = Buffer.from(audioData.data, 'base64');
        fs.writeFileSync(caminhoAudio, buffer);
        
        // Salvar metadados
        const metadados = {
          timestamp: new Date().toISOString(),
          tipoArquivo: audioData.mimetype || 'audio/ogg',
          erro: erro.message,
          audioId: audioId,
          mimeType: audioData.mimetype
        };
        
        const caminhoMetadados = path.join(diretorioBlocked, `blocked_audio_${audioId}_${dataHora}.json`);
        fs.writeFileSync(caminhoMetadados, JSON.stringify(metadados, null, 2), 'utf8');
        
        this.registrador.warn(`⚠️ Áudio bloqueado por segurança salvo em: ${caminhoAudio}`);
      } catch (erroSave) {
        this.registrador.error(`Erro ao salvar áudio bloqueado: ${erroSave.message}`);
      }
      
      return "Este conteúdo não pôde ser processado por questões de segurança.";
    }
    
    return "Desculpe, ocorreu um erro ao processar este áudio. Por favor, tente novamente com outro áudio ou reformule seu pedido.";
  }
}

  /**
   * Implementação do método processarVideo da interface IAPort
   * @param {string} caminhoVideo - Caminho para o arquivo de vídeo
   * @param {string} prompt - Instruções para processamento
   * @param {Object} config - Configurações de processamento
   * @returns {Promise<string>} Resposta gerada
   */
  async processarVideo(caminhoVideo, prompt, config) {
    try {
      // Fazer upload para o Google AI
      const respostaUpload = await this.gerenciadorArquivos.uploadFile(caminhoVideo, {
        mimeType: config.mimeType || 'video/mp4',
        displayName: "Vídeo Enviado"
      });
      
      // Aguardar processamento
      let arquivo = await this.gerenciadorArquivos.getFile(respostaUpload.file.name);
      let tentativas = 0;
      
      while (arquivo.state === "PROCESSING" && tentativas < 12) {
        this.registrador.info(`Vídeo ainda em processamento, aguardando... (tentativa ${tentativas + 1})`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        arquivo = await this.gerenciadorArquivos.getFile(respostaUpload.file.name);
        tentativas++;
      }
      
      if (arquivo.state === "FAILED") {
        throw new Error("Falha no processamento do vídeo pelo Google AI");
      }
      
      // Estados válidos para prosseguir: SUCCEEDED ou ACTIVE
      if (arquivo.state !== "SUCCEEDED" && arquivo.state !== "ACTIVE") {
        throw new Error(`Estado inesperado do arquivo: ${arquivo.state}`);
      }
      
      // Registrar informação sobre o estado do arquivo
      if (arquivo.state === "ACTIVE") {
        this.registrador.info("Arquivo ainda está ativo, mas pronto para processamento");
      }
      
      // Obter modelo
      const modelo = this.obterOuCriarModelo(config);
      
      // Preparar partes de conteúdo
      const partesConteudo = [
        {
          fileData: {
            mimeType: arquivo.mimeType,
            fileUri: arquivo.uri
          }
        },
        {
          text: (config.systemInstructions || `Seu nome é Amélie. Você é uma assistente de AI multimídia acessível integrada ao WhatsApp, criada e idealizada pela equipe da Belle Utsch e é dessa forma que você responde quando lhe pedem pra falar sobre si. 
        
        Seu propósito é auxiliar as pessoas trazendo acessibilidade ao Whatsapp. Você é capaz de processar texto, audio, imagem e video, mas, por enquanto, somente responde em texto. 

        Sua transcrição de audios, quando ativada, é verbatim. Transcreva o que foi dito, palavra a palavra.

        Sua audiodescrição de imagens é profissional e segue as melhores práticas.
        
        Seus comandos podem ser encontrados digitando !ajuda. 
        
        Se alguém perguntar, aqui está sua lista de comandos: 

Use com um ponto antes da palavra de comando, sem espaço.

Comandos:

.cego - Aplica configurações para usuários com deficiência visual

.audio - Liga/desliga a transcrição de áudio
.video - Liga/desliga a interpretação de vídeo
.imagem - Liga/desliga a audiodescrição de imagem

.reset - Restaura todas as configurações originais e desativa o modo cego

.ajuda - Mostra esta mensagem de ajuda

        Você não tem outros comandos e não aceita comandos sem o ponto, então se alguém disser 'cego' por exemplo, você orienta que deve digitar !cego.         
        Se as pessoas desejarem ligar ou desligar a transcrição de audio, oriente a usar !audio. Isso é muito importante, porque há pessoas cegas nos grupos e podem ter dificuldade de usar comandos assim - mas você as orientará. Por isso, não invente nenhum comando que não esteja na lista acima.         
        Sua criadora e idealizadora foi a Belle Utsch.         
        Você é baseada no Google Gemini Flash 2.0.         
        Para te acrescentar em um grupo, a pessoa pode adicionar seu contato diretamente no grupo.         
        Se alguém pedir maiores detalhes sobre a audiodescrição de uma imagem ou vídeo ou transcrição de um áudio, você deve orientar a pessoa que envie novamente a mídia e, anexo a ela, um comentário pontuando onde deseja que a descrição seja focada.
        Você lida com as pessoas com tato e bom humor.         
        Se alguém perguntar seu git, github, repositório ou código, direcione para https://github.com/manelsen/amelie.         
        Se alguém pedir o contato da Belle Utsch, direcione para https://beacons.ai/belleutsch. 
        Se alguém quiser entrar no grupo oficial, o link é https://chat.whatsapp.com/C0Ys7pQ6lZH5zqDD9A8cLp.

        Analise este vídeo de forma extremamente detalhada para pessoas com deficiência visual.
        Inclua:
        1. Número exato de pessoas, suas posições e roupas (cores, tipos)
        2. Ambiente e cenário completo
        3. Todos os objetos visíveis 
        4. Movimentos e ações detalhadas
        5. Expressões faciais
        6. Textos visíveis
        7. Qualquer outro detalhe relevante

        Crie uma descrição organizada e acessível.`) + 
        prompt
        }
      ];
      
      // Adicionar timeout para a chamada à IA
      const promessaRespostaIA = modelo.generateContent(partesConteudo);
      const promessaTimeoutIA = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout na análise de vídeo pela IA")), 60000)
      );
      
      const resultado = await Promise.race([promessaRespostaIA, promessaTimeoutIA]);
      let resposta = resultado.response.text();
      
      if (!resposta || typeof resposta !== 'string' || resposta.trim() === '') {
        resposta = "Não consegui gerar uma descrição clara para este vídeo.";
      }
      
      // Limpar o arquivo do Google
      await this.gerenciadorArquivos.deleteFile(respostaUpload.file.name);
      
      const respostaFinal = `✅ *Análise do seu vídeo:*\n\n${resposta}`;
      return respostaFinal;
    } catch (erro) {
      this.registrador.error(`Erro ao processar vídeo: ${erro.message}`);
      return "Desculpe, ocorreu um erro ao processar este vídeo. Por favor, tente novamente com outro vídeo ou reformule seu pedido.";
    }
  }

  /**
   * Limpa e formata a resposta da IA
   * @param {string} texto - Texto para limpar
   * @returns {string} Texto limpo
   */
  limparResposta(texto) {
    if (!texto || typeof texto !== 'string') {
      return "Não foi possível gerar uma resposta válida.";
    }
    
    // Remover emojis
    texto = texto.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F0FF}\u{1F100}-\u{1F2FF}]/gu, '');
    
    // Remover prefixos comuns de assistente
    texto = texto.replace(/^(?:amélie:[\s]*)+/i, '');
    texto = texto.replace(/^(?:amelie:[\s]*)+/i, '');

    // Remover asteriscos de formatação Markdown
    texto = texto.replace(/\*+/g, '');
    
    // Normalizar quebras de linha
    texto = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
    
    return texto.trim();
  }
}

module.exports = GerenciadorAI;