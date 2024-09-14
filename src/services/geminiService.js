const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const { API_KEY } = require('../config/environment');
const { getChatHistory } = require('../database/messagesDb');
const { getSystemPrompt } = require('../database/promptsDb');
const logger = require('../config/logger');

const genAI = new GoogleGenerativeAI(API_KEY);
const fileManager = new GoogleAIFileManager(API_KEY);

const createGeminiModel = (config) => genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    generationConfig: {
        temperature: config.temperature,
        topK: config.topK,
        topP: config.topP,
        maxOutputTokens: config.maxOutputTokens,
    },
    safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
});

const prepareGeminiSession = async (chatId, userMessage, config) => {
    const chatHistory = await getChatHistory(chatId);
    const activeSystemInstruction = config.activePrompt ? 
        (await getSystemPrompt(chatId, config.activePrompt))?.text : 
        "Você é um assistente de chat. Responda com base no histórico da conversa, dando mais importância às mensagens mais recentes. Foque principalmente na última mensagem do usuário.";

    let reorganizedHistory = [];

    if (chatHistory.length === 0) {
        reorganizedHistory.push({ role: 'user', parts: [{ text: `[Instruções do Sistema: ${activeSystemInstruction}]` }] });
        reorganizedHistory.push({ role: 'model', parts: [{ text: "Entendido. Como posso ajudar?" }] });
    } else {
        reorganizedHistory = chatHistory.map(msg => ({
            role: msg.sender === config.botName ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));
    }

    reorganizedHistory.push({ role: 'user', parts: [{ text: `[Instruções do Sistema: ${activeSystemInstruction}]` }] });
    reorganizedHistory.push({ role: 'user', parts: [{ text: userMessage }] });

    logger.debug('História reorganizada:', reorganizedHistory);

    const model = createGeminiModel(config);
    return model.startChat({ history: reorganizedHistory });
};

const sanitizeResponse = (response) => {
    let sanitized = response.replace(/^\[Importância: \d+\.\d+\]\s*/,'');
    sanitized = sanitized.split(/Usuário:|Human:|[A-Z]+:/)[0].trim();
    return sanitized || "Desculpe, não consegui gerar uma resposta adequada. Pode reformular sua pergunta?";
};

module.exports = {
    prepareGeminiSession,
    sanitizeResponse,
    fileManager
};
