const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('../config/logger');

// Importações dos handlers
const { handleTextMessage } = require('../handlers/textHandler');
const { handleCommand } = require('../handlers/commandHandler');
const { handleImageMessage } = require('../handlers/imageHandler'); 
const { handleDocumentMessage } = require('../handlers/documentHandler');
const { handleLargeAudioMessage, handleSmallAudioMessage, handlePttMessage } = require('../handlers/audioHandler');
const { messageDispatcher } = require('../dispatchers/messageDispatcher');
const { BOT_NAME } = require('../config/environment');

// Adicione este manipulador global para capturar todas as rejeições não tratadas
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', {
        promise,
        reason,
        timestamp: new Date().toISOString()
    });
    
    // Opcional: Reinicie o bot ou tome outras ações necessárias
    // process.exit(1); // Exemplo: reiniciar o processo
});

const setupWhatsAppClient = () => {
    const client = new Client({
        authStrategy: new LocalAuth()
    });

    client.on('qr', qr => {
        qrcode.generate(qr, {small: true});
        logger.info('QR code gerado');
    });

    client.on('ready', () => {
        logger.info('Cliente WhatsApp pronto e conectado');
    });

    client.on('message_create', async (msg) => {
        if (msg.fromMe) return;

        try {
            const chat = await msg.getChat();
            await chat.sendSeen();

            logger.info(`Mensagem recebida: ${msg.author || 'Desconhecido'} / ${msg.from}) -> ${msg.body}`);

            const chatId = chat.id._serialized;

            if (msg.body.startsWith('!')) {
                await handleCommand(msg, chatId);
            } else {
                // Obtém o contexto e direciona a mensagem
                await messageDispatcher(msg, null, chatId); // Ajuste conforme necessário
            }
        } catch (error) {
            logger.error(`Erro ao processar mensagem: ${error.message}`, { 
                error: error,
                stack: error.stack,
                msgFrom: msg.from,
                msgBody: msg.body
            });
            try {
                await msg.reply('Desculpe, ocorreu um erro inesperado. Por favor, tente novamente mais tarde.');
            } catch (replyError) {
                logger.error(`Erro ao enviar mensagem de erro: ${replyError.message}`);
            }
        }
    });

    client.on('disconnected', (reason) => {
        logger.warn(`Cliente WhatsApp desconectado: ${reason}`);
        // Opcional: Tente reconectar ou notifique os administradores
    });

    return client;
};

module.exports = {
    setupWhatsAppClient
};
