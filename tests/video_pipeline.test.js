const { criarProcessadorPrincipalVideo } = require('../src/adaptadores/queue/FilasProcessadores');
const { Resultado } = require('../src/utilitarios/Ferrovia');

// Mock das dependências
const mockRegistrador = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

const mockFilas = {
  video: {
    upload: {
      add: jest.fn().mockResolvedValue({ id: 'job_upload_123' })
    }
  }
};

const mockNotificarErro = jest.fn();

describe('ProcessadorPrincipalVideo', () => {
  let processador;

  beforeEach(() => {
    jest.clearAllMocks();
    processador = criarProcessadorPrincipalVideo(mockRegistrador, mockFilas, mockNotificarErro);
  });

  test('Deve redirecionar para fila de upload preservando messageKey', async () => {
    // 1. Setup do Job de entrada
    const jobData = {
      tempFilename: '/tmp/video.mp4',
      chatId: '551199999999@s.whatsapp.net',
      messageId: 'MSG_ID_123',
      messageKey: { 
          remoteJid: '551199999999@s.whatsapp.net', 
          id: 'MSG_ID_123', 
          fromMe: false 
      },
      mimeType: 'video/mp4',
      senderNumber: '551199999999@s.whatsapp.net',
      transacaoId: 'tx_123',
      remetenteName: 'Manel',
      tipo: 'video'
    };

    const job = { data: jobData, id: 'job_principal_1' };

    // 2. Executar
    const resultado = await processador(job);

    // 3. Asserções
    expect(resultado.sucesso).toBe(true);
    expect(resultado.dados.redirectedJobId).toBe('job_upload_123');

    // Verificar se a fila de upload foi chamada corretamente
    expect(mockFilas.video.upload.add).toHaveBeenCalledTimes(1);
    
    // *** O TESTE DE OURO ***
    // Verificar se messageKey foi repassado no objeto de dados
    const dadosChamada = mockFilas.video.upload.add.mock.calls[0][1]; // Segundo argumento do .add()
    expect(dadosChamada).toHaveProperty('messageKey');
    expect(dadosChamada.messageKey).toEqual(jobData.messageKey);
    
    // Verificar se remoteJid existe dentro da messageKey (crucial para o Baileys)
    expect(dadosChamada.messageKey.remoteJid).toBeDefined();
  });

  test('Deve falhar se a fila de upload não estiver definida', async () => {
    // Setup com filas quebradas
    const filasQuebradas = {}; 
    const processadorQuebrado = criarProcessadorPrincipalVideo(mockRegistrador, filasQuebradas, mockNotificarErro);
    
    const job = { data: {}, id: 'job_fail' };
    const resultado = await processadorQuebrado(job);

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro.message).toMatch(/instância da fila.*inválida/i);
  });
});