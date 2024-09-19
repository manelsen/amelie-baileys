// botInitializer.js

const { loadConfigOnStartup } = require('./data/database');
const logger = require('./utilities/logger');

async function initializeBot() {
  try {
    await loadConfigOnStartup();
    logger.info('Todas as configurações foram carregadas com sucesso');
  } catch (error) {
    logger.error('Erro ao carregar configurações:', error);
  }
}

module.exports = {
  initializeBot,
};
