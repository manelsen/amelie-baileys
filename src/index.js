require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { setupWhatsAppClient } = require('./services/whatsappService');
const logger = require('./config/logger');
const { API_KEY, MAX_HISTORY, BOT_NAME } = require('./config/environment');

const initializeProject = () => {
    logger.info('Iniciando configuração do projeto...');

    // Criar pasta de banco de dados se não existir
    const dbPath = path.join(__dirname, '../db');
    if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath);
        logger.info('Pasta de banco de dados criada');
    }

    // Verificar variáveis de ambiente críticas
    if (!API_KEY) {
        throw new Error('API_KEY não está definida nas variáveis de ambiente');
    }

    if (!BOT_NAME) {
        throw new Error('BOT_NAME não está definida nas variáveis de ambiente');
    }

    logger.info('Configuração do projeto concluída');
};

const initializeBot = async () => {
    logger.info('Iniciando o processo de inicialização do bot...');

    try {
        initializeProject();

        logger.info('Configurando cliente do WhatsApp...');
        const client = setupWhatsAppClient();

        client.on('qr', (qr) => {
            logger.info('QR Code gerado. Aguardando leitura...');
            // Aqui você pode adicionar lógica para exibir o QR code, se necessário
        });

        client.on('ready', () => {
            logger.info('Cliente WhatsApp pronto e conectado');
        });

        logger.info('Iniciando cliente do WhatsApp...');
        await client.initialize();

        logger.info('Bot inicializado com sucesso!');
    } catch (error) {
        logger.error(`Erro durante a inicialização do bot: ${error.message}`, { error });
        process.exit(1);
    }
};

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`, { error });
    process.exit(1);
});

// Iniciar o bot
initializeBot();

module.exports = {
    initializeBot // Exportamos para caso seja necessário em testes ou em outros módulos
};