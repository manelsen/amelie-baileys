// src/config/ConfigManager.js
const path = require('path');
const { Resultado } = require('../bancodedados/Repositorio');
const criarFabricaRepositorio = require('../bancodedados/FabricaRepositorio');

/**
 * Cria um gerenciador de configurações (padrão funcional)
 * @param {Object} registrador 
 * @param {string} diretorioDB 
 */
const criarConfigManager = (registrador, diretorioDB = path.join(process.cwd(), 'db')) => {
  // Usando a nova arquitetura internamente
  const fabricaRepositorio = criarFabricaRepositorio(registrador, diretorioDB);
  const repoConfig = fabricaRepositorio.obterRepositorioConfiguracao();
  const repoPrompts = fabricaRepositorio.obterRepositorioPrompts();
  const repoGrupos = fabricaRepositorio.obterRepositorioGrupos();
  const repoUsuarios = fabricaRepositorio.obterRepositorioUsuarios();
  
  // Configuração padrão
  const configPadrao = {
    temperature: 0.9,
    topK: 1,
    topP: 0.95,
    maxOutputTokens: 1024,
    mediaImage: true,  
    mediaAudio: false,  
    mediaVideo: true,
    modoDescricao: 'curto'
  };

  const definirPromptSistema = async (chatId, nome, texto) => {
    const resultado = await repoPrompts.definirPrompt(chatId, nome, texto);
    
    return Resultado.dobrar(
      resultado,
      () => true,
      (erro) => {
        registrador.error(`Erro ao definir prompt: ${erro.message}`);
        return Resultado.falha(erro);
      }
    );
  };

  const obterPromptSistema = async (chatId, nome) => {
    const resultado = await repoPrompts.obterPrompt(chatId, nome);
    
    return Resultado.dobrar(
      resultado,
      (prompt) => prompt,
      (erro) => {
        registrador.error(`Erro ao obter prompt: ${erro.message}`);
        return Resultado.falha(erro);
      }
    );
  };

  const definirConfig = async (chatId, param, valor) => {
    const resultado = await repoConfig.definirConfig(chatId, param, valor);
    
    return Resultado.dobrar(
      resultado,
      () => true,
      (erro) => {
        registrador.error(`Erro ao definir configuração: ${erro.message}`);
        return Resultado.falha(erro);
      }
    );
  };

  const obterConfig = async (chatId) => {
    const resultado = await repoConfig.obterConfigChat(chatId, configPadrao);
    
    return Resultado.dobrar(
      resultado,
      async (config) => {
        // Verificação explícita para legenda
        if (config.usarLegenda === true) {
          config.modoDescricao = 'legenda';
        }
        
        if (config.activePrompt) {
          const promptAtivo = await obterPromptSistema(chatId, config.activePrompt);
          if (promptAtivo) {
            config.systemInstructions = promptAtivo.text;
            const match = config.systemInstructions.match(/^Seu nome é (\w+)\./);
            config.botName = match ? match[1] : process.env.BOT_NAME || 'Amélie';
          }
        } else {
          config.botName = process.env.BOT_NAME || 'Amélie';
        }
  
        if (config.systemInstructions && typeof config.systemInstructions !== 'string') {
          config.systemInstructions = String(config.systemInstructions);
        }
  
        return config;
      },
      (erro) => {
        registrador.error(`Erro ao obter configuração: ${erro.message}`);
        return Resultado.falha(erro);
      }
    );
  };

  const resetarConfig = async (chatId) => {
    const configReset = {
      ...configPadrao,
      modoDescricao: 'curto',
      descricaoLonga: false,
      descricaoCurta: true,
      activePrompt: null
    };
    
    const resultado = await repoConfig.resetarConfig(chatId, configReset);
    
    return Resultado.dobrar(
      resultado,
      () => {
        registrador.info(`Configurações resetadas para ${chatId}`);
        return true;
      },
      (erro) => {
        registrador.error(`Erro ao resetar configuração: ${erro.message}`);
        return Resultado.falha(erro);
      }
    );
  };

  const listarPromptsSistema = async (chatId) => {
    const resultado = await repoPrompts.listarPrompts(chatId);
    
    return Resultado.dobrar(
      resultado,
      (prompts) => prompts,
      (erro) => {
        registrador.error(`Erro ao listar prompts: ${erro.message}`);
        return Resultado.falha(erro);
      }
    );
  };

  const definirPromptSistemaAtivo = async (chatId, nomePrompt) => {
    try {
      const prompt = await obterPromptSistema(chatId, nomePrompt);
      if (prompt) {
        await definirConfig(chatId, 'activePrompt', nomePrompt);
        return true;
      }
      registrador.warn(`Prompt ${nomePrompt} não encontrado para ${chatId}`);
      return false;
    } catch (erro) {
      registrador.error(`Erro ao definir prompt ativo: ${erro.message}`);
      return false;
    }
  };

  const limparPromptSistemaAtivo = async (chatId) => {
    try {
      await definirConfig(chatId, 'activePrompt', null);
      return true;
    } catch (erro) {
      registrador.error(`Erro ao limpar prompt ativo: ${erro.message}`);
      return false;
    }
  };

  const excluirPromptSistema = async (chatId, nome) => {
    const resultado = await repoPrompts.excluirPrompt(chatId, nome);
    
    return Resultado.dobrar(
      resultado,
      (sucesso) => {
        if (sucesso) {
          registrador.info(`Prompt ${nome} excluído para ${chatId}`);
          return true;
        } else {
          registrador.warn(`Prompt ${nome} não encontrado para exclusão`);
          return false;
        }
      },
      (erro) => {
        registrador.error(`Erro ao excluir prompt: ${erro.message}`);
        return Resultado.falha(erro);
      }
    );
  };

  const obterOuCriarGrupo = async (chat) => {
    const resultado = await repoGrupos.obterOuCriarGrupo(chat.id._serialized, { nome: chat.name });
    
    return Resultado.dobrar(
      resultado,
      (grupo) => grupo,
      (erro) => {
        registrador.error(`Erro ao processar grupo: ${erro.message}`);
        return Resultado.falha(erro);
      }
    );
  };

  const obterOuCriarUsuario = async (remetente, cliente) => {
    const resultado = await repoUsuarios.obterOuCriarUsuario(remetente.id._serialized, { nome: remetente.pushname });
    
    return Resultado.dobrar(
      resultado,
      (usuario) => usuario,
      (erro) => {
        registrador.error(`Erro ao processar usuário: ${erro.message}`);
        return Resultado.falha(erro);
      }
    );
  };

  return {
    definirConfig,
    obterConfig,
    resetarConfig,
    definirPromptSistema,
    obterPromptSistema,
    listarPromptsSistema,
    definirPromptSistemaAtivo,
    limparPromptSistemaAtivo,
    excluirPromptSistema,
    obterOuCriarGrupo,
    obterOuCriarUsuario
  };
};

module.exports = criarConfigManager;
