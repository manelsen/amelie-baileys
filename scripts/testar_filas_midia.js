// scripts/testar_filas_midia.js
const pino = require('pino');
const inicializarFilasMidia = require('../src/adaptadores/queue/FilasMidia');

// Mock Logger
const logger = pino({ level: 'info' });

// Mock Gerenciador AI (sempre retorna sucesso)
const mockGerenciadorAI = {
    processarImagem: async () => ({ sucesso: true, dados: 'Descrição da imagem mockada' }),
    uploadArquivoGoogle: async () => ({ sucesso: true, dados: { file: { name: 'vid.mp4', uri: 'http://uri' } } }),
    getArquivoGoogle: async () => ({ sucesso: true, dados: { state: 'SUCCEEDED', uri: 'http://uri' } }),
    gerarConteudoDeArquivoUri: async () => ({ sucesso: true, dados: 'Descrição do vídeo mockada' }),
    deleteArquivoGoogle: async () => ({ sucesso: true })
};

// Mock Config
const mockConfigManager = {
    obterConfig: async () => ({ modoDescricao: 'curto' })
};

// Mock Serviço Mensagem (não deve ser chamado se mockarmos o callback, mas por segurança)
const mockServicoMensagem = {
    enviarResposta: async () => ({ sucesso: true })
};

console.log('--- INICIANDO TESTE DE FILAS ---');

try {
    // Inicializar filas
    const filas = inicializarFilasMidia(logger, mockGerenciadorAI, mockConfigManager, mockServicoMensagem);

    // Definir callback de teste para verificar se messageKey chega
    filas.setCallbackRespostaUnificado((resultado) => {
        console.log('\n--- CALLBACK RECEBIDO ---');
        console.log('Resultado:', JSON.stringify(resultado, null, 2));

        if (resultado.messageKey && resultado.messageKey.id === 'MOCK_KEY_ID') {
            console.log('✅ SUCESSO: messageKey preservada e recebida no callback!');
            process.exit(0);
        } else {
            console.error('❌ FALHA: messageKey ausente ou incorreta!');
            console.error('Esperado: { id: "MOCK_KEY_ID" }');
            console.error('Recebido:', resultado.messageKey);
            process.exit(1);
        }
    });

    // Adicionar tarefa de imagem com messageKey
    console.log('Adicionando tarefa de imagem...');
    filas.adicionarImagem({
        imageData: { data: 'base64...', mimetype: 'image/png' },
        chatId: '123@s.whatsapp.net',
        messageId: 'msg_123',
        messageKey: { id: 'MOCK_KEY_ID', remoteJid: '123@s.whatsapp.net' }, // A CHAVE QUE QUEREMOS PRESERVAR
        senderNumber: '123@s.whatsapp.net',
        transacaoId: 'tx_test',
        remetenteName: 'Tester',
        userPrompt: 'Descreva'
    });

} catch (erro) {
    console.error('Erro ao inicializar:', erro);
}
