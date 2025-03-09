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
      
      await clienteWhatsApp.enviarMensagem(transacao.chatId, transacao.resposta);
      await this.marcarComoEntregue(transacao.id);
      
      this.registrador.info(`Transação ${transacao.id} reprocessada com sucesso`);
      return true;
    };
    
    const resultado = await this.repoTransacoes.processarTransacoesPendentes(processarTransacao);
    
    return Resultado.dobrar(
      resultado,
      (processadas) => processadas,
      (erro) => {
        this.registrador.error(`Erro ao processar transações pendentes: ${erro.message}`);
        throw erro;
      }
    );
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