// scripts/testar_fluxo_imagem.js
const { default: makeWASocket } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// Mock do Logger
const logger = pino({ level: 'info' });

// Mock do Cliente WhatsApp
const mockClienteWhatsApp = {
    cliente: {
        sendMessage: async (jid, content, options) => {
            console.log('\n--- [MOCK] RESPOSTA ENVIADA ---');
            console.log('Para:', jid);
            console.log('Conteúdo:', JSON.stringify(content, null, 2));
            console.log('-------------------------------\n');
            return { key: { id: 'MOCK_ID' } };
        },
        getContactById: async (id) => ({ id: { _serialized: id }, name: 'Usuário Teste' }),
        user: { id: '5531991400084:0@s.whatsapp.net' }
    },
    enviarMensagem: async (to, text) => console.log(`[MOCK] Enviar: ${text}`),
    enviarTexto: async (to, text) => console.log(`[MOCK] Enviar Texto: ${text}`),
    salvarNotificacaoPendente: async () => 'mock_path',
    processarNotificacoesPendentes: async () => 0,
    deveResponderNoGrupo: async () => true,
    obterHistoricoMensagens: async () => [],
    on: () => {},
    emit: () => {}
};

// Config Manager Mock
const mockConfigManager = {
    obterConfig: async () => ({
        mediaImage: true,
        visionModel: 'gemini-2.0-flash', // Modelo rápido
        systemInstructions: 'Descreva a imagem.'
    }),
    obterOuCriarUsuario: async (id, dados) => ({ sucesso: true, dados: { id, name: dados.nome || 'Teste' } })
};

// Transacoes Mock
const mockGerenciadorTransacoes = {
    criarTransacao: async () => ({ sucesso: true, dados: { id: 'tx_mock_123' } }),
    marcarComoProcessando: async () => {},
    adicionarDadosRecuperacao: async () => {},
    adicionarRespostaTransacao: async () => {},
    registrarFalhaEntrega: async () => {},
    marcarComoEntregue: async () => {},
    on: () => {},
    recuperarTransacoesIncompletas: async () => {}
};

// Gerenciador AI (vamos usar o real se tiver chave, senão mock)
// Mas para teste de FLUXO, podemos mockar a IA também se quisermos só ver se chega lá.
// Vamos tentar usar o real se o .env estiver carregado.
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const AdaptadorIA = require('../src/adaptadores/whatsapp/dominio/AdaptadorIA');
// Se não tiver chave, mocka.
const mockGerenciadorAI = process.env.API_KEY ? 
    require('../src/adaptadores/ai/GerenciadorAI')({ registrador: logger, apiKey: process.env.API_KEY }) :
    {
        processarImagem: async () => ({ sucesso: true, dados: 'Descrição Mockada da Imagem: Um quadrado branco.' })
    };

// Filas Midia (precisamos instanciar ou mockar)
// Para simplificar, vamos mockar a fila e chamar o callback direto
const mockFilasMidia = {
    adicionarTarefaImagem: async (dados) => {
        console.log('[MOCK] Tarefa de imagem adicionada à fila.');
        // Simular processamento da fila chamando a IA
        const resultadoIA = await mockGerenciadorAI.processarImagem(dados.buffer, dados.mimetype, 'Descreva', {});
        console.log('[MOCK] Resultado IA:', resultadoIA);
        
        // Simular callback
        if (mockFilasMidia.callback) {
            await mockFilasMidia.callback({
                transacaoId: 'tx_mock_123',
                senderNumber: dados.chatId,
                resposta: resultadoIA.sucesso ? resultadoIA.dados : 'Erro na IA',
                tipo: 'imagem'
            });
        }
    },
    setCallbackRespostaUnificado: (cb) => { mockFilasMidia.callback = cb; },
    limparTrabalhosPendentes: async () => {}
};

// Servico Mensagem (Real, mas com cliente mockado)
const criarServicoMensagem = require('../src/servicos/ServicoMensagem');
const servicoMensagem = criarServicoMensagem(logger, mockClienteWhatsApp, mockGerenciadorTransacoes);

// Instanciar o Gerenciador de Mensagens REAL
const criarGerenciadorMensagens = require('../src/adaptadores/whatsapp/GerenciadorMensagens');

const gerenciador = criarGerenciadorMensagens({
    registrador: logger,
    clienteWhatsApp: mockClienteWhatsApp,
    gerenciadorConfig: mockConfigManager,
    gerenciadorAI: mockGerenciadorAI,
    filasMidia: mockFilasMidia,
    gerenciadorTransacoes: mockGerenciadorTransacoes,
    servicoMensagem: servicoMensagem
});

// Inicializar
gerenciador.iniciar();

// --- CRIAR MENSAGEM MOCK (Imagem) ---
// Imagem PNG 1x1 pixel base64
const imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
const imageBuffer = Buffer.from(imageBase64, 'base64');

// Objeto de mensagem simulando estrutura do MapperMensagem (já mapeada)
const mensagemMock = {
    id: { _serialized: 'msg_mock_id_123', fromMe: false },
    body: 'Descreva isso',
    type: 'image',
    hasMedia: true,
    mimetype: 'image/png',
    from: '5511999999999@s.whatsapp.net', // Remetente externo
    author: '5511999999999@s.whatsapp.net',
    isGroup: false,
    timestamp: Date.now() / 1000,
    pushName: 'Tester Silva', // Nome para teste
    // Mock do método downloadMedia
    downloadMedia: async () => ({
        data: imageBase64,
        mimetype: 'image/png',
        filename: 'imagem.png'
    }),
    getChat: async () => ({ id: { _serialized: '5511999999999@s.whatsapp.net' }, isGroup: false }),
    // Mock para compatibilidade com logs/reply
    _data: { key: { remoteJid: '5511999999999@s.whatsapp.net' } }
};

console.log('\n--- INICIANDO TESTE DE FLUXO DE IMAGEM ---');
// Injetar mensagem no processador
gerenciador.processarMensagem(mensagemMock)
    .then(() => console.log('--- Processamento inicial concluído (aguardando fila) ---'))
    .catch(err => console.error('Erro no processamento:', err));
