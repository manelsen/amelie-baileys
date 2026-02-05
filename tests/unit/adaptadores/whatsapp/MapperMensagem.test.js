/**
 * Testes unitários para MapperMensagem.js
 * 
 * Valida a conversão de mensagens do formato Baileys para o formato interno da Amélie.
 * Cobre diferentes tipos de mensagem: texto, imagem, áudio, vídeo, documento.
 */

const { baileysParaAmelie } = require('../../../../src/adaptadores/whatsapp/MapperMensagem');

describe('MapperMensagem.js', () => {
  
  // Factory para criar mensagens de teste
  const criarMensagemBase = (overrides = {}) => ({
    key: { id: 'msg_123', remoteJid: 'user@s.whatsapp.net', participant: null },
    pushName: 'Usuário Teste',
    message: {},
    ...overrides
  });

  describe('Mensagens de Texto', () => {
    
    test('deve mapear mensagem de texto simples (conversation)', () => {
      const raw = criarMensagemBase({
        key: { id: '123', remoteJid: 'user@s.whatsapp.net' },
        pushName: 'Manel',
        message: { conversation: 'Olá, tudo bem?' }
      });
      
      const mapped = baileysParaAmelie(raw);
      
      expect(mapped.id.id).toBe('123');
      expect(mapped.body).toBe('Olá, tudo bem?');
      expect(mapped.type).toBe('chat');
      expect(mapped.hasMedia).toBe(false);
      expect(mapped.pushName).toBe('Manel');
    });

    test('deve mapear mensagem de texto estendida', () => {
      const raw = criarMensagemBase({
        key: { id: '456', remoteJid: 'user@s.whatsapp.net' },
        message: { extendedTextMessage: { text: 'Texto longo com formatação' } }
      });
      
      const mapped = baileysParaAmelie(raw);
      
      expect(mapped.body).toBe('Texto longo com formatação');
      expect(mapped.type).toBe('chat');
    });

    test('deve extrair chatId corretamente (from)', () => {
      const raw = criarMensagemBase({
        key: { id: '789', remoteJid: '5511999999999@s.whatsapp.net' },
        message: { conversation: 'teste' }
      });
      
      const mapped = baileysParaAmelie(raw);
      
      expect(mapped.from).toBe('5511999999999@s.whatsapp.net');
    });
  });

  describe('Mensagens de Mídia', () => {
    
    test('deve mapear imagem com legenda', () => {
      const raw = criarMensagemBase({
        key: { id: 'img_001', remoteJid: 'user@s.whatsapp.net' },
        message: { 
          imageMessage: { 
            caption: 'Foto da viagem', 
            mimetype: 'image/jpeg' 
          } 
        }
      });
      
      const mapped = baileysParaAmelie(raw);
      
      expect(mapped.type).toBe('image');
      expect(mapped.body).toBe('Foto da viagem');
      expect(mapped.hasMedia).toBe(true);
      expect(mapped.mimetype).toBe('image/jpeg');
    });

    test('deve mapear imagem sem legenda', () => {
      const raw = criarMensagemBase({
        message: { 
          imageMessage: { mimetype: 'image/png' } 
        }
      });
      
      const mapped = baileysParaAmelie(raw);
      
      expect(mapped.type).toBe('image');
      expect(mapped.body).toBe('');
      expect(mapped.hasMedia).toBe(true);
    });

    test('deve mapear vídeo com legenda', () => {
      const raw = criarMensagemBase({
        message: { 
          videoMessage: { 
            caption: 'Vídeo engraçado', 
            mimetype: 'video/mp4' 
          } 
        }
      });
      
      const mapped = baileysParaAmelie(raw);
      
      expect(mapped.type).toBe('video');
      expect(mapped.body).toBe('Vídeo engraçado');
      expect(mapped.mimetype).toBe('video/mp4');
    });

    test('deve mapear áudio (audioMessage)', () => {
      const raw = criarMensagemBase({
        message: { 
          audioMessage: { mimetype: 'audio/ogg; codecs=opus' } 
        }
      });
      
      const mapped = baileysParaAmelie(raw);
      
      expect(mapped.type).toBe('ptt'); // Mapper atualmente retorna 'ptt' para áudio
      expect(mapped.hasMedia).toBe(true);
    });

    test('deve mapear áudio PTT (mensagem de voz)', () => {
      const raw = criarMensagemBase({
        message: { 
          pttMessage: { mimetype: 'audio/ogg; codecs=opus' } 
        }
      });
      
      // Nota: Baileys geralmente não usa 'pttMessage' como chave raiz de message, 
      // mas sim audioMessage com ptt: true.
      // O Mapper verifica audioMessage. 
      // Se a entrada raw tiver pttMessage (como no teste antigo), o getTipo retornará 'unknown' 
      // a menos que o mapper suporte pttMessage explicitamente.
      // O Mapper atual suporta: image, video, audio, document, sticker, conversation, extendedText.
      // Vou ajustar o teste para usar audioMessage que é o padrão Baileys.
      
      const rawAdjusted = criarMensagemBase({
        message: { 
            audioMessage: { mimetype: 'audio/ogg; codecs=opus', ptt: true }
        }
      });
      
      const mapped = baileysParaAmelie(rawAdjusted);
      
      expect(mapped.type).toBe('ptt');
    });

    test('deve mapear documento', () => {
      const raw = criarMensagemBase({
        message: { 
          documentMessage: { 
            mimetype: 'application/pdf',
            fileName: 'relatorio.pdf'
          } 
        }
      });
      
      const mapped = baileysParaAmelie(raw);
      
      expect(mapped.type).toBe('document');
      expect(mapped.mimetype).toBe('application/pdf');
      expect(mapped.hasMedia).toBe(true);
      expect(mapped.filename).toBe('relatorio.pdf');
    });
  });

  describe('Edge Cases', () => {
    
    test('deve lidar com mensagem sem conteúdo (message vazio)', () => {
      const raw = criarMensagemBase({
        key: { id: '000', remoteJid: 'user@s.whatsapp.net' },
        message: null // Simulando ausência de message
      });
      
      const mapped = baileysParaAmelie(raw);
      
      expect(mapped).toBeNull();
    });

    test('deve lidar com message undefined', () => {
      const raw = criarMensagemBase({
        key: { id: '001', remoteJid: 'user@s.whatsapp.net' },
        message: undefined
      });
      
      const mapped = baileysParaAmelie(raw);
      
      expect(mapped).toBeNull();
    });

    test('deve lidar com pushName ausente', () => {
      const raw = {
        key: { id: '002', remoteJid: 'user@s.whatsapp.net' },
        message: { conversation: 'teste' }
        // pushName ausente
      };
      
      const mapped = baileysParaAmelie(raw);
      
      expect(mapped.pushName).toBeUndefined(); // Ou null, dependendo do JS
    });

    test('deve preservar referência ao objeto raw (_data)', () => {
      const raw = criarMensagemBase({
        message: { conversation: 'teste' }
      });
      
      const mapped = baileysParaAmelie(raw);
      
      expect(mapped._data).toBe(raw);
    });

    test('deve extrair participant em mensagens de grupo', () => {
      const raw = criarMensagemBase({
        key: { 
          id: 'grp_001', 
          remoteJid: 'grupo@g.us',
          participant: '5511888888888@s.whatsapp.net'
        },
        message: { conversation: 'Mensagem no grupo' }
      });
      
      const mapped = baileysParaAmelie(raw);
      
      expect(mapped.from).toBe('grupo@g.us');
      expect(mapped.author).toBe('5511888888888@s.whatsapp.net');
    });
  });
});
