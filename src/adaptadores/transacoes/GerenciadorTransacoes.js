const EventEmitter = require('events');
const path = require('path');
const { Resultado } = require('../../bancodedados/Repositorio');

class GerenciadorTransacoes extends EventEmitter {
  constructor(registrador, diretorioDB = path.join(process.cwd(), 'db')) {
    super();
    this.registrador = registrador;
    this.diretorioDB = diretorioDB;
    
    // Usando a nova arquitetura internamente
    const FabricaRepositorio = require('../../bancodedados/FabricaRepositorio');
    this.fabricaRepositorio = new FabricaRepositorio(registrador, diretorioDB);
    this.repoTransacoes = this.fabricaRepositorio.obterRepositorioTransacoes();
    
    // Limpar transações antigas na inicialização
    this.limparTransacoesAntigas();
    
    // Programar limpeza periódica
    setInterval(() => this.limparTransacoesAntigas(), 24 * 60 * 60 * 1000);
    
    this.registrador.info('Gerenciador de transações inicializado');
  }

  // Mantém a assinatura do método original
  async criarTransacao(mensagem, chat) {
    const resultado = await this.repoTransacoes.criarTransacao(mensagem, chat);
    
    return Resultado.dobrar(
      resultado,
      (documento) => {
        this.registrador.debug(`Transação criada: ${documento.id}`);
        return documento;
      },
      (erro) => {
        this.registrador.error(`Erro ao criar transação: ${erro.message}`);
        throw erro;
      }
    );
  }

  async adicionarDadosRecuperacao(transacaoId, dadosRecuperacao) {
    const resultado = await this.repoTransacoes.adicionarDadosRecuperacao(transacaoId, dadosRecuperacao);
    
    return Resultado.dobrar(
      resultado,
      (infoAtualizacao) => {
        if (infoAtualizacao.numAfetados === 0) {
          this.registrador.warn(`Transação ${transacaoId} não encontrada para adicionar dados de recuperação`);
          return false;
        }
        this.registrador.debug(`Dados de recuperação adicionados à transação ${transacaoId}`);
        return true;
      },
      (erro) => {
        this.registrador.error(`Erro ao adicionar dados de recuperação: ${erro.message}`);
        throw erro;
      }
    );
  }

  async recuperarTransacoesIncompletas() {
    const resultado = await this.repoTransacoes.buscarTransacoesIncompletas();
    
    return Resultado.dobrar(
      resultado,
      async (transacoes) => {
        if (transacoes.length === 0) {
          this.registrador.info(`Nenhuma transação pendente para recuperação`);
          return 0;
        }
        
        this.registrador.info(`Recuperando ${transacoes.length} transações interrompidas...`);
        
        const recuperadas = await transacoes.reduce(async (contadorPromise, transacao) => {
          const contador = await contadorPromise;
          try {
            this.emit('transacao_para_recuperar', transacao);
            
            await this.atualizarStatusTransacao(
              transacao.id, 
              'recuperacao_em_andamento', 
              'Transação recuperada após restart do sistema'
            );
            
            return contador + 1;
          } catch (erro) {
            this.registrador.error(`Erro ao recuperar transação ${transacao.id}: ${erro.message}`);
            return contador;
          }
        }, Promise.resolve(0));
        
        this.registrador.info(`${recuperadas} transações enviadas para recuperação`);
        return recuperadas;
      },
      (erro) => {
        this.registrador.error(`Erro ao buscar transações para recuperação: ${erro.message}`);
        throw erro;
      }
    );
  }

  async marcarComoProcessando(transacaoId) {
    return this.atualizarStatusTransacao(transacaoId, 'processando', 'Processamento iniciado');
  }

  async adicionarRespostaTransacao(transacaoId, resposta) {
    const resultado = await this.repoTransacoes.adicionarResposta(transacaoId, resposta);
    
    return Resultado.dobrar(
      resultado,
      (infoAtualizacao) => {
        if (infoAtualizacao.numAfetados === 0) {
          this.registrador.warn(`Transação ${transacaoId} não encontrada para adicionar resposta`);
          return false;
        }
        this.registrador.debug(`Resposta adicionada à transação ${transacaoId}`);
        return true;
      },
      (erro) => {
        this.registrador.error(`Erro ao adicionar resposta à transação: ${erro.message}`);
        throw erro;
      }
    );
  }

  async marcarComoEntregue(transacaoId) {
    return this.atualizarStatusTransacao(transacaoId, 'entregue', 'Mensagem entregue com sucesso');
  }

  async registrarFalhaEntrega(transacaoId, erro) {
    const resultado = await this.repoTransacoes.registrarFalhaEntrega(transacaoId, erro);
    
    return Resultado.dobrar(
      resultado,
      () => {
        this.registrador.warn(`Falha registrada para transação ${transacaoId}: ${erro}`);
        return true;
      },
      (erroOperacao) => {
        this.registrador.error(`Erro ao registrar falha: ${erroOperacao.message}`);
        throw erroOperacao;
      }
    );
  }

  async atualizarStatusTransacao(transacaoId, status, detalhes) {
    const resultado = await this.repoTransacoes.atualizarStatus(transacaoId, status, detalhes);
    
    return Resultado.dobrar(
      resultado,
      (infoAtualizacao) => {
        if (infoAtualizacao.numAfetados === 0) {
          this.registrador.warn(`Transação ${transacaoId} não encontrada para atualização`);
          return false;
        } 
        this.registrador.debug(`Status da transação ${transacaoId} atualizado para ${status}`);
        return true;
      },
      (erro) => {
        this.registrador.error(`Erro ao atualizar status da transação: ${erro.message}`);
        throw erro;
      }
    );
  }

  async processarTransacoesPendentes(clienteWhatsApp) {
    const processarTransacao = async (transacao) => {
      if (!transacao.resposta) {
        this.registrador.warn(`Transação ${transacao.id} sem resposta para reenviar`);
        return false;
      }
      
      // Verificar diferentes formas de enviar mensagens
      try {
        // Verificar qual interface temos disponível
        if (clienteWhatsApp.cliente && typeof clienteWhatsApp.cliente.sendMessage === 'function') {
          // Estamos recebendo o objeto ClienteWhatsApp, usar o cliente interno
          await clienteWhatsApp.cliente.sendMessage(transacao.chatId, transacao.resposta);
        } 
        else if (typeof clienteWhatsApp.sendMessage === 'function') {
          // Estamos recebendo o cliente diretamente
          await clienteWhatsApp.sendMessage(transacao.chatId, transacao.resposta);
        }
        else if (typeof clienteWhatsApp.enviarMensagem === 'function') {
          // Usando método wrapper em português
          await clienteWhatsApp.enviarMensagem(transacao.chatId, transacao.resposta);
        }
        else {
          throw new Error("Cliente WhatsApp inválido ou sem método de envio");
        }
        
        await this.marcarComoEntregue(transacao.id);
        this.registrador.info(`Transação ${transacao.id} reprocessada com sucesso`);
        return true;
      } catch (erro) {
        this.registrador.error(`Erro ao reprocessar transação ${transacao.id}: ${erro.message}`);
        return false;
      }
    };
    
    try {
      // Agora vamos tentar diferentes nomes possíveis para o método
      let transacoes = [];
      
      if (typeof this.repoTransacoes.encontrarTransacoesPendentes === 'function') {
        transacoes = await this.repoTransacoes.encontrarTransacoesPendentes();
      } 
      else if (typeof this.repoTransacoes.encontrar === 'function') {
        // Tentar usar o método genérico com filtro
        transacoes = await this.repoTransacoes.encontrar({
          status: { $in: ['processando', 'resposta_gerada', 'falha_temporaria'] },
          resposta: { $exists: true }
        });
      }
      else {
        throw new Error("Método para buscar transações pendentes não encontrado");
      }
      
      if (transacoes.length === 0) {
        this.registrador.info(`Nenhuma transação pendente para reprocessamento`);
        return 0;
      }
      
      this.registrador.info(`Encontradas ${transacoes.length} transações pendentes para reprocessamento`);
      
      // Processamento das transações
      let processadas = 0;
      for (const transacao of transacoes) {
        try {
          const sucesso = await processarTransacao(transacao);
          if (sucesso) processadas++;
        } catch (erro) {
          this.registrador.error(`Erro ao reprocessar transação ${transacao.id}: ${erro.message}`);
        }
      }
      
      this.registrador.info(`Processadas ${processadas} de ${transacoes.length} transações pendentes`);
      return processadas;
    } catch (erro) {
      this.registrador.error(`Erro ao processar transações pendentes: ${erro.message}`);
      return 0;
    }
  }

  async limparTransacoesAntigas(diasRetencao = 7) {
    const resultado = await this.repoTransacoes.limparTransacoesAntigas(diasRetencao);
    
    return Resultado.dobrar(
      resultado,
      (numRemovidas) => numRemovidas,
      (erro) => {
        this.registrador.error(`Erro ao limpar transações antigas: ${erro.message}`);
        throw erro;
      }
    );
  }

  async obterEstatisticas() {
    const resultado = await this.repoTransacoes.obterEstatisticas();
    
    return Resultado.dobrar(
      resultado,
      (estatisticas) => estatisticas,
      (erro) => {
        this.registrador.error(`Erro ao obter estatísticas de transações: ${erro.message}`);
        throw erro;
      }
    );
  }

  async obterTransacao(transacaoId) {
    const resultado = await this.repoTransacoes.encontrarUm({ id: transacaoId });
    
    return Resultado.dobrar(
      resultado,
      (transacao) => transacao,
      (erro) => {
        this.registrador.error(`Erro ao buscar transação ${transacaoId}: ${erro.message}`);
        throw erro;
      }
    );
  }
}

module.exports = GerenciadorTransacoes;