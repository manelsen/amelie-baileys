/**
 * GerenciadorNotificacoes - Módulo para gerenciar notificações pendentes
 * 
 * Este módulo fornece funções para salvar e processar notificações
 * que não puderam ser entregues imediatamente.
 */

const fs = require('fs');
const path = require('path');

class GerenciadorNotificacoes {
  /**
   * Cria uma instância do gerenciador de notificações
   * @param {Object} registrador - Objeto logger para registro de eventos
   * @param {string} diretorioTemp - Diretório para armazenar notificações
   */
  constructor(registrador, diretorioTemp = '../temp') {
    this.registrador = registrador;
    this.diretorioTemp = diretorioTemp;
    
    // Garantir que o diretório exista
    if (!fs.existsSync(this.diretorioTemp)) {
      try {
        fs.mkdirSync(this.diretorioTemp, { recursive: true });
        this.registrador.info(`Diretório para notificações criado: ${this.diretorioTemp}`);
      } catch (erro) {
        this.registrador.error(`Erro ao criar diretório: ${erro.message}`);
      }
    }
  }

  /**
   * Salva uma notificação para ser entregue posteriormente
   * @param {string} destinatario - ID do destinatário
   * @param {string} mensagem - Texto da mensagem
   * @returns {Promise<boolean>} Verdadeiro se salvo com sucesso
   */
  async salvar(destinatario, mensagem) {
    try {
      const arquivoNotificacao = path.join(
        this.diretorioTemp, 
        `notificacao_${destinatario.replace(/[^0-9]/g, '')}_${Date.now()}.json`
      );
      
      await fs.promises.writeFile(arquivoNotificacao, JSON.stringify({
        senderNumber: destinatario,
        message: mensagem,
        timestamp: Date.now()
      }));
      
      this.registrador.info(`Notificação salva: ${arquivoNotificacao}`);
      return true;
    } catch (erro) {
      this.registrador.error(`Erro ao salvar notificação: ${erro.message}`);
      return false;
    }
  }

  /**
   * Processa notificações pendentes
   * @param {Object} cliente - Cliente WhatsApp
   * @returns {Promise<number>} Número de notificações processadas
   */
  async processar(cliente) {
    if (!cliente) {
      throw new Error("Cliente não fornecido para processamento de notificações");
    }
    
    try {
      const arquivos = await fs.promises.readdir(this.diretorioTemp);
      const notificacoes = arquivos.filter(f => f.startsWith('notificacao_'));
      
      let processadas = 0;
      
      for (const arquivo of notificacoes) {
        try {
          const caminhoCompleto = path.join(this.diretorioTemp, arquivo);
          const stats = await fs.promises.stat(caminhoCompleto);
          
          // Ignorar arquivos muito recentes (podem estar sendo escritos)
          if (Date.now() - stats.mtime.getTime() < 5000) {
            continue;
          }
          
          const conteudo = await fs.promises.readFile(caminhoCompleto, 'utf8');
          const dados = JSON.parse(conteudo);
          
          // Tentar enviar a mensagem novamente
          if (dados.senderNumber && dados.message) {
            await cliente.sendMessage(dados.senderNumber, dados.message);
            this.registrador.info(`✅ Notificação pendente enviada para ${dados.senderNumber}`);
            
            // Remover arquivo após processamento bem-sucedido
            await fs.promises.unlink(caminhoCompleto);
            processadas++;
          }
        } catch (err) {
          this.registrador.error(`Erro ao processar arquivo de notificação ${arquivo}: ${err.message}`);
        }
      }
      
      if (processadas > 0) {
        this.registrador.info(`Processadas ${processadas} notificações pendentes`);
      }
      
      return processadas;
    } catch (erro) {
      this.registrador.error(`Erro ao verificar diretório de notificações: ${erro.message}`);
      return 0;
    }
  }

  /**
   * Limpa notificações antigas
   * @param {number} diasAntiguidade - Dias para considerar uma notificação antiga
   * @returns {Promise<number>} Número de notificações limpas
   */
  async limparAntigas(diasAntiguidade = 7) {
    try {
      const arquivos = await fs.promises.readdir(this.diretorioTemp);
      const notificacoes = arquivos.filter(f => f.startsWith('notificacao_'));
      
      const agora = Date.now();
      const limiteAntiguidade = agora - (diasAntiguidade * 24 * 60 * 60 * 1000);
      let removidas = 0;
      
      for (const arquivo of notificacoes) {
        try {
          const caminhoCompleto = path.join(this.diretorioTemp, arquivo);
          const stats = await fs.promises.stat(caminhoCompleto);
          
          if (stats.mtimeMs < limiteAntiguidade) {
            await fs.promises.unlink(caminhoCompleto);
            removidas++;
          }
        } catch (err) {
          this.registrador.error(`Erro ao limpar notificação antiga ${arquivo}: ${err.message}`);
        }
      }
      
      if (removidas > 0) {
        this.registrador.info(`Removidas ${removidas} notificações antigas`);
      }
      
      return removidas;
    } catch (erro) {
      this.registrador.error(`Erro ao limpar notificações antigas: ${erro.message}`);
      return 0;
    }
  }
}

module.exports = GerenciadorNotificacoes;