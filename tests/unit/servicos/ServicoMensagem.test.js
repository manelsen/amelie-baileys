const MapperMensagem = require('../../../src/adaptadores/whatsapp/MapperMensagem');

describe('ServicoMensagem (TDD)', () => {
  // Mock do Cliente Baileys e Registrador
  const mockRegistrador = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  };

  const mockClienteWhatsApp = {
    // Simula a interface que o ServicoMensagem espera do adaptador Baileys
    enviarTexto: jest.fn().mockResolvedValue({ sucesso: true })
  };

  const criarServicoMensagem = require('../../../src/servicos/ServicoMensagem');

  it('deve enviar uma resposta utilizando o objeto mapeado da Amélie', async () => {
    const servico = criarServicoMensagem(mockRegistrador, mockClienteWhatsApp);
    
    // Objeto já mapeado pelo MapperMensagem
    const mensagemMapeada = {
      id: { id: 'msg_origem_123', _serialized: 'msg_origem_123' },
      from: '12345@s.whatsapp.net',
      body: 'Pergunta do usuário',
      hasMedia: false
    };

    const resultado = await servico.enviarResposta(mensagemMapeada, 'Resposta da Amélie');

    expect(resultado.sucesso).toBe(true);
    expect(mockClienteWhatsApp.enviarTexto).toHaveBeenCalledWith(
      '12345@s.whatsapp.net',
      'Resposta da Amélie',
      { quoted: expect.objectContaining({ id: { id: 'msg_origem_123', _serialized: 'msg_origem_123' } }) }
    );
  });
});
