const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

/**
 * Adaptador para normalizar as mensagens do Baileys para o formato interno da Amélie
 */
const normalizarMensagemBaileys = (m) => {
    const msg = m.message;
    if (!msg) return null;

    const tipo = Object.keys(msg)[0];
    const remetente = m.key.remoteJid;
    const ehGrupo = remetente.endsWith('@g.us');
    
    // Extração de texto dependendo do tipo de mensagem
    let texto = '';
    if (tipo === 'conversation') texto = msg.conversation;
    else if (tipo === 'extendedTextMessage') texto = msg.extendedTextMessage.text;
    else if (tipo === 'imageMessage') texto = msg.imageMessage.caption;
    else if (tipo === 'videoMessage') texto = msg.videoMessage.caption;

    return {
        id: { _serialized: m.key.id },
        from: remetente,
        author: m.key.participant || remetente,
        body: texto,
        type: tipo.replace('Message', ''),
        hasMedia: ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(tipo),
        timestamp: m.messageTimestamp,
        ehGrupo,
        // Mock de métodos para manter compatibilidade com o pipeline atual
        reply: async (conteudo) => {
            // Este método será mapeado pelo serviço de mensagem ou injetado
        },
        _raw: m
    };
};

module.exports = { normalizarMensagemBaileys };
