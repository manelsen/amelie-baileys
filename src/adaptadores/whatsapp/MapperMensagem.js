/**
 * MapperMensagem - Traduz objetos de mensagem de provedores externos (Baileys, etc)
 * para o formato interno da Amélie (compatível com a lógica de domínio existente).
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const getBody = (msg) => {
    if (!msg) return '';
    return msg.conversation || 
           msg.extendedTextMessage?.text || 
           msg.imageMessage?.caption || 
           msg.videoMessage?.caption || 
           msg.documentMessage?.caption ||
           '';
};

const getTipo = (msg) => {
    if (msg.imageMessage || msg.viewOnceMessage?.message?.imageMessage || msg.viewOnceMessageV2?.message?.imageMessage) return 'image';
    if (msg.videoMessage || msg.viewOnceMessage?.message?.videoMessage || msg.viewOnceMessageV2?.message?.videoMessage) return 'video';
    if (msg.audioMessage || msg.pttMessage) return 'ptt'; // Ou 'audio'
    if (msg.documentMessage) return 'document';
    if (msg.stickerMessage) return 'sticker';
    if (msg.conversation || msg.extendedTextMessage) return 'chat';
    return 'unknown';
};

const getMimeType = (m) => {
    const msg = m.message;
    if (!msg) return null;
    if (msg.imageMessage) return msg.imageMessage.mimetype;
    if (msg.videoMessage) return msg.videoMessage.mimetype;
    if (msg.audioMessage) return msg.audioMessage.mimetype;
    if (msg.documentMessage) return msg.documentMessage.mimetype;
    if (msg.stickerMessage) return msg.stickerMessage.mimetype;
    return null;
};

const getFilename = (m) => {
    const msg = m.message;
    if (!msg) return null;
    return msg.documentMessage?.fileName || null;
};

const getMentions = (msg) => {
    const contextInfo = msg.extendedTextMessage?.contextInfo || 
                        msg.imageMessage?.contextInfo || 
                        msg.videoMessage?.contextInfo ||
                        msg.documentMessage?.contextInfo;
    return contextInfo?.mentionedJid || [];
};

const getQuotedParticipant = (msg) => {
    const contextInfo = msg.extendedTextMessage?.contextInfo || 
                        msg.imageMessage?.contextInfo || 
                        msg.videoMessage?.contextInfo ||
                        msg.documentMessage?.contextInfo;
    return contextInfo?.participant || null;
};

const baileysParaAmelie = (m) => {
  const msgContent = m.message;
  if (!msgContent) return null;

  // Prioriza o remoteJidAlt (número real) se disponível
  // Se não, mantém o original (pode ser LID)
  const remoteJidOriginal = m.key.remoteJid;
  const remoteJidReal = m.key.remoteJidAlt || remoteJidOriginal;
  
  const from = remoteJidReal;
  
  // Ignorar mensagens de sistema/LID que não sejam chats reais ou grupos
  if (from.includes('@lid')) {
      // Apenas logar debug, não descartar silenciosamente se tiver conteúdo
      // console.log('[Mapper] Ignorando LID:', from); 
      // return null; // COMENTADO PARA DEBUG
  }

  // Log de Debug para entender o que está chegando
  // console.log('[Mapper] Mensagem Bruta (chaves):', Object.keys(msgContent));
  
  // DEBUG AVANÇADO: Inspecionar chaves para encontrar jidAlt ou número real
  /* if (from.includes('@lid')) {
      console.log('--- [Mapper] INSPEÇÃO LID ---');
      try {
        console.log('Objeto `m` (dump parcial):', JSON.stringify(m, (key, value) => {
            if (key === 'message' || key === 'messageTimestamp') return '[TRUNCATED]'; // Limpar visualização
            return value;
        }, 2));
      } catch (e) { console.log('Erro no dump:', e.message); }
      console.log('--- [Mapper] FIM INSPEÇÃO ---');
  } */

  const corpo = getBody(msgContent);
  const tipo = getTipo(msgContent);
  const temMidia = ['image', 'video', 'ptt', 'audio', 'document', 'sticker'].includes(tipo);
  
  // const from removido (já declarado acima)
  const isGroup = from.endsWith('@g.us');
  const author = isGroup ? (m.key.participant || m.key.remoteJid) : from;

  // Criação do objeto compatível com o contrato esperado pelo domínio
  return {
    id: { 
        _serialized: m.key.id,
        remote: from,
        remoteJid: from, // Compatibilidade nativa Baileys
        fromMe: m.key.fromMe,
        id: m.key.id,
        participant: m.key.participant // Importante para grupos
    },
    body: corpo,
    type: tipo,
    hasMedia: temMidia,
    from: from,
    to: m.key.fromMe ? from : (m.key.participant || from), // Aproximação
    author: author,
    isGroup: isGroup,
    timestamp: m.messageTimestamp,
    mentionedIds: getMentions(msgContent),
    quotedParticipant: getQuotedParticipant(msgContent),
    mimetype: getMimeType(m),
    filename: getFilename(m),
    pushName: m.pushName,

    // Métodos/Propriedades legados mockados ou adaptados
    _data: m, // Mantém o original para fallback
    
    // Implementação do download de mídia usando Baileys
    downloadMedia: async () => {
        try {
            // Logger fake para evitar erros no Baileys
            const logger = {
                level: 'silent',
                trace: () => {},
                debug: () => {},
                info: () => {},
                warn: () => {},
                error: () => {},
                child: () => logger
            };

            const buffer = await downloadMediaMessage(
                m,
                'buffer',
                { },
                { 
                    logger,
                    reuploadRequest: (msg) => new Promise(resolve => resolve(msg)) 
                }
            );
            
            return {
                data: buffer.toString('base64'),
                mimetype: getMimeType(m),
                filename: getFilename(m)
            };
        } catch (e) {
            console.error('Erro ao baixar mídia (Baileys):', e.message);
            throw e;
        }
    },
    
    // Método getChat mockado para evitar crashes imediatos em OperacoesChat.js
    // Idealmente, OperacoesChat.js deve ser refatorado para não depender disso.
    getChat: async () => ({
        id: { _serialized: from },
        isGroup: isGroup,
        name: m.pushName || 'Usuário', // Nome provisório
        participants: [], // Não temos essa info aqui
        sendStateTyping: async () => {},
        clearState: async () => {}
    })
  };
};

module.exports = {
  baileysParaAmelie
};
