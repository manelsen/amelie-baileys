const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { cleanRestart } = require('./whatsapp-restart');

// Configurações
const LOG_FILE = './bot.log';
const ERROR_LOG_FILE = './error.log';
const ERRORS_HISTORY_FILE = './whatsapp_errors_history.json';
const MAX_ERRORS = 100;
const MAX_INACTIVE_TIME = 1 * 60 * 1000; // 1 minuto
const CHECK_INTERVAL = 20 * 1000; // 20 segundos
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
let detectedErrors = [];

// Carregar histórico de erros anterior, se existir
function loadErrorHistory() {
  try {
    if (fs.existsSync(ERRORS_HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(ERRORS_HISTORY_FILE, 'utf8'));
    }
  } catch (err) {
    console.error(`Erro ao carregar histórico: ${err.message}`);
  }
  return [];
}

// Salvar histórico de erros
function saveErrorHistory(errorsArray) {
  try {
    fs.writeFileSync(ERRORS_HISTORY_FILE, JSON.stringify(errorsArray, null, 2));
  } catch (err) {
    console.error(`Erro ao salvar histórico: ${err.message}`);
  }
}

// Extrair erro completo do log (agora com verificação de timestamp)
function extractFullError(logLine, pattern) {
  // Buscar o timestamp no formato do log (vários formatos possíveis)
  const timestampRegex = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)|(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/;
  const timestampMatch = logLine.match(timestampRegex);
  const timestamp = timestampMatch ? timestampMatch[0] : null;
  
  // Se encontrou um timestamp, verificar se é recente (últimos 5 minutos)
  if (timestamp) {
    const logTime = new Date(timestamp).getTime();
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    // Se o log for mais antigo que 5 minutos, ignorar
    if (logTime < fiveMinutesAgo) {
      return null;
    }
  }
  
  // Busca a linha completa do erro
  const errorStart = logLine.indexOf(pattern);
  if (errorStart === -1) return null;
  
  // Extrai 200 caracteres após o início do padrão ou até o final da linha
  const errorContext = logLine.substring(errorStart, errorStart + 200);
  const fullError = errorContext.split('\n')[0].trim();
  
  return {
    timestamp: timestamp || new Date().toISOString(),
    pattern,
    error: fullError,
    detectedAt: new Date().toISOString(),
    isRecent: true // Marcador adicional para confirmar que é recente
  };
}

function checkLogs() {
  try {
    // Verificar modificação do arquivo de log
    const stats = fs.statSync(LOG_FILE);
    const fileLastModified = stats.mtime.getTime();
    
    // Vamos analisar o conteúdo das modificações recentes
    const logContent = fs.readFileSync(LOG_FILE, 'utf8');
    const recentLines = logContent.split('\n').slice(-100); // Últimas 100 linhas
    
    // Verificar se as entradas mais recentes são apenas avisos de inatividade
    let hasRealActivity = false;
    let hasOnlyWarnings = true;
    
    for (const line of recentLines.slice(-10)) { // Analisar as 10 linhas mais recentes
      const isWarningLine = line.includes('[warn]') && 
                           (line.includes('Conexão WhatsApp inativa') || 
                            line.includes('cliente não está realmente pronto') ||
                            line.includes('Reconexão não surtiu efeito'));
      
      const isRealActivity = line.includes('Mensagem de') || 
                             line.includes('Resposta:') ||
                             (line.includes('[info]') && !line.includes('batimento') && !line.includes('Tentando reconexão'));
      
      if (isRealActivity) {
        hasRealActivity = true;
        hasOnlyWarnings = false;
      } else if (!isWarningLine && line.trim() !== '') {
        // Se não é um aviso de conexão e não está vazio, não é apenas avisos
        hasOnlyWarnings = false;
      }
    }
    
    // Só atualizar a última atividade se houve atividade real
    // OU se o tempo desde a última modificação é significativo
    if (fileLastModified > lastActivity && (hasRealActivity || fileLastModified - lastActivity > 30000)) {
      // Se temos apenas avisos de inatividade, não resetar o contador de inatividade
      if (!hasOnlyWarnings) {
        console.log(`Atividade detectada em ${new Date(fileLastModified).toISOString()}`);
        lastActivity = fileLastModified;
      } else {
        console.log(`Modificação de arquivo detectada, mas contém apenas avisos de inatividade.`);
      }
    }
    
    // Verificar erros recentes no log de erros
    if (fs.existsSync(ERROR_LOG_FILE)) {
      const errorLog = fs.readFileSync(ERROR_LOG_FILE, 'utf8');
      const recentLogLines = errorLog.split('\n').slice(-100); // Pegar as últimas 100 linhas
      
      // Verificar padrões de erros críticos do WhatsApp
      let foundNewErrors = false;
      
      for (const line of recentLogLines) {
        for (const pattern of ERROR_PATTERNS) {
          if (line.includes(pattern)) {
            const errorInfo = extractFullError(line, pattern);
            
            // Só processar se o erro for recente (a função já filtrou por timestamp)
            if (errorInfo) {
              // Verificar se este erro específico já foi registrado recentemente
              const isDuplicate = detectedErrors.some(e => 
                e.error === errorInfo.error && 
                Date.now() - new Date(e.detectedAt).getTime() < 60000 // Evitar duplicatas em 1 minuto
              );
              
              if (!isDuplicate) {
                detectedErrors.push(errorInfo);
                // Manter apenas os últimos 100 erros
                if (detectedErrors.length > 100) detectedErrors.shift();
                
                console.log(`⚠️ Erro do WhatsApp detectado (${new Date().toISOString()}):`);
                console.log(`Padrão: ${pattern}`);
                console.log(`Erro completo: ${errorInfo.error}`);
                console.log(`Timestamp do log: ${errorInfo.timestamp}`);
                console.log('-'.repeat(50));
                
                foundNewErrors = true;
                errorCount++;
              }
            }
          }
        }
      }
      
      // Se encontramos novos erros, salvar o histórico atualizado
      if (foundNewErrors) {
        // Carregar histórico completo, adicionar novos erros e salvar
        const completeHistory = loadErrorHistory();
        const newErrors = detectedErrors.filter(e => 
          !completeHistory.some(h => h.error === e.error && h.timestamp === e.timestamp)
        );
        
        if (newErrors.length > 0) {
          completeHistory.push(...newErrors);
          // Limitar o histórico a 1000 entradas
          while (completeHistory.length > 1000) completeHistory.shift();
          saveErrorHistory(completeHistory);
        }
      }
      
      // Se tivermos mais erros que o configurado
      if (errorCount >= MAX_ERRORS) {
        console.log('\n🚨 Múltiplos erros do WhatsApp detectados! Resumo antes da reinicialização:');
        
        // Mostrar resumo dos erros antes de reiniciar
        const errorSummary = {};
        detectedErrors.forEach(err => {
          if (!errorSummary[err.pattern]) errorSummary[err.pattern] = [];
          errorSummary[err.pattern].push({
            timestamp: err.timestamp,
            error: err.error,
            detectedAt: err.detectedAt
          });
        });
        
        // Exibir erros agrupados por padrão
        Object.keys(errorSummary).forEach(pattern => {
          console.log(`\n📋 Erros relacionados a "${pattern}":`);
          errorSummary[pattern].slice(-10).forEach((err, i) => {
            console.log(`  ${i+1}. [${err.detectedAt}] ${err.error}`);
          });
          
          const total = errorSummary[pattern].length;
          if (total > 10) {
            console.log(`  ... e mais ${total - 10} ocorrências deste padrão`);
          }
        });
        
        console.log('\nExecutando reinicialização limpa...');
        
        // Salvar o log de erros em um arquivo específico para esta reinicialização
        const restartLogFile = `./restart_errors_${new Date().toISOString().replace(/:/g, '-')}.json`;
        fs.writeFileSync(restartLogFile, JSON.stringify(detectedErrors, null, 2));
        console.log(`Log detalhado salvo em: ${restartLogFile}`);
        
        cleanRestart();
        lastCleanRestartTime = Date.now();
        errorCount = 0;
        detectedErrors = []; // Limpar após reiniciar
        return;
      } else {
        // Reduzir a contagem de erros gradualmente se não encontrarmos novos
        // Redução mais agressiva para evitar falsos positivos
        if (errorCount > 0 && Math.random() < 0.5) {
          errorCount--;
        }
      }
    }
    
    // Verificar tempo inativo
    const inactiveTime = Date.now() - lastActivity;
    console.log(`Tempo inativo: ${Math.round(inactiveTime / 1000)}s`);
    
    if (inactiveTime > MAX_INACTIVE_TIME) {
      console.log(`\n⚠️ Sistema inativo por mais de ${MAX_INACTIVE_TIME / 1000}s. Reiniciando...`);
      
      // Se já passou muito tempo desde o último restart completo, fazer um limpo
      const timeSinceLastRestart = Date.now() - lastCleanRestartTime;
      if (timeSinceLastRestart > 30 * 60 * 1000) { // 30 minutos
        // Mostrar resumo dos erros antes de reiniciar por inatividade
        if (detectedErrors.length > 0) {
          console.log('\n📊 Erros detectados antes desta reinicialização por inatividade:');
          detectedErrors.slice(-10).forEach((err, i) => {
            console.log(`  ${i+1}. [${err.detectedAt}] (${err.pattern}) ${err.error}`);
          });
          
          // Salvar erros em arquivo específico para esta reinicialização
          const restartLogFile = `./inactive_restart_${new Date().toISOString().replace(/:/g, '-')}.json`;
          fs.writeFileSync(restartLogFile, JSON.stringify(detectedErrors, null, 2));
          console.log(`Log de inatividade salvo em: ${restartLogFile}`);
        }
        
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

// Limpar logs antigos de erros
function cleanupOldLogs() {
  try {
    const files = fs.readdirSync('./');
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    // Procurar arquivos de log de reinicialização
    const logPattern = /restart_errors_|inactive_restart_/;
    
    files.forEach(file => {
      if (logPattern.test(file)) {
        const filePath = path.join('./', file);
        const stats = fs.statSync(filePath);
        
        // Se o arquivo tem mais de uma semana
        if (stats.mtimeMs < oneWeekAgo) {
          fs.unlinkSync(filePath);
          console.log(`Arquivo de log antigo removido: ${file}`);
        }
      }
    });
  } catch (error) {
    console.error(`Erro ao limpar logs antigos: ${error.message}`);
  }
}

// Verificar e exibir estatísticas de erros sob demanda
function showErrorStats() {
  const history = loadErrorHistory();
  
  if (history.length === 0) {
    console.log('Nenhum erro registrado no histórico.');
    return;
  }
  
  // Agrupar por padrão
  const byPattern = {};
  history.forEach(err => {
    if (!byPattern[err.pattern]) byPattern[err.pattern] = [];
    byPattern[err.pattern].push(err);
  });
  
  console.log(`\n📊 ESTATÍSTICAS DE ERROS DO WHATSAPP (${history.length} total):`);
  
  Object.keys(byPattern).forEach(pattern => {
    const errors = byPattern[pattern];
    console.log(`\n🔍 Padrão: "${pattern}" (${errors.length} ocorrências)`);
    
    // Mostrar os 5 erros mais recentes deste padrão
    console.log('  Exemplos mais recentes:');
    errors.slice(-5).forEach((err, i) => {
      console.log(`  ${i+1}. [${err.detectedAt}] ${err.error.substring(0, 100)}${err.error.length > 100 ? '...' : ''}`);
    });
    
    // Mostrar distribuição por data
    const dateCount = {};
    errors.forEach(err => {
      const date = err.detectedAt.split('T')[0];
      dateCount[date] = (dateCount[date] || 0) + 1;
    });
    
    console.log('  Distribuição temporal:');
    Object.keys(dateCount).sort().forEach(date => {
      console.log(`    ${date}: ${dateCount[date]} ocorrências`);
    });
  });
}

// Adicionar comando para mostrar estatísticas via console
const args = process.argv.slice(2);
if (args.includes('--stats')) {
  showErrorStats();
  process.exit(0);
}

// Limpar logs antigos na inicialização
cleanupOldLogs();

// Configurar limpeza periódica de logs antigos (uma vez por dia)
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);

// Iniciar monitoramento
console.log('🔍 Watchdog iniciado');
setInterval(checkLogs, CHECK_INTERVAL);