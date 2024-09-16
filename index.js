require('dotenv').config();
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { setupWhatsAppClient } = require('./services/whatsappService');
const logger = require('./config/logger');
const { API_KEY, BOT_NAME } = require('./config/environment');

let whatsappClient;

const fs = require('fs').promises;
const path = require('path');

async function ensureDbDirectory() {
  const dbPath = path.join(__dirname, 'db');
  try {
    await fs.access(dbPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(dbPath, { recursive: true });
    } else {
      throw error;
    }
  }
}

const initializeProject = () => {
    logger.info('Iniciando configuração do projeto...');
    createDatabaseFolder();
    verifyEnvironmentVariables();
    logger.info('Configuração do projeto concluída');
};

const createDatabaseFolder = () => {
    const dbPath = path.join(__dirname, 'db');
    ensureDbDirectory();
};

const verifyEnvironmentVariables = () => {
    if (!API_KEY) {
        throw new Error('API_KEY não está definida nas variáveis de ambiente');
    }
    if (!BOT_NAME) {
        throw new Error('BOT_NAME não está definida nas variáveis de ambiente');
    }
};

const initializeBot = async () => {
    logger.info('Iniciando o processo de inicialização do bot...');
    try {
        initializeProject();
        logger.info('Configurando cliente do WhatsApp...');
        whatsappClient = setupWhatsAppClient();
        whatsappClient.on('qr', (qr) => {
            logger.info('QR Code gerado. Aguardando leitura...');
        });
        whatsappClient.on('ready', () => {
            logger.info('Cliente WhatsApp pronto e conectado');
        });
        logger.info('Iniciando cliente do WhatsApp...');
        await whatsappClient.initialize();
        logger.info('Bot inicializado com sucesso!');
    } catch (error) {
        logger.error(`Erro durante a inicialização do bot: ${error.message}`, { error });
        process.exit(1);
    }
};

const watchFiles = () => {
    const watcher = chokidar.watch([
        path.join(__dirname, 'services'),
        path.join(__dirname, 'handlers'),
        path.join(__dirname, 'dispatchers'),
        path.join(__dirname, 'database'),
        path.join(__dirname, 'utils'),
        path.join(__dirname, 'config')
    ], {
        ignored: /(^|[\/\\])\../, // Ignora arquivos ocultos
        persistent: true
    });

    watcher.on('change', (filePath) => {
        logger.info(`Arquivo alterado: ${filePath}`);
        reloadModule(filePath);
    });
};

const reloadModule = (filePath) => {
    try {
        const relativePath = path.relative(__dirname, filePath);
        const modulePath = `./${relativePath}`;
        
        // Limpa o cache do módulo
        delete require.cache[require.resolve(modulePath)];
        
        // Recarrega o módulo
        require(modulePath);
        
        logger.info(`Módulo recarregado com sucesso: ${modulePath}`);
    } catch (error) {
        logger.error(`Erro ao recarregar módulo: ${error.message}`, { error, filePath });
    }
};

const gracefulShutdown = async () => {
    logger.info('Iniciando desligamento gracioso...');
    if (whatsappClient) {
        await whatsappClient.destroy();
        logger.info('Cliente WhatsApp desconectado');
    }
    process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`, { error });
    process.exit(1);
});

// Iniciar o bot e configurar o watcher
(async () => {
    await initializeBot();
    watchFiles();
})();