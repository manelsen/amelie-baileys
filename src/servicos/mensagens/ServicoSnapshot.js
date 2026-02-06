/**
 * ServicoSnapshot - Módulo responsável por capturar e reconstruir contexto de mensagens
 * 
 * Extraído de ServicoMensagem.js para separação de responsabilidades.
 */

const { Resultado } = require('../../utilitarios/Ferrovia');

/**
 * Captura snapshot de uma mensagem original para preservação de contexto
 * @param {Object} mensagemOriginal - Mensagem original (Baileys ou Mapeada)
 * @param {Object} cliente - Cliente WhatsApp (Interface Baileys)
 * @param {Object} registrador - Logger
 * @returns {Promise<Resultado>} Resultado com snapshot da mensagem
 */
const capturarSnapshotMensagem = async (mensagemOriginal, cliente, registrador) => {
  try {
    if (!mensagemOriginal) {
      return Resultado.falha(new Error("Mensagem original não fornecida"));
    }
    
    // Tenta obter dados da mensagem mapeada ou crua
    const id = mensagemOriginal.id?._serialized || mensagemOriginal.key?.id || null;
    const from = mensagemOriginal.from || mensagemOriginal.key?.remoteJid;
    const author = mensagemOriginal.author || mensagemOriginal.participant || mensagemOriginal.key?.participant || from;
    
    // Se for mensagem crua do Baileys, o corpo pode estar aninhado
    const body = mensagemOriginal.body || 
                 mensagemOriginal.message?.conversation || 
                 mensagemOriginal.message?.extendedTextMessage?.text || '';

    const snapshot = {
      id: id,
      body: body,
      tipo: mensagemOriginal.type || 'texto', // O Mapper já deve ter normalizado isso
      data: new Date().toISOString(),
      
      // Metadados do remetente
      remetente: {
        id: author,
        nome: null // será preenchido abaixo
      },
      
      // Metadados do chat
      chat: {
        id: from,
        tipo: (from && from.endsWith('@g.us')) ? 'grupo' : 'individual',
        nome: null
      },
      
      // Flag para indicar se há mídia
      temMidia: mensagemOriginal.hasMedia || false,
      tipoMidia: mensagemOriginal.type || 'texto',
      
      // Timestamp de criação do snapshot
      timestampSnapshot: Date.now()
    };
    
    // Tentar obter nome do remetente
    try {
      if (cliente && typeof cliente.getContactById === 'function') {
        // Usa o método proxy do ClienteBaileys
        const contato = await cliente.getContactById(snapshot.remetente.id);
        snapshot.remetente.nome = contato.name || contato.pushname || 'Usuário';
      } else {
        snapshot.remetente.nome = mensagemOriginal._data?.notifyName || 'Usuário';
      }
    } catch (erroContato) {
      snapshot.remetente.nome = 'Usuário';
    }
    
    // Nome do Chat
    snapshot.chat.nome = snapshot.chat.tipo === 'grupo' ? 'Grupo' : 'Chat Individual';
    
    // Se for mídia, capturar descrição para o contexto
    if (snapshot.temMidia) {
      if (snapshot.tipoMidia === 'image') snapshot.descricaoMidia = '📷 [Imagem]';
      else if (snapshot.tipoMidia === 'video') snapshot.descricaoMidia = '🎥 [Vídeo]';
      else if (snapshot.tipoMidia === 'audio' || snapshot.tipoMidia === 'ptt') snapshot.descricaoMidia = '🔊 [Áudio]';
      else if (snapshot.tipoMidia === 'document') snapshot.descricaoMidia = '📄 [Documento]';
      else snapshot.descricaoMidia = '[Mídia]';
    }
    
    return Resultado.sucesso(snapshot);
  } catch (erro) {
    registrador.error(`[Snapshot] Erro ao capturar snapshot: ${erro.message}`);
    return Resultado.falha(erro);
  }
};

/**
 * Gera texto de contexto a partir de um snapshot
 * @param {Object} snapshot - Snapshot da mensagem original
 * @returns {Resultado} Resultado com texto de contexto formatado
 */
const gerarTextoContexto = (snapshot) => {
  if (!snapshot) {
    return Resultado.falha(new Error("Snapshot não fornecido"));
  }
  
  try {
    let textoContexto;
    const nome = snapshot.remetente.nome || 'Alguém';
    
    // Para mensagens de texto simples
    if (!snapshot.temMidia) {
      const trecho = snapshot.body ? `"${snapshot.body.substring(0, 50)}${snapshot.body.length > 50 ? '...' : ''}"` : 'uma mensagem';
      textoContexto = `📩 Em resposta a ${nome}: ${trecho}`;
    }
    // Para mensagens com mídia
    else {
      const tipoMidia = snapshot.descricaoMidia || '[Mídia]';
      const textoAdicional = snapshot.body ? ` com legenda: "${snapshot.body.substring(0, 30)}..."` : '';
      textoContexto = `📩 Em resposta a ${tipoMidia} de ${nome}${textoAdicional}`;
    }
    
    return Resultado.sucesso(textoContexto);
  } catch (erro) {
    return Resultado.falha(erro);
  }
};

module.exports = {
  capturarSnapshotMensagem,
  gerarTextoContexto
};
