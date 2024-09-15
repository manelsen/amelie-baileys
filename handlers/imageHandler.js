const { prepareGeminiSession, sanitizeResponse } = require('../services/geminiService');
const logger = require('../config/logger');
const { uploadToFileManager } = require('../utils/fileUtils');

const handleImageMessage = async (msg, context, chatId) => {
    try {
        const imageData = await msg.downloadMedia();
        if (!imageData) {
            return "Desculpe, não foi possível processar a imagem. Por favor, tente novamente.";
        }

        const uploadedFile = await uploadToFileManager(imageData.data, imageData.mimetype);
        
        const userPrompt = msg.body || "Descreva esta imagem";
        
        const chatSession = await prepareGeminiSession(chatId, userPrompt, context.userId, context.config);
        
        const result = await chatSession.sendMessage([
            userPrompt,
            { fileUri: uploadedFile.file.uri }
        ]);

        const response = sanitizeResponse(await result.response.text());
        
        logger.info(`Imagem processada para chat ${chatId}`);
        
        return response;
    } catch (error) {
        logger.error(`Erro ao processar imagem: ${error.message}`, { error, chatId });
        return "Desculpe, ocorreu um erro ao processar a imagem. Por favor, tente novamente.";
    }
};

module.exports = {
    handleImageMessage
};