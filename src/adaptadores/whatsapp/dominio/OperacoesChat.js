/**
 * OperacoesChat - Funções para manipulação de chats e informações de usuário
 */
const _ = require('lodash/fp');
const { Resultado, Trilho } = require('../../../utilitarios/Ferrovia');

// Obtém informações do chat
const obterInformacoesChat = _.curry(async (registrador, dados) => {
  try {
    const { mensagem } = dados;
    const chat = await mensagem.getChat();
    const chatId = chat.id?._serialized;
    const ehGrupo = chatId.endsWith('@g.us');

    return Resultado.sucesso({
      ...dados,
      chat,
      chatId,
      ehGrupo
    });
  } catch (erro) {
    // Usar ID da mensagem e chat inicial para log de erro, caso 'chat' não seja obtido
    const msgId = dados?.mensagem?.id?._serialized || 'ID Indisponível';
    const initialChatId = dados?.mensagem?.from || 'Chat Indisponível';
    registrador.error(`[ObterInfoChat][${initialChatId}][${msgId}] Erro ao obter informações do chat: ${erro.message}`, erro);
    return Resultado.falha(erro);
  }
});

// Verifica se deve responder em grupo
const verificarRespostaGrupo = _.curry(async (clienteWhatsApp, dados) => {
  const { mensagem, chat, ehGrupo } = dados;

  // Se não for grupo, sempre processa
  if (!ehGrupo) {
    return Resultado.sucesso({ ...dados, deveResponder: true });
  }

  // Obter o resultado da verificação
  const deveResponder = await clienteWhatsApp.deveResponderNoGrupo(mensagem, chat);
  
  // Retornar falha se não deve responder
  if (!deveResponder) {
    return Resultado.falha(new Error("Não atende critérios para resposta em grupo"));
  }
  
  // Caso contrário, continuar com sucesso
  return Resultado.sucesso({ ...dados, deveResponder: true });
});


// Obter ou criar usuário
const obterOuCriarUsuario = _.curry(async (gerenciadorConfig, clienteWhatsApp, registrador, remetenteIdSerializado, chat, mensagem) => { // Adicionado: mensagem
  try {
    // Verifica se o cliente WhatsApp está disponível
    if (!clienteWhatsApp || !clienteWhatsApp.cliente) {
      registrador.error(`[OperacoesChat] Cliente WhatsApp não inicializado ao tentar obter usuário ${remetenteIdSerializado}.`);
      return Resultado.falha(new Error("Cliente WhatsApp não disponível"));
    }

    // Tentar obter nome do pushName da mensagem (Baileys) ou do objeto chat
    let nomeUsuario = mensagem?.pushName || chat?.name;
    const nomePadrao = (remetenteIdSerializado && typeof remetenteIdSerializado === 'string') 
        ? `Usuário${remetenteIdSerializado.substring(0, 6).replace(/[^0-9]/g, '')}`
        : 'UsuárioDesconhecido';

    if (!nomeUsuario) {
        // Fallback: tentar buscar o contato (mockado agora)
        try {
            const contato = await clienteWhatsApp.cliente.getContactById(remetenteIdSerializado);
            if (contato) {
                nomeUsuario = contato.pushname || contato.name || contato.shortName;
            }
        } catch (e) {
            // Ignora erro de busca
        }
    }

    if (!nomeUsuario || nomeUsuario === 'undefined') {
        nomeUsuario = nomePadrao;
    }

    // Se temos gerenciadorConfig, usar o método dele
    if (gerenciadorConfig) {
      const resultadoUsuario = await gerenciadorConfig.obterOuCriarUsuario(remetenteIdSerializado, { nome: nomeUsuario });
      return resultadoUsuario;
    }

    return Resultado.sucesso({
      id: remetenteIdSerializado,
      name: nomeUsuario,
      joinedAt: new Date()
    });
  } catch (erro) {
    // Verifica se é o erro conhecido "_serialized" para logar como warn, senão como error
    if (erro.message && erro.message.includes("Cannot read properties of undefined (reading '_serialized')")) {
      registrador.warn(`[OperacoesChat] Erro conhecido ao obter contato ${remetenteIdSerializado} (provavelmente interno da lib): ${erro.message}`);
    } else {
      registrador.error(`Erro inesperado ao obter informações do usuário ${remetenteIdSerializado}: ${erro.message}`, erro); // Log completo para outros erros
    }
    
    // Correção segura para evitar erro de substring em caso de falha
    const idSufixo = (remetenteIdSerializado && typeof remetenteIdSerializado === 'string') 
        ? remetenteIdSerializado.substring(0, 6).replace(/[^0-9]/g, '')
        : 'Desconhecido';

    return Resultado.sucesso({
      id: remetenteIdSerializado,
      name: `Usuário${idSufixo}`,
      joinedAt: new Date()
    });
  }
});

// Verifica se um usuário é administrador do grupo ou se está em chat privado
const verificarPermissaoComando = _.curry(async (mensagem, clienteWhatsApp, registrador) => {
  try {
    const chat = await mensagem.getChat();
    
    const ehGrupo = chat.id && chat.id.server === 'g.us';
    if (!ehGrupo) {
      return Resultado.sucesso(true);
    }

    const remetenteId = mensagem.author || mensagem.from;
    
    if (chat.groupMetadata && chat.groupMetadata.participants) {
      const participante = chat.groupMetadata.participants.find(p =>
        p.id?._serialized === remetenteId
      );
      
      if (participante) {
        const ehAdmin = participante.isAdmin || participante.isSuperAdmin;
        return Resultado.sucesso(ehAdmin);
      }
    }
    
    return Resultado.sucesso(false);
  } catch (erro) {
    registrador.error(`Erro na verificação de permissão: ${erro.message}`);
    return Resultado.sucesso(false);
  }
});

module.exports = {
  obterInformacoesChat,
  verificarRespostaGrupo,
  obterOuCriarUsuario,
  verificarPermissaoComando
};
