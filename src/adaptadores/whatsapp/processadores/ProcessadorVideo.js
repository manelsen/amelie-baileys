/**
 * ProcessadorVideo - Processamento específico para mensagens com vídeos
 */
const _ = require('lodash/fp');
const { Resultado } = require('../../../utilitarios/Ferrovia');
const { inicializarProcessamento, gerenciarCicloVidaTransacao } = require('../util/ProcessamentoHelper');
const fs = require('fs');
const path = require('path');
const InstrucoesSistema = require('../../../config/InstrucoesSistema');

const criarProcessadorVideo = (dependencias) => {
  const {
    registrador,
    servicoMensagem,
    filasMidia
  } = dependencias;

  // Função helper para verificar tamanho
  const verificarTamanhoVideo = _.curry((dadosAnexo, limiteMB = 20) => {
     const tamanhoVideoMB = dadosAnexo.data.length / (1024 * 1024);
     if (tamanhoVideoMB > limiteMB) {
       return Resultado.falha(new Error(`Vídeo muito grande (${tamanhoVideoMB.toFixed(2)}MB). Limite: ${limiteMB}MB`));
     }
     return Resultado.sucesso({ dadosAnexo, tamanhoVideoMB });
   });

  // Função helper para salvar arquivo temporário
  const salvarArquivoTemporario = _.curry(async (dadosAnexo) => {
     try {
       const dataHora = new Date().toISOString().replace(/[:.]/g, '-');
       const arquivoTemporario = `./temp/video_${dataHora}_${Math.floor(Math.random() * 10000)}.mp4`;
       const diretorio = path.dirname(arquivoTemporario);
       await fs.promises.mkdir(diretorio, { recursive: true });
       
       const videoBuffer = Buffer.from(dadosAnexo.data, 'base64');
       await fs.promises.writeFile(arquivoTemporario, videoBuffer);
       
       return Resultado.sucesso(arquivoTemporario);
     } catch (erro) {
       registrador.error(`Erro ao salvar arquivo temporário: ${erro.message}`);
       return Resultado.falha(erro);
     }
   });

  /**
   * Processa uma mensagem de vídeo
   * @param {Object} dados - Contém mensagem, chatId e dadosAnexo
   */
  const processarMensagemVideo = async (dados) => {
    const { mensagem, chatId, dadosAnexo } = dados;
    let arquivoTemporario = null;

    // 1. Inicialização e Verificação de Configuração
    const resultadoInit = await inicializarProcessamento(dependencias, mensagem, chatId, 'mediaVideo');
    if (!resultadoInit.sucesso) return resultadoInit;

    const { chat, config, remetente } = resultadoInit.dados;

    // 2. Verificação de Tamanho (Específico de Vídeo)
    const resultadoTamanho = verificarTamanhoVideo(dadosAnexo);
    if (!resultadoTamanho.sucesso) {
      registrador.warn(`[Video] ${resultadoTamanho.erro.message}`);
      await servicoMensagem.enviarResposta(mensagem, 'Desculpe, só posso processar vídeos de até 20MB.');
      return resultadoTamanho;
    }

    // 3. Execução do Ciclo de Vida da Transação
    return gerenciarCicloVidaTransacao(dependencias, mensagem, chat, async (transacao) => {
      // Salvar arquivo temporário
      const resultadoSalvar = await salvarArquivoTemporario(dadosAnexo);
      if (!resultadoSalvar.sucesso) throw resultadoSalvar.erro;
      
      arquivoTemporario = resultadoSalvar.dados;

      // Determinar prompt
      let promptUsuario = "";
      if (config.modoDescricao === 'legenda' || config.usarLegenda === true) {
        promptUsuario = InstrucoesSistema.obterPromptVideoLegenda();
      } else if (mensagem.body && mensagem.body.trim() !== '') {
        promptUsuario = mensagem.body.trim();
      } else if (config.modoDescricao === 'longo') {
        promptUsuario = InstrucoesSistema.obterPromptVideo();
      } else {
        promptUsuario = InstrucoesSistema.obterPromptVideoCurto();
      }

      registrador.info(`[Video] Adicionando vídeo à fila (Transação: ${transacao.id})`);

      await filasMidia.adicionarVideo({
        tempFilename: arquivoTemporario,
        chatId,
        messageId: mensagem.id._serialized,
        messageKey: mensagem.id, // ADICIONADO PARA CORREÇÃO DE REPLY
        mimeType: dadosAnexo.mimetype,
        userPrompt: promptUsuario,
        senderNumber: mensagem.from,
        transacaoId: transacao.id,
        remetenteName: remetente.name,
        modoDescricao: config.modoDescricao || 'curto',
        usarLegenda: config.usarLegenda === true,
        modoLegenda: config.modoDescricao === 'legenda' || config.usarLegenda === true
      });

      return { sucesso: true, dados: { transacao } };
    });
  };

  return { processarMensagemVideo };
};

module.exports = criarProcessadorVideo;
