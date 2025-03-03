const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Caminho para o diretório de autenticação do WhatsApp
const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');

function cleanRestart() {
  console.log('Realizando reinicialização limpa do WhatsApp...');
  
  // Parar o processo principal
  exec('pm2 stop amelie', (error) => {
    if (error) {
      console.error(`Erro ao parar processo: ${error.message}`);
      return;
    }
    
        // Aguardar 5 segundos e reiniciar
    console.log('Aguardando 5 segundos antes de reiniciar...');
    setTimeout(() => {
      exec('pm2 start amelie', (startError) => {
        if (startError) {
          console.error(`Erro ao reiniciar: ${startError.message}`);
        } else {
          console.log('Aplicação reiniciada com sucesso!');
        }
      });
    }, 5000);
  });
}

// Executar quando chamado diretamente
if (require.main === module) {
  cleanRestart();
}

module.exports = { cleanRestart };