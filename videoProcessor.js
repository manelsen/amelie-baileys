/**
 * Processador de fila de vídeos para Amélie
 * Processa vídeos em segundo plano, permitindo melhor desempenho e resiliência
 */

const { videoQueue, problemVideosQueue, logger, getErrorMessageForUser } = require('./videoQueue');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const Datastore = require('nedb');

// Carregar variáveis de ambiente
dotenv.config();

// Garantir que o diretório de banco de dados existe
if (!fs.existsSync('./db')) {
    fs.mkdirSync('./db', { recursive: true });
    logger.info('Diretório de banco de dados criado');
}

// Configurar banco de dados com opções de segurança
const configDb = new Datastore({ 
    filename: './db/video_processor_config.db', // Arquivo separado para evitar conflitos
    autoload: true,
    onload: (err) => {
        if (err) {
            logger.error('Erro ao carregar banco de dados:', err);
        } else {
            logger.info('Banco de dados do processador de vídeos carregado com sucesso');
        }
    }
});

// Configurar cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'video-processor' }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Inicializar Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const fileManager = new GoogleAIFileManager(process.env.API_KEY);

// Modelo cache para reutilização
const modelCache = new Map();

/**
 * Gera uma chave única baseada nas configurações do modelo
 * @param {Object} config - Configurações do modelo
 * @returns {string} Chave única para cache
 */
function getModelCacheKey(config) {
    const {
        model = "gemini-2.0-flash",
        temperature = 0.9,
        topK = 1,
        topP = 0.95,
        maxOutputTokens = 1024,
    } = config;
    
    // Cria uma chave baseada nos parâmetros
    return `${model}_${temperature}_${topK}_${topP}_${maxOutputTokens}`;
}

/**
 * Obtém um modelo existente do cache ou cria um novo
 * @param {Object} config - Configurações do modelo
 * @returns {Object} Instância do modelo Gemini
 */
function getOrCreateModel(config) {
    const cacheKey = getModelCacheKey(config);
    
    // Verifica se já existe um modelo com essas configurações
    if (modelCache.has(cacheKey)) {
        logger.debug(`Usando modelo em cache com chave: ${cacheKey}`);
        return modelCache.get(cacheKey);
    }
    
    // Caso contrário, cria um novo modelo
    logger.debug(`Criando novo modelo com chave: ${cacheKey}`);
    const newModel = genAI.getGenerativeModel({
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
        systemInstruction: config.systemInstruction
    });
    
    // Armazena o modelo no cache
    modelCache.set(cacheKey, newModel);
    
    // Limita o tamanho do cache
    if (modelCache.size > 10) {
        const oldestKey = modelCache.keys().next().value;
        modelCache.delete(oldestKey);
        logger.debug(`Cache de modelos atingiu o limite. Removendo modelo mais antigo: ${oldestKey}`);
    }
    
    return newModel;
}

/**
 * Obtém as configurações de um chat usando banco de dados principal
 * @param {string} chatId - ID do chat
 * @returns {Promise<Object>} Configurações do chat
 */
function getConfig(chatId) {
    // Configuração padrão para o caso de não encontrar no banco
    const defaultConfig = {
        temperature: 0.9,
        topK: 1,
        topP: 0.95,
        maxOutputTokens: 1024,
        mediaImage: true,  
        mediaAudio: false,  
        mediaVideo: true,
        systemInstructions: `Seu nome é Amélie. Você é uma assistente de AI multimídia acessível integrada ao WhatsApp.`
    };
    
    return new Promise((resolve) => {
        // Tentamos ler do banco compartilhado, mas se der erro, usamos configuração padrão
        try {
            const mainConfigDb = new Datastore({ filename: './db/config.db', autoload: true });
            mainConfigDb.findOne({ chatId }, (err, doc) => {
                if (err) {
                    logger.warn(`Erro ao acessar configuração para ${chatId}, usando padrão:`, err);
                    resolve(defaultConfig);
                } else {
                    const userConfig = doc || {};
                    const config = { ...defaultConfig, ...userConfig };
                    resolve(config);
                }
            });
        } catch (error) {
            logger.warn(`Falha ao acessar banco de dados de configuração:`, error);
            resolve(defaultConfig);
        }
    });
}

// Garantir que o diretório para arquivos temporários exista
if (!fs.existsSync('./temp')) {
    fs.mkdirSync('./temp', { recursive: true });
    logger.info('Diretório de arquivos temporários criado');
}

// Inicializar cliente
client.initialize().catch(err => {
    logger.error('Erro ao inicializar cliente WhatsApp:', err);
});

client.on('qr', () => {
    logger.info('QR Code recebido no processador de vídeos. Por favor, escaneie.');
});

client.on('ready', () => {
    logger.info('Cliente WhatsApp do processador de vídeos está pronto!');
});

client.on('disconnected', (reason) => {
    logger.error(`Cliente do processador de vídeos desconectado: ${reason}`);
});

// Processar trabalhos da fila
videoQueue.process('process-video', async (job) => {
    const { tempFilename, chatId, messageId, mimeType, userPrompt, senderNumber } = job.data;
    
    try {
        logger.info(`Processando vídeo: ${tempFilename} (Job ${job.id})`);
        
        // Verificar se o arquivo ainda existe
        if (!fs.existsSync(tempFilename)) {
            throw new Error("Arquivo temporário do vídeo não encontrado");
        }
        
        // Fazer upload para o Google AI
        const uploadResponse = await fileManager.uploadFile(tempFilename, {
            mimeType: mimeType,
            displayName: "Vídeo Enviado"
        });

        // Aguardar processamento
        let file = await fileManager.getFile(uploadResponse.file.name);
        let retries = 0;
        
        while (file.state === "PROCESSING" && retries < 12) {
            logger.info(`Vídeo ainda em processamento, aguardando... (tentativa ${retries + 1})`);
            await new Promise(resolve => setTimeout(resolve, 10000));
            file = await fileManager.getFile(uploadResponse.file.name);
            retries++;
        }

        if (file.state === "FAILED") {
            throw new Error("Falha no processamento do vídeo pelo Google AI");
        }
        
        if (file.state !== "SUCCEEDED") {
            throw new Error(`Estado inesperado do arquivo: ${file.state}`);
        }

        // Obter configurações do usuário
        const userConfig = await getConfig(chatId);
        
        // Obter modelo
        const model = getOrCreateModel({
            model: "gemini-2.0-flash",
            temperature: userConfig.temperature,
            topK: userConfig.topK,
            topP: userConfig.topP,
            maxOutputTokens: userConfig.maxOutputTokens,
            systemInstruction: userConfig.systemInstructions
        });

        // Preparar partes de conteúdo
        const contentParts = [
            {
                fileData: {
                    mimeType: file.mimeType,
                    fileUri: file.uri
                }
            },
            {
                text: (userConfig.systemInstructions || "") 
                    + "\nFoque apenas neste vídeo. Descreva seu conteúdo de forma clara e detalhada.\n"
                    + userPrompt
            }
        ];

        // Gerar conteúdo
        const result = await model.generateContent(contentParts);
        let response = result.response.text();
        
        if (!response || typeof response !== 'string' || response.trim() === '') {
            response = "Não consegui gerar uma descrição clara para este vídeo.";
        }
        
        // Formatar resposta
        const finalResponse = `✅ *Análise do seu vídeo:*\n\n${response}\n\n_(Processado em ${Math.floor((Date.now() - job.processedOn) / 1000)}s)_`;
        
        // Enviar resultado de volta ao WhatsApp
        await client.sendMessage(senderNumber, finalResponse);
        
        // Limpar arquivo temporário
        if (fs.existsSync(tempFilename)) {
            fs.unlinkSync(tempFilename);
            logger.info(`Arquivo temporário ${tempFilename} removido após processamento bem-sucedido`);
        }
        
        logger.info(`Vídeo processado com sucesso: ${job.id}`);
        
        return { success: true };
    } catch (error) {
        logger.error(`Erro ao processar vídeo na fila: ${error.message}`, { error, jobId: job.id });
        
        // Notifica o usuário sobre o erro
        try {
            const errorMessage = getErrorMessageForUser(error);
            await client.sendMessage(senderNumber, errorMessage);
        } catch (err) {
            logger.error(`Não consegui notificar sobre o erro: ${err.message}`);
        }
        
        // Limpar arquivo temporário em caso de erro
        if (fs.existsSync(tempFilename)) {
            fs.unlinkSync(tempFilename);
            logger.info(`Arquivo temporário ${tempFilename} removido após erro`);
        }
        
        throw error; // Repropaga o erro para a fila lidar com ele
    }
});

// Monitoramento de saúde do sistema de filas
setInterval(async () => {
    try {
        const videoStats = await videoQueue.getJobCounts();
        logger.info('Estado atual da fila de vídeos:', videoStats);
        
        // Alerta se muitos jobs em espera
        if (videoStats.waiting > 20) {
            logger.warn(`⚠️ Fila de vídeos está acumulando: ${videoStats.waiting} em espera`);
        }
        
        // Alerta se alta taxa de falhas
        if (videoStats.failed > 0 && videoStats.completed > 0) {
            const failRate = videoStats.failed / (videoStats.failed + videoStats.completed);
            if (failRate > 0.2) { // >20% de falha
                logger.warn(`⚠️ Taxa de falha alta na fila de vídeos: ${(failRate*100).toFixed(1)}%`);
            }
        }
    } catch (err) {
        logger.error('Erro ao verificar status da fila:', err);
    }
}, 5 * 60 * 1000); // A cada 5 minutos

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason) => {
    logger.error('Rejeição não tratada no processador de vídeo:', reason);
    // Não encerra o processo para manter a fila funcionando
});

// Log quando iniciar
logger.info('🎬 Processador de vídeos iniciado e pronto para trabalhar!');