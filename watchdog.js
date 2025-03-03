const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { cleanRestart } = require('./whatsapp-restart');

// Configurações
const LOG_FILE = './bot.log';
const ERROR_LOG_FILE = './error.log';
const MAX_INACTIVE_TIME = 3 * 60 * 1000; // 3 minutos
const CHECK_INTERVAL = 30 * 1000; // 30 segundos
const ERROR_PATTERNS = [
  'Cannot read properties of undefined (reading',
  'widFactory',
  'unsafe',
  'getChat',
  'Conexão WhatsApp inativa'
];

// Estado
let lastActivity = Date.now();
let errorCount = 0;
let lastCleanRestartTime = 0;

function checkLogs() {
  try {
    // Verificar modificação do arquivo de log
    const stats = fs.statSync(LOG_FILE);
    const fileLastModified = stats.mtime.getTime();
    
    if (fileLastModified > lastActivity) {
      console.log(`Atividade detectada em: ${new Date(fileLastModified).toISOString()}`);
      lastActivity = fileLastModified;
    }
    
    // Verificar erros recentes no log de erros
    if (fs.existsSync(ERROR_LOG_FILE)) {
      const errorLog = fs.readFileSync(ERROR_LOG_FILE, 'utf8');
      const recentLog = errorLog.split('\n').slice(-30).join('\n');
      
      // Verificar padrões de erros críticos do WhatsApp
      const hasWhatsAppErrors = ERROR_PATTERNS.some(pattern => recentLog.includes(pattern));
      
      if (hasWhatsAppErrors) {
        errorCount++;
        console.log(`Detectados erros do WhatsApp (contagem: ${errorCount})`);
        
        // Se tivermos 10+ erros ou o último restart foi há mais de 10 minutos
        const timeSinceLastRestart = Date.now() - lastCleanRestartTime;
        if (errorCount >= 10 || timeSinceLastRestart > 10 * 60 * 1000) {
          console.log('Múltiplos erros do WhatsApp detectados! Executando reinicialização limpa...');
          cleanRestart();
          lastCleanRestartTime = Date.now();
          errorCount = 0;
          return;
        }
      } else {
        // Reduzir a contagem de erros gradualmente se não encontrarmos novos
        if (errorCount > 0 && Math.random() < 0.3) {
          errorCount--;
        }
      }
    }
    
    // Verificar tempo inativo
    const inactiveTime = Date.now() - lastActivity;
    console.log(`Tempo inativo: ${Math.round(inactiveTime / 1000)}s`);
    
    if (inactiveTime > MAX_INACTIVE_TIME) {
      console.log(`Sistema inativo por mais de ${MAX_INACTIVE_TIME / 1000}s. Reiniciando...`);
      
      // Se já passou muito tempo desde o último restart completo, fazer um limpo
      const timeSinceLastRestart = Date.now() - lastCleanRestartTime;
      if (timeSinceLastRestart > 30 * 60 * 1000) { // 30 minutos
        cleanRestart();
        lastCleanRestartTime = Date.now();
      } else {
        // Caso contrário, restart normal
        exec('pm2 restart amelie', (error) => {
          if (error) console.error(`Erro ao reiniciar: ${error.message}`);
        });
      }
      
      lastActivity = Date.now();
    }
  } catch (error) {
    console.error(`Erro no watchdog: ${error.message}`);
  }
}

// Iniciar monitoramento
console.log('Watchdog aprimorado iniciado');
setInterval(checkLogs, CHECK_INTERVAL);