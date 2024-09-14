const { getConfig } = require('../database/configDb');
const { prepareGeminiSession, sanitizeResponse } = require('../services/geminiService');
const logger = require('../config/logger');
const { messageDispatcher } = require('../dispatchers/messageDispatcher');
const { log } = require('../dispatchers/loggingDispatcher');
const fs = require('fs').promises;
const path = require('path');
const mime = require('mime-types');
const { uploadToFileManager } = require('../utils/fileUtils');

/**
 * Lida com mensagens de documento recebidas.
 * @param {object} msg - Mensagem recebida.
 * @param {string} chatId - ID do chat.
 */
const handleDocumentMessage = async (msg, chatId) => {
    try {
        const context = await extractDocumentContext(msg, chatId);
        const response = await processDocument(context);

        const processedMessage = {
            response,
            messageLabel: '[Documento]'
        };

        // Passa o contexto e a mensagem processada para o dispatcher
        await messageDispatcher(context, processedMessage);

        // Log do evento
        log('info', `Documento processado para chat ${chatId}`, { userId: context.userId });
    } catch (error) {
        // Envia o erro para o errorDispatcher
        const { handleError } = require('../dispatchers/errorDispatcher');
        await handleError(context, error);
    }
};

/**
 * Extrai contexto específico para o processamento de documentos.
 * @param {object} msg - Mensagem recebida.
 * @param {string} chatId - ID do chat.
 * @returns {object} - Contexto extraído.
 */
const extractDocumentContext = async (msg, chatId) => {
    const config = await getConfig(chatId);
    if (config.disableDocument) {
        await msg.reply('O processamento de documentos está desabilitado para este chat.');
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

    if (!supportedMimeTypes.includes(mimeType)) {
        throw new Error(`Tipo MIME não suportado: ${mimeType}`);
    }

    const sender = msg.author || msg.from;
    const userId = sender.split('@')[0];
    const userPrompt = msg.body && msg.body.trim() !== '' ? msg.body.trim() : `Documento sem Prompt`;

    return { msg, chatId, config, sender, userId, documentData, fileName, mimeType, userPrompt };
};

/**
 * Processa o documento usando o modelo Gemini.
 * @param {object} context - Contexto da mensagem.
 * @returns {string} - Resposta gerada.
 */
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
    let response = sanitizeResponse(responseText);

    if (!response || response.trim() === '') {
        response = "Desculpe, ocorreu um erro ao processar o documento. Por favor, tente novamente.";
    }

    return response;
};

/**
 * Salva o documento em um arquivo temporário.
 * @param {object} documentData - Dados do documento.
 * @returns {string} - Caminho do arquivo salvo.
 */
const saveDocumentToFile = async (documentData) => {
    const tempFilePath = path.join(__dirname, `../../temp_doc_${Date.now()}`);
    await fs.writeFile(tempFilePath, documentData.data, 'base64');
    return tempFilePath;
};

module.exports = {
    handleDocumentMessage
};
