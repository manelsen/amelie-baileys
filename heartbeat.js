/**
 * Sistema de batimentos cardíacos para manter o cão de guarda (watchdog) satisfeito
 * Garante que o processo principal da Amélie apenas seja monitorado quando a
 * conexão com o WhatsApp estiver realmente ativa
 */
class SistemaDeBatimentos {
  /**
   * Construtor da classe SistemaDeBatimentos
   * @param {Object} registrador - Objeto de log para registrar mensagens
   * @param {Object} cliente - Cliente do WhatsApp para verificar o estado da conexão
   * @param {number} intervalo - Intervalo em milissegundos entre os batimentos (padrão: 20000ms)
   */
  constructor(registrador, cliente, intervalo = 20000) {
    this.registrador = registrador;
    this.cliente = cliente;
    this.intervalo = intervalo;
    this.idIntervalo = null;
    this.ultimoBatimento = Date.now();
    this.inicioSistema = Date.now(); // Importante inicializar aqui para evitar NaN
    this.contadorBatimentos = 0;
    this.fs = require('fs');
    this.path = require('path');
  }
  
  /**
   * Inicia o sistema de batimentos
   */
  iniciar() {
    if (this.idIntervalo) {
      this.registrador.warn('Sistema de batimentos já está rodando');
      return;
    }
    
    this.registrador.info('💓 Sistema de batimentos iniciado');
    
    this.idIntervalo = setInterval(() => {
      this.emitirBatimento();
    }, this.intervalo);
    
    // Primeiro batimento imediato
    this.emitirBatimento();
  }
  
  /**
   * Para o sistema de batimentos
   */
  parar() {
    if (!this.idIntervalo) return;
    
    clearInterval(this.idIntervalo);
    this.idIntervalo = null;
    this.registrador.info('Sistema de batimentos parado');
  }
  
  /**
 * Verifica se o cliente do WhatsApp está realmente conectado usando múltiplos indicadores
 * @returns {Promise<boolean>} Verdadeiro se o cliente estiver conectado
 */
async verificarConexaoAtiva() {
  try {
    // Verificação básica da existência do cliente
    if (!this.cliente || !this.cliente.info) {
      return false;
    }
    
    // Se o cliente tem um ID (wid), isso já é um bom indicador
    const temId = Boolean(this.cliente.info.wid);
    
    // Verificação de capacidade de resposta
    let estadoConexao = false;
    
    // Verificar se temos um pupPage e se podemos acessá-lo
    if (this.cliente.pupPage) {
      try {
        // Verificar o estado de conexão interno
        estadoConexao = await this.cliente.pupPage.evaluate(() => {
          // Verificação mais flexível - qualquer um destes é um bom sinal
          return Boolean(
            (window.Store && window.Store.Conn) || 
            (window.WAPI && window.WAPI.isConnected()) || 
            (window.WWebJS && window.WWebJS.isConnected) ||
            document.querySelector('[data-icon=":"]') !== null // Ícone de conexão online
          );
        }).catch(() => false);
      } catch (erroEval) {
        // Erro na avaliação não é conclusivo - vamos verificar outros indicadores
        this.registrador.debug(`Erro na verificação do Puppeteer: ${erroEval.message}`);
      }
    }
    
    // Se alguma mensagem foi processada recentemente (últimos 2 minutos), consideramos como conectado
    const mensagemRecente = this.verificarMensagensRecentes();

    // Se o cliente tem ID e (estado da conexão é positivo OU teve mensagem recente), consideramos conectado
    const estaConectado = temId && (estadoConexao || mensagemRecente);
    
    if (!estaConectado) {
      this.registrador.debug(`Diagnóstico de conexão: ID=${temId}, Estado=${estadoConexao}, MensagemRecente=${mensagemRecente}`);
    }
    
    return estaConectado;
  } catch (erro) {
    this.registrador.error(`Erro ao verificar estado da conexão: ${erro.message}`);
    return false;
  }
}

/**
 * Verifica se houve mensagens processadas recentemente
 * @returns {boolean} Verdadeiro se mensagens foram processadas nos últimos minutos
 */
verificarMensagensRecentes() {
  try {
    // Verificar os logs mais recentes em busca de atividade de mensagens
    const caminhoLog = './bot.log';
    if (!this.fs.existsSync(caminhoLog)) return false;
    
    const conteudoLog = this.fs.readFileSync(caminhoLog, 'utf8');
    const linhasRecentes = conteudoLog.split('\n').slice(-100); // Últimas 100 linhas
    
    // Data atual
    const agora = new Date();
    const doisMinutosAtras = new Date(agora.getTime() - 2 * 60 * 1000);
    
    // Padrões que indicam atividade real de mensagens
    const padroesAtividade = [
      'Mensagem de ',
      'Resposta:',
      'processando mídia'
    ];
    
    // Procurar nas linhas recentes por atividade dentro da janela de tempo
    for (const linha of linhasRecentes) {
      // Verificar se é uma linha de atividade
      if (!padroesAtividade.some(padrao => linha.includes(padrao))) continue;
      
      // Extrair timestamp
      const timestampMatch = linha.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/);
      if (!timestampMatch) continue;
      
      // Converter para data
      const dataLinha = new Date(timestampMatch[0]);
      
      // Se a linha é recente, consideramos como ativo
      if (dataLinha >= doisMinutosAtras) {
        return true;
      }
    }
    
    return false;
  } catch (erro) {
    this.registrador.error(`Erro ao verificar mensagens recentes: ${erro.message}`);
    return false;
  }
}
  
  /**
   * Registra um batimento cardíaco apenas se a conexão estiver ativa
   */
  async emitirBatimento() {
    const agora = Date.now();
    const intervaloReal = agora - this.ultimoBatimento;
    this.ultimoBatimento = agora;
    
    // Verificar se a conexão com o WhatsApp está ativa
    const conexaoAtiva = await this.verificarConexaoAtiva();
    
    // Se a conexão não estiver ativa, registrar o problema e não emitir batimento
    if (!conexaoAtiva) {
      this.registrador.warn('❌ Conexão WhatsApp inativa - batimento não emitido');
      return;
    }
    
    this.contadorBatimentos++;
    
    // A cada 10 batimentos, mostra estatísticas
    if (this.contadorBatimentos % 10 === 0) {
      const segundosAtivo = Math.floor((agora - this.inicioSistema) / 1000);
      this.registrador.info(`💓 Batimento #${this.contadorBatimentos} - Sistema ativo há ${segundosAtivo}s`);
    } else {
      this.registrador.info(`Batimento ${new Date().toISOString()} - Sistema ativo`);
    }
    
    // Verificar notificações pendentes
    this.verificarNotificacoesPendentes();
    
    // Verificar uso de memória ocasionalmente
    if (this.contadorBatimentos % 5 === 0) {
      this.verificarMemoria();
    }
  }
  
  /**
   * Verifica e processa notificações pendentes
   */
  async verificarNotificacoesPendentes() {
    try {
      // Verificar se o cliente existe
      if (!this.cliente) {
        return;
      }
      
      const diretorioTemporario = './temp';
      if (!this.fs.existsSync(diretorioTemporario)) return;
      
      const arquivos = await this.fs.promises.readdir(diretorioTemporario);
      const notificacoes = arquivos.filter(f => f.startsWith('notificacao_'));
      
      for (const arquivo of notificacoes) {
        try {
          const caminhoCompleto = this.path.join(diretorioTemporario, arquivo);
          const estatisticas = await this.fs.promises.stat(caminhoCompleto);
          
          // Ignorar arquivos muito recentes (podem estar sendo escritos)
          if (Date.now() - estatisticas.mtime.getTime() < 5000) {
            continue;
          }
          
          const conteudo = await this.fs.promises.readFile(caminhoCompleto, 'utf8');
          const dados = JSON.parse(conteudo);
          
          // Tentar enviar a mensagem
          if (dados.senderNumber && dados.message) {
            try {
              await this.cliente.sendMessage(dados.senderNumber, dados.message);
              this.registrador.info(`✅ Notificação pendente enviada para ${dados.senderNumber}`);
              
              // Remover arquivo após processamento bem-sucedido
              await this.fs.promises.unlink(caminhoCompleto);
            } catch (erroEnvio) {
              this.registrador.warn(`❌ Falha ao enviar notificação: ${erroEnvio.message}`);
            }
          }
        } catch (erro) {
          this.registrador.error(`Erro ao processar arquivo de notificação ${arquivo}: ${erro.message}`);
        }
      }
    } catch (erro) {
      this.registrador.error(`Erro ao verificar diretório de notificações: ${erro.message}`);
    }
  }
  
  /**
   * Verifica uso de memória e libera se necessário
   */
  verificarMemoria() {
    try {
      const usoMemoria = process.memoryUsage();
      const heapUsadoMB = Math.round(usoMemoria.heapUsed / 1024 / 1024);
      const rssMB = Math.round(usoMemoria.rss / 1024 / 1024);
      
      this.registrador.debug(`Memória: Heap ${heapUsadoMB}MB / RSS ${rssMB}MB`);
      
      // Se estiver usando muita memória
      if (heapUsadoMB > 1200 || rssMB > 1500) {
        this.registrador.warn(`⚠️ Alto uso de memória detectado: Heap ${heapUsadoMB}MB / RSS ${rssMB}MB`);
        
        // Sugerir coleta de lixo
        if (global.gc) {
          this.registrador.info('Solicitando coleta de lixo...');
          global.gc();
        }
      }
    } catch (erro) {
      this.registrador.error(`Erro ao verificar memória: ${erro.message}`);
    }
  }
}

module.exports = SistemaDeBatimentos;