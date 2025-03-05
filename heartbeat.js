/**
 * Sistema de heartbeat para manter o watchdog feliz
 * Garante que o processo principal da Amélie nunca seja reiniciado por inatividade
 */

class HeartbeatSystem {
    constructor(logger, client, intervalo = 20000) {
      this.logger = logger;
      this.client = client;
      this.intervalo = intervalo;
      this.intervalId = null;
      this.ultimoBatimento = Date.now();
      this.inicioSistema = Date.now(); // Importante inicializar aqui para evitar NaN
      this.contadorBatimentos = 0;
      this.fs = require('fs');
      this.path = require('path');
    }
    
    /**
     * Inicia o sistema de heartbeat
     */
    iniciar() {
      if (this.intervalId) {
        this.logger.warn('Sistema de heartbeat já está rodando');
        return;
      }
      
      this.logger.info('💓 Sistema de heartbeat iniciado');
      
      this.intervalId = setInterval(() => {
        this.emitirBatimento();
      }, this.intervalo);
      
      // Primeiro batimento imediato
      this.emitirBatimento();
    }
    
    /**
     * Para o sistema de heartbeat
     */
    parar() {
      if (!this.intervalId) return;
      
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info('Sistema de heartbeat parado');
    }
    
    /**
     * Registra um batimento cardíaco
     */
    emitirBatimento() {
      const agora = Date.now();
      const intervaloReal = agora - this.ultimoBatimento;
      this.ultimoBatimento = agora;
      
      this.contadorBatimentos++;
      
      // A cada 10 batimentos, mostra estatísticas
      if (this.contadorBatimentos % 10 === 0) {
        const segundosAtivo = Math.floor((agora - this.inicioSistema) / 1000);
        this.logger.info(`💓 Heartbeat #${this.contadorBatimentos} - Sistema ativo há ${segundosAtivo}s`);
      } else {
        this.logger.info(`Heartbeat ${new Date().toISOString()} - Sistema ativo`);
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
      // Verificar se o módulo de notificações existe
      if (!this.client) {
        return;
      }
      
      const tempDir = './temp';
      if (!this.fs.existsSync(tempDir)) return;
      
      const arquivos = await this.fs.promises.readdir(tempDir);
      const notificacoes = arquivos.filter(f => f.startsWith('notificacao_'));
      
      for (const arquivo of notificacoes) {
        try {
          const caminhoCompleto = this.path.join(tempDir, arquivo);
          const stats = await this.fs.promises.stat(caminhoCompleto);
          
          // Ignorar arquivos muito recentes (podem estar sendo escritos)
          if (Date.now() - stats.mtime.getTime() < 5000) {
            continue;
          }
          
          const conteudo = await this.fs.promises.readFile(caminhoCompleto, 'utf8');
          const dados = JSON.parse(conteudo);
          
          // Tentar enviar a mensagem
          if (dados.senderNumber && dados.message) {
            try {
              await this.client.sendMessage(dados.senderNumber, dados.message);
              this.logger.info(`✅ Notificação pendente enviada para ${dados.senderNumber}`);
              
              // Remover arquivo após processamento bem-sucedido
              await this.fs.promises.unlink(caminhoCompleto);
            } catch (sendErr) {
              this.logger.warn(`❌ Falha ao enviar notificação: ${sendErr.message}`);
            }
          }
        } catch (err) {
          this.logger.error(`Erro ao processar arquivo de notificação ${arquivo}: ${err.message}`);
        }
      }
    } catch (err) {
      this.logger.error(`Erro ao verificar diretório de notificações: ${err.message}`);
    }
  }
    
    /**
     * Verifica uso de memória e libera se necessário
     */
    verificarMemoria() {
      try {
        const memoryUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);
        
        this.logger.debug(`Memória: Heap ${heapUsedMB}MB / RSS ${rssMB}MB`);
        
        // Se estiver usando muita memória
        if (heapUsedMB > 1200 || rssMB > 1500) {
          this.logger.warn(`⚠️ Alto uso de memória detectado: Heap ${heapUsedMB}MB / RSS ${rssMB}MB`);
          
          // Sugerir coleta de lixo
          if (global.gc) {
            this.logger.info('Solicitando coleta de lixo...');
            global.gc();
          }
        }
      } catch (err) {
        this.logger.error(`Erro ao verificar memória: ${err.message}`);
      }
    }
}

module.exports = HeartbeatSystem;