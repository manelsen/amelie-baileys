const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { log } = require('../dispatchers/loggingDispatcher');
const { handleError } = require('../dispatchers/errorDispatcher');
const { messageDispatcher } = require('../dispatchers/messageDispatcher');
const { getConfig } = require('../database/configDb');
const { BOT_NAME } = require('../config/environment');

const setupWhatsAppClient = () => {
    const client = new Client({
        authStrategy: new LocalAuth()
    });

    client.on('qr', qr => {
        qrcode.generate(qr, {small: true});
        log('info', 'QR code gerado');
    });

    client.on('ready', () => {
        log('info', 'Cliente WhatsApp pronto e conectado');
    });

    client.on('message_create', async (msg) => {
        if (msg.fromMe) return;

        try {
            const chat = await msg.getChat();
            await chat.sendSeen();

            log('info', `Mensagem recebida: ${msg.author || 'Desconhecido'} / ${msg.from}) -> ${msg.body}`);

            const chatId = chat.id._serialized;
            const config = await getConfig(chatId);
            const context = { config, botName: BOT_NAME };

            await messageDispatcher(msg, context, chatId);
        } catch (error) {
            handleError(error, { 
                msgFrom: msg.from,
                msgBody: msg.body
            });
            try {
                await msg.reply('Desculpe, ocorreu um erro inesperado. Por favor, tente novamente mais tarde.');
            } catch (replyError) {
                handleError(replyError, { context: 'Erro ao enviar mensagem de erro' });
            }
        }
    });

    client.on('disconnected', (reason) => {
        log('warn', `Cliente WhatsApp desconectado: ${reason}`);
    });

    return client;
};

module.exports = {
    setupWhatsAppClient
};