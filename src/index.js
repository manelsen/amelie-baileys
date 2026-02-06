/**
 * Amélie - Assistente Virtual de IA para WhatsApp
 */

const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

// 1. Configurações Iniciais
dotenv.config();
moment.tz.setDefault("America/Sao_Paulo");

const configurarLogger = require('./config/LoggerConfig');
const logger = configurarLogger(process.env.LOG_LEVEL || 'info');

const ConfigManager = require('./config/ConfigManager');
const ClienteBaileys = require('./adaptadores/whatsapp/ClienteBaileys');
const criarAdaptadorAI = require('./adaptadores/ai/GerenciadorAI');
const GerenciadorMensagens = require('./adaptadores/whatsapp/AdaptadorGerenciadorMensagens');
const GerenciadorNotificacoes = require('./adaptadores/whatsapp/GerenciadorNotificacoes');
const inicializarFilasMidia = require('./adaptadores/queue/FilasMidia');
const GerenciadorTransacoes = require('./adaptadores/transacoes/GerenciadorTransacoes');
const criarServicoMensagem = require('./servicos/ServicoMensagem');
const ServicoLimpeza = require('./servicos/ServicoLimpeza');
const Telemetria = require('./monitoramento/Telemetria');
const LimpadorTemp = require('./utilitarios/LimpadorTemp');

// 1.5 Silenciar logs "hardcoded" de bibliotecas externas (ex: libsignal-node)
const originalConsoleInfo = console.info;
console.info = function() {
    if (arguments[0] && typeof arguments[0] === 'string' && arguments[0].startsWith('Closing session:')) {
        return;
    }
    originalConsoleInfo.apply(console, arguments);
};

// 2. Garantir Diretórios
['./db', './temp', './logs'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 3. Inicialização de Componentes
logger.info('🚀 Iniciando Amélie (Baileys Edition)');

const telemetria = Telemetria(logger);
telemetria.iniciar();

const configManager = ConfigManager(logger, path.join(process.cwd(), 'db'));
const clienteWhatsApp = ClienteBaileys(logger, { clienteId: 'principal' });
const gerenciadorNotificacoes = GerenciadorNotificacoes(logger, './temp');
const gerenciadorAI = criarAdaptadorAI({ registrador: logger, apiKey: process.env.API_KEY });
const gerenciadorTransacoes = GerenciadorTransacoes(logger, path.join(process.cwd(), 'db'));
const servicoMensagem = criarServicoMensagem(logger, clienteWhatsApp, gerenciadorTransacoes, gerenciadorNotificacoes);

// 4. Configurar Eventos do Cliente
clienteWhatsApp.on('pronto', async () => {
    logger.info('✅ WhatsApp Conectado!');

    const filasMidia = inicializarFilasMidia(logger, gerenciadorAI, configManager, servicoMensagem);
    
    const gerenciadorMensagens = GerenciadorMensagens(
        logger, clienteWhatsApp, configManager, gerenciadorAI, 
        filasMidia, gerenciadorTransacoes, servicoMensagem
    );

    gerenciadorMensagens.registrarComoHandler(clienteWhatsApp);

    // Inicializar Serviço de Limpeza e Manutenção
    const servicoLimpeza = ServicoLimpeza(logger, {
        clienteWhatsApp, gerenciadorTransacoes, gerenciadorNotificacoes, filasMidia, gerenciadorMensagens
    });
    servicoLimpeza.iniciar();

    // Limpeza inicial
    await LimpadorTemp.limpar('./temp', 30, logger);
    LimpadorTemp.agendarLimpeza('./temp', 60 * 60 * 1000, logger); // 1 vez por hora

    await gerenciadorTransacoes.limparTransacoesIncompletas();
    await gerenciadorNotificacoes.processar(clienteWhatsApp);
    await gerenciadorTransacoes.processarTransacoesPendentes(clienteWhatsApp);
});

// 5. Tratamento de Erros
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', { reason });
});

process.on('uncaughtException', (erro) => {
    logger.error(`Uncaught Exception: ${erro.message}`, { erro });
    if (process.env.NODE_ENV === 'production') {
        setTimeout(() => process.exit(1), 5000);
    } else {
        process.exit(1);
    }
});

logger.info('⏳ Aguardando conexão...');
