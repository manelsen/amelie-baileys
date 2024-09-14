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

const formatHistoryForConsole = (history) => {
    return history.map(msg => {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        return `[${role}: ${msg.parts[0].text}]`;
    }).join('\n');
};

const prepareGeminiSession = async (chatId, userMessage, userId, config) => {
    const chatHistory = await getChatHistory(chatId);
    logger.debug(`Chat history length: ${chatHistory.length}`);

    let activeSystemInstruction = config.activePrompt ? 
        await getSystemPrompt(chatId, config.activePrompt) : 
        "Você é um assistente de chat.";

    activeSystemInstruction += `
    
Instruções adicionais:
1. Cada mensagem do usuário será prefixada com [UserXXXXX], onde XXXXX é o ID do usuário.
2. Suas respostas não devem incluir nenhum prefixo. Responda diretamente sem adicionar [UserXXXXX] ou qualquer outro prefixo.
3. Responda com base no histórico da conversa, dando mais importância às mensagens mais recentes.
4. Foque principalmente na última mensagem do usuário.`;

    let reorganizedHistory = [];

    reorganizedHistory.push({ role: 'user', parts: [{ text: `[Instruções do Sistema: ${activeSystemInstruction}]` }] });
    reorganizedHistory.push({ role: 'model', parts: [{ text: "Entendido. Como posso ajudar?" }] });

    if (chatHistory.length > 0) {
        reorganizedHistory = reorganizedHistory.concat(chatHistory.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.role === 'user' ? `[User${msg.userId}]: ${msg.parts[0].text}` : msg.parts[0].text }]
        })));
    }

    reorganizedHistory.push({ 
        role: 'user', 
        parts: [{ text: `[User${userId}]: ${userMessage}` }]
    });

    reorganizedHistory = reorganizedHistory.filter(msg => 
        msg.parts.every(part => part.text && part.text.trim() !== '')
    );

    logger.debug('História reorganizada:\n' + formatHistoryForConsole(reorganizedHistory));

    const loggedHistory = reorganizedHistory.slice(-5);
    logger.debug('Dados enviados para Gemini (últimas 5 mensagens):\n' + formatHistoryForConsole(loggedHistory));

    logger.debug('Configuração do Gemini:', {
        model: "gemini-1.5-flash",
        temperature: config.temperature,
        topK: config.topK,
        topP: config.topP,
        maxOutputTokens: config.maxOutputTokens,
    });

    const model = createGeminiModel(config);
    return model.startChat({ history: reorganizedHistory });
};

const sanitizeResponse = (response) => {
    let sanitized = response.replace(/^\[Importância: \d+\.\d+\]\s*/,'');
    sanitized = sanitized.replace(/^\[User\d+\]:\s*/, '');
    sanitized = sanitized.split(/Usuário:|Human:|[A-Z]+:/)[0].trim();
    return sanitized || "Desculpe, não consegui gerar uma resposta adequada. Pode reformular sua pergunta?";
};

module.exports = {
    prepareGeminiSession,
    sanitizeResponse,
    fileManager
};