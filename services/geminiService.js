const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');
const { API_KEY } = require('../config/environment');
const { getFormattedHistory } = require('../utils/historyUtils');
const { getSystemPrompt } = require('../database/promptsDb');
const { log } = require('../dispatchers/loggingDispatcher');
const { handleError } = require('../dispatchers/errorDispatcher');

const genAI = new GoogleGenerativeAI(API_KEY);
const fileManager = new GoogleAIFileManager(API_KEY);

/**
 * Prepara uma sessão do Gemini com as instruções de sistema e histórico.
 * @param {string} chatId - ID do chat.
 * @param {string} userMessage - Mensagem do usuário.
 * @param {string} userId - ID do usuário.
 * @param {object} config - Configurações do chat.
 * @returns {object} - Sessão do chat preparada.
 */
const prepareGeminiSession = async (chatId, userMessage, userId, config) => {
    try {
        log('debug', `Configuração do Gemini: ${JSON.stringify(config)}`);

        const [formattedHistory, systemPrompt] = await Promise.all([
            getFormattedHistory(chatId, config),
            getSystemPrompt(chatId, config.activePrompt)
        ]);

        const model = createGeminiModel(config, systemPrompt);
        const history = buildHistory(formattedHistory, userMessage, userId);

        return model.startChat({ history });
    } catch (error) {
        handleError(error, { chatId, userId });
        throw error;
    }
};

/**
 * Cria uma instância do modelo Gemini com as configurações e instruções de sistema.
 * @param {object} config - Configurações do chat.
 * @param {string} systemInstruction - Instruções de sistema.
 * @returns {object} - Instância do modelo Gemini.
 */
const createGeminiModel = (config, systemInstruction) => {
    const modelConfig = {
        model: 'gemini-1.5-flash',
        generationConfig: {
            temperature: config.temperature,
            topK: config.topK,
            topP: config.topP,
            maxOutputTokens: config.maxOutputTokens
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ],
        systemInstruction: systemInstruction || ''
    };

    return genAI.getGenerativeModel(modelConfig);
};

/**
 * Constrói o histórico da conversa, iniciando com mensagens do usuário.
 * @param {array} formattedHistory - Histórico de mensagens formatado.
 * @param {string} userMessage - Mensagem do usuário.
 * @param {string} userId - ID do usuário.
 * @returns {array} - Histórico da conversa.
 */
const buildHistory = (formattedHistory, userMessage, userId) => {
    let history = [];

    if (formattedHistory && formattedHistory.length > 0) {
        history = history.concat(formattedHistory.map(formatMessage));
    }

    history.push({ role: 'user', parts: [{ text: userMessage }] });

    return history;
};

/**
 * Formata uma mensagem do histórico.
 * @param {object} msg - Mensagem do histórico.
 * @returns {object} - Mensagem formatada.
 */
const formatMessage = (msg) => ({
    role: msg.role,
    parts: [{ text: msg.role === 'user' ? `[User${msg.userId}]: ${msg.parts[0].text}` : msg.parts[0].text }]
});

/**
 * Sanitiza a resposta recebida do modelo.
 * @param {string} response - Resposta bruta do modelo.
 * @returns {string} - Resposta sanitizada.
 */
const sanitizeResponse = (response) => {
    let sanitized = response.replace(/^\[Importância: \d+\.\d+\]\s*/,'');
    sanitized = sanitized.replace(/^\[User\d+\]:\s*/, '');
    sanitized = sanitized.split(/Usuário:|Human:|[A-Z]+:/)[0].trim();
    return sanitized || "Desculpe, não consegui gerar uma resposta adequada. Pode reformular sua pergunta?";
};

const processFile = async (filePath, mimeType, userPrompt, config) => {
    try {
        const uploadedFile = await fileManager.uploadFile({
            filePath: filePath,
            mimeType: mimeType
        });

        const model = createGeminiModel(config);

        const result = await model.generateContent([
            userPrompt,
            { fileUri: uploadedFile.file.uri }
        ]);

        return sanitizeResponse(await result.response.text());
    } catch (error) {
        handleError(error, { filePath, mimeType });
        throw error;
    }
};

module.exports = {
    prepareGeminiSession,
    sanitizeResponse,
    processFile
};
