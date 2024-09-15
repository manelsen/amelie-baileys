const { getConfig } = require('../database/configDb');
const { prepareGeminiSession, sanitizeResponse } = require('../services/geminiService');
const { messageDispatcher } = require('../dispatchers/messageDispatcher');
const { log } = require('../dispatchers/loggingDispatcher');
const fs = require('fs').promises;
const path = require('path');
const { uploadToFileManager } = require('../utils/fileUtils');

/**
 * Lida com mensagens de áudio recebidas.
 * @param {object} msg - Mensagem recebida.
 * @param {object} audioData - Dados do áudio.
 * @param {string} chatId - ID do chat.
 */
const handleAudioMessage = async (msg, audioData, chatId) => {
    try {
        const context = await extractAudioContext(msg, audioData, chatId);
        const response = await processAudio(context);

        const processedMessage = {
            response,
            messageLabel: '[Áudio]'
        };

        // Passa o contexto e a mensagem processada para o dispatcher
        await messageDispatcher(context, processedMessage);

        // Log do evento
        log('info', `Áudio processado para chat ${chatId}`, { userId: context.userId });
    } catch (error) {
        // Envia o erro para o errorDispatcher
        const { handleError } = require('../dispatchers/errorDispatcher');
        await handleError(context, error);
    }
};

/**
 * Extrai contexto específico para o processamento de áudio.
 * @param {object} msg - Mensagem recebida.
 * @param {object} audioData - Dados do áudio.
 * @param {string} chatId - ID do chat.
 * @returns {object} - Contexto extraído.
 */
const extractAudioContext = async (msg, audioData, chatId) => {
    const config = await getConfig(chatId);
    if (config.disableAudio) {
        await msg.reply('O processamento de áudio está desabilitado para este chat.');
        throw new Error('Processamento de áudio desabilitado');
    }

    const sender = msg.author || msg.from;
    const userId = sender.split('@')[0];
    const audioType = determineAudioType(msg, audioData);

    return { msg, audioData, chatId, config, sender, userId, audioType };
};

/**
 * Determina o tipo de áudio para processamento.
 * @param {object} msg - Mensagem recebida.
 * @param {object} audioData - Dados do áudio.
 * @returns {string} - Tipo de áudio ('inline' ou 'large').
 */
const determineAudioType = (msg, audioData) => {
    const MAX_INLINE_AUDIO_SIZE = 1000000; // 1MB

    if (msg.type === 'ptt') {
        return 'inline';
    } else if (audioData.filesize && audioData.filesize < MAX_INLINE_AUDIO_SIZE) {
        return 'inline';
    } else {
        return 'large';
    }
};

/**
 * Processa o áudio com base no tipo.
 * @param {object} context - Contexto da mensagem.
 * @returns {string} - Resposta gerada.
 */
const processAudio = async (context) => {
    const { audioType, audioData, config } = context;

    if (audioType === 'large') {
        const tempFilePath = await saveAudioToFile(audioData);
        const uploadedFile = await uploadToFileManager(tempFilePath, audioData.mimetype);
        await fs.unlink(tempFilePath);

        const chatSession = await prepareGeminiSession(
            context.chatId,
            audioData.filename || 'Áudio recebido',
            context.userId,
            config
        );

        const result = await chatSession.sendMessage(`[Áudio]: ${uploadedFile.file.uri}`);
        const responseText = await result.response.text();
        let response = sanitizeResponse(responseText);

        if (!response || response.trim() === '') {
            response = "Desculpe, ocorreu um erro ao processar o áudio. Por favor, tente novamente.";
        }

        return response;
    } else if (audioType === 'inline') {
        const audioBuffer = Buffer.from(audioData.data, 'base64');

        const chatSession = await prepareGeminiSession(
            context.chatId,
            `[Áudio Pequeno]: ${audioBuffer.toString('base64')}`,
            context.userId,
            config
        );

        const result = await chatSession.sendMessage(`[Áudio Pequeno]: ${audioBuffer.toString('base64')}`);
        const responseText = await result.response.text();
        let response = sanitizeResponse(responseText);

        if (!response || response.trim() === '') {
            response = "Desculpe, ocorreu um erro ao processar o áudio. Por favor, tente novamente.";
        }

        return response;
    } else {
        throw new Error('Tipo de áudio desconhecido');
    }
};

/**
 * Salva o áudio em um arquivo temporário.
 * @param {object} audioData - Dados do áudio.
 * @returns {string} - Caminho do arquivo salvo.
 */
const saveAudioToFile = async (audioData) => {
    const tempFilePath = path.join(__dirname, `../../temp_audio_${Date.now()}.mp3`);
    await fs.writeFile(tempFilePath, audioData.data, 'base64');
    return tempFilePath;
};

module.exports = {
    handleAudioMessage
};
