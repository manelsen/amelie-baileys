/**
 * CircuitBreaker.js - Implementação funcional do padrão Circuit Breaker
 * 
 * Protege o sistema contra falhas em cascata, bloqueando requisições
 * quando um serviço está falhando repetidamente.
 * 
 * Estados:
 * - FECHADO: Operação normal, requisições passam
 * - ABERTO: Serviço indisponível, requisições são bloqueadas
 * - SEMI_ABERTO: Tentativa de recuperação, permite uma requisição de teste
 * 
 * Extraído de GerenciadorAI.js como parte do Strangler Fig Pattern
 */

// --- Configuração ---
const CONFIG_PADRAO = {
  limiteFalhas: 5,
  tempoResetMs: 60000 // 1 minuto
};

// --- Estado Inicial ---

/**
 * Cria o estado inicial do Circuit Breaker
 * @returns {Object} Estado inicial
 */
const criarEstadoInicial = () => ({
  falhas: 0,
  ultimaFalha: 0,
  estado: 'FECHADO'
});

// --- Funções de Transição de Estado (Puras) ---

/**
 * Registra um sucesso e reseta o Circuit Breaker
 * @param {Object} estadoCB - Estado atual
 * @returns {Object} Novo estado
 */
const registrarSucesso = (estadoCB) => ({
  ...estadoCB,
  falhas: 0,
  estado: 'FECHADO'
});

/**
 * Registra uma falha e possivelmente abre o Circuit Breaker
 * @param {Object} estadoCB - Estado atual
 * @param {Object} config - Configuração (limiteFalhas)
 * @returns {Object} Novo estado
 */
const registrarFalha = (estadoCB, config = CONFIG_PADRAO) => {
  const novoEstado = { 
    ...estadoCB, 
    falhas: estadoCB.falhas + 1, 
    ultimaFalha: Date.now() 
  };
  
  if (novoEstado.falhas >= config.limiteFalhas) {
    novoEstado.estado = 'ABERTO';
  }
  
  return novoEstado;
};

/**
 * Verifica se uma requisição pode ser executada
 * @param {Object} estadoCB - Estado atual
 * @param {Object} config - Configuração (tempoResetMs)
 * @returns {Object} { podeExecutar: boolean, novoEstado: Object }
 */
const podeExecutar = (estadoCB, config = CONFIG_PADRAO) => {
  // Estado FECHADO: sempre permite
  if (estadoCB.estado === 'FECHADO') {
    return { podeExecutar: true, novoEstado: estadoCB };
  }
  
  // Estado ABERTO: verifica se é hora de tentar novamente
  if (estadoCB.estado === 'ABERTO') {
    const tempoDesdeUltimaFalha = Date.now() - estadoCB.ultimaFalha;
    
    if (tempoDesdeUltimaFalha > config.tempoResetMs) {
      // Transição para SEMI_ABERTO
      return { 
        podeExecutar: true, 
        novoEstado: { ...estadoCB, estado: 'SEMI_ABERTO' } 
      };
    }
    
    // Ainda está no período de bloqueio
    return { podeExecutar: false, novoEstado: estadoCB };
  }
  
  // Estado SEMI_ABERTO: permite uma requisição de teste
  return { podeExecutar: true, novoEstado: estadoCB };
};

// --- Factory para criar instância gerenciável ---

/**
 * Cria uma instância do Circuit Breaker com estado gerenciado
 * @param {Object} config - Configuração opcional
 * @returns {Object} API do Circuit Breaker
 */
const criarCircuitBreaker = (config = CONFIG_PADRAO) => {
  let estado = criarEstadoInicial();
  
  return {
    /**
     * Verifica se pode executar uma requisição
     * @returns {boolean}
     */
    podeExecutar: () => {
      const resultado = podeExecutar(estado, config);
      estado = resultado.novoEstado;
      return resultado.podeExecutar;
    },
    
    /**
     * Registra sucesso na requisição
     */
    registrarSucesso: () => {
      estado = registrarSucesso(estado);
    },
    
    /**
     * Registra falha na requisição
     */
    registrarFalha: () => {
      estado = registrarFalha(estado, config);
    },
    
    /**
     * Retorna o estado atual (para logging/debug)
     * @returns {Object}
     */
    obterEstado: () => ({ ...estado }),
    
    /**
     * Reseta o Circuit Breaker para o estado inicial
     */
    resetar: () => {
      estado = criarEstadoInicial();
    }
  };
};

module.exports = {
  // Funções puras (para testes e uso avançado)
  criarEstadoInicial,
  registrarSucesso,
  registrarFalha,
  podeExecutar,
  
  // Factory (uso principal)
  criarCircuitBreaker,
  
  // Configuração padrão (para referência)
  CONFIG_PADRAO
};
