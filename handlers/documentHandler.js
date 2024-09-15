const { prepareGeminiSession, sanitizeResponse } = require('../services/geminiService');
const logger = require('../config/logger');
const fs = require('fs').promises;
const path = require('path');
const mime = require('mime-types');
const { uploadToFileManager } = require('../utils/fileUtils');

const handleDocumentMessage = async (msg, context, chatId) => {
    try {
        const documentContext = await extractDocumentContext(msg, context, chatId);
        const response = await processDocument(documentContext);

        logger.info(`Documento processado para chat ${chatId}`, { userId: documentContext.userId });
        
        return response;
    } catch (error) {
        logger.error(`Erro ao processar documento: ${error.message}`, { error, chatId });
        return 'Desculpe, ocorreu um erro ao processar o documento. Por favor, tente novamente.';
    }
};

const extractDocumentContext = async (msg, context, chatId) => {
    const { config } = context;
    if (config.disableDocument) {
        throw new Error('Processamento de documentos desabilitado');
    }

    const documentData = await msg.downloadMedia();
    if (!documentData || !documentData.data) {
        throw new Error('Documento sem dados válidos');
    }

    const fileName = documentData.filename || 'documento_sem_nome';
    let mimeType = documentData.mimetype || mime.lookup(fileName) || 'application/octet-stream';

    const supportedMimeTypes = [
        'text/plain', 'text/html', 'text/css', 'text/javascript',
        'text/markdown', 'application/json', 'application/xml', 'application/pdf',
        'image/png', 'image/jpeg', 'image/gif', 'image/webp'
    ];

/*    if (!supportedMimeTypes.includes(mimeType)) {
        throw new Error(`Tipo MIME não suportado: ${mimeType}`);
    }*/

    const sender = msg.author || msg.from;
    const userId = sender.split('@')[0];
    const userPrompt = msg.body && msg.body.trim() !== '' ? msg.body.trim() : `Documento sem Prompt`;

    return { ...context, chatId, sender, userId, documentData, fileName, mimeType, userPrompt };
};

const processDocument = async (context) => {
    const { documentData, mimeType, userPrompt, config } = context;
    const tempFilePath = await saveDocumentToFile(documentData);
    const uploadedFile = await uploadToFileManager(tempFilePath, mimeType);
    await fs.unlink(tempFilePath);

    const chatSession = await prepareGeminiSession(
        context.chatId,
        `Prompt do usuário: ${userPrompt}\n\nPor favor, responda ao prompt considerando o documento fornecido.`,
        context.userId,
        config
    );

    const result = await chatSession.sendMessage(`[Documento]: ${uploadedFile.file.uri}`);
    const responseText = await result.response.text();
    return sanitizeResponse(responseText);
};

const saveDocumentToFile = async (documentData) => {
    const tempFilePath = path.join(__dirname, `../../temp_doc_${Date.now()}`);
    await fs.writeFile(tempFilePath, documentData.data, 'base64');
    return tempFilePath;
};

module.exports = {
    handleDocumentMessage
};