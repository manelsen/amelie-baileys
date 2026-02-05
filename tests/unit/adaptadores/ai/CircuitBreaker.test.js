/**
 * Testes unitários para CircuitBreaker.js
 * 
 * O Circuit Breaker protege contra falhas em cascata usando 3 estados:
 * - FECHADO: operação normal
 * - ABERTO: bloqueando requisições após muitas falhas
 * - SEMI_ABERTO: testando se o serviço voltou
 */

const {
  criarEstadoInicial,
  registrarSucesso,
  registrarFalha,
  podeExecutar,
  criarCircuitBreaker,
  CONFIG_PADRAO
} = require('../../../../src/adaptadores/ai/CircuitBreaker');

describe('CircuitBreaker.js', () => {
  
  describe('Funções Puras', () => {
    
    describe('criarEstadoInicial()', () => {
      
      test('deve criar estado com falhas zeradas', () => {
        const estado = criarEstadoInicial();
        
        expect(estado.falhas).toBe(0);
      });

      test('deve criar estado FECHADO', () => {
        const estado = criarEstadoInicial();
        
        expect(estado.estado).toBe('FECHADO');
      });

      test('deve ter ultimaFalha zerada', () => {
        const estado = criarEstadoInicial();
        
        expect(estado.ultimaFalha).toBe(0);
      });
    });

    describe('registrarSucesso()', () => {
      
      test('deve zerar falhas', () => {
        const estadoComFalhas = { falhas: 3, ultimaFalha: 123, estado: 'SEMI_ABERTO' };
        
        const novoEstado = registrarSucesso(estadoComFalhas);
        
        expect(novoEstado.falhas).toBe(0);
      });

      test('deve mudar estado para FECHADO', () => {
        const estadoAberto = { falhas: 5, ultimaFalha: 123, estado: 'ABERTO' };
        
        const novoEstado = registrarSucesso(estadoAberto);
        
        expect(novoEstado.estado).toBe('FECHADO');
      });

      test('deve preservar ultimaFalha (imutabilidade parcial)', () => {
        const estadoOriginal = { falhas: 2, ultimaFalha: 999, estado: 'SEMI_ABERTO' };
        
        const novoEstado = registrarSucesso(estadoOriginal);
        
        expect(novoEstado.ultimaFalha).toBe(999);
      });
    });

    describe('registrarFalha()', () => {
      
      test('deve incrementar contador de falhas', () => {
        const estado = { falhas: 2, ultimaFalha: 0, estado: 'FECHADO' };
        
        const novoEstado = registrarFalha(estado);
        
        expect(novoEstado.falhas).toBe(3);
      });

      test('deve atualizar timestamp da última falha', () => {
        const antes = Date.now();
        const estado = criarEstadoInicial();
        
        const novoEstado = registrarFalha(estado);
        const depois = Date.now();
        
        expect(novoEstado.ultimaFalha).toBeGreaterThanOrEqual(antes);
        expect(novoEstado.ultimaFalha).toBeLessThanOrEqual(depois);
      });

      test('deve abrir circuit breaker após atingir limite de falhas', () => {
        const config = { limiteFalhas: 3, tempoResetMs: 60000 };
        let estado = criarEstadoInicial();
        
        estado = registrarFalha(estado, config);
        estado = registrarFalha(estado, config);
        expect(estado.estado).toBe('FECHADO'); // Ainda não atingiu
        
        estado = registrarFalha(estado, config);
        expect(estado.estado).toBe('ABERTO'); // Agora sim
      });

      test('deve usar config padrão se não fornecida', () => {
        let estado = criarEstadoInicial();
        
        // Registra CONFIG_PADRAO.limiteFalhas (5) falhas
        for (let i = 0; i < 5; i++) {
          estado = registrarFalha(estado);
        }
        
        expect(estado.estado).toBe('ABERTO');
      });
    });

    describe('podeExecutar()', () => {
      
      describe('Estado FECHADO', () => {
        
        test('deve permitir execução', () => {
          const estado = criarEstadoInicial();
          
          const { podeExecutar: pode } = podeExecutar(estado);
          
          expect(pode).toBe(true);
        });

        test('deve manter estado FECHADO', () => {
          const estado = criarEstadoInicial();
          
          const { novoEstado } = podeExecutar(estado);
          
          expect(novoEstado.estado).toBe('FECHADO');
        });
      });

      describe('Estado ABERTO', () => {
        
        test('deve bloquear execução dentro do período de reset', () => {
          const estado = {
            falhas: 5,
            ultimaFalha: Date.now(), // Acabou de falhar
            estado: 'ABERTO'
          };
          const config = { tempoResetMs: 60000 };
          
          const { podeExecutar: pode } = podeExecutar(estado, config);
          
          expect(pode).toBe(false);
        });

        test('deve permitir execução após período de reset', () => {
          const estado = {
            falhas: 5,
            ultimaFalha: Date.now() - 120000, // 2 minutos atrás
            estado: 'ABERTO'
          };
          const config = { tempoResetMs: 60000 }; // 1 minuto
          
          const { podeExecutar: pode } = podeExecutar(estado, config);
          
          expect(pode).toBe(true);
        });

        test('deve mudar para SEMI_ABERTO após período de reset', () => {
          const estado = {
            falhas: 5,
            ultimaFalha: Date.now() - 120000,
            estado: 'ABERTO'
          };
          const config = { tempoResetMs: 60000 };
          
          const { novoEstado } = podeExecutar(estado, config);
          
          expect(novoEstado.estado).toBe('SEMI_ABERTO');
        });
      });

      describe('Estado SEMI_ABERTO', () => {
        
        test('deve permitir execução (requisição de teste)', () => {
          const estado = {
            falhas: 5,
            ultimaFalha: Date.now() - 120000,
            estado: 'SEMI_ABERTO'
          };
          
          const { podeExecutar: pode } = podeExecutar(estado);
          
          expect(pode).toBe(true);
        });

        test('deve manter estado SEMI_ABERTO', () => {
          const estado = {
            falhas: 5,
            ultimaFalha: Date.now() - 120000,
            estado: 'SEMI_ABERTO'
          };
          
          const { novoEstado } = podeExecutar(estado);
          
          expect(novoEstado.estado).toBe('SEMI_ABERTO');
        });
      });
    });
  });

  describe('Factory criarCircuitBreaker()', () => {
    
    let cb;

    beforeEach(() => {
      cb = criarCircuitBreaker({ limiteFalhas: 3, tempoResetMs: 100 });
    });

    test('deve criar instância com estado inicial FECHADO', () => {
      const estado = cb.obterEstado();
      
      expect(estado.estado).toBe('FECHADO');
      expect(estado.falhas).toBe(0);
    });

    test('deve permitir execução quando FECHADO', () => {
      expect(cb.podeExecutar()).toBe(true);
    });

    test('deve abrir após exceder limite de falhas', () => {
      cb.registrarFalha();
      cb.registrarFalha();
      cb.registrarFalha();
      
      expect(cb.obterEstado().estado).toBe('ABERTO');
      expect(cb.podeExecutar()).toBe(false);
    });

    test('deve resetar para FECHADO após sucesso', () => {
      cb.registrarFalha();
      cb.registrarFalha();
      cb.registrarSucesso();
      
      expect(cb.obterEstado().falhas).toBe(0);
      expect(cb.obterEstado().estado).toBe('FECHADO');
    });

    test('deve permitir execução após tempo de reset', async () => {
      cb.registrarFalha();
      cb.registrarFalha();
      cb.registrarFalha();
      
      expect(cb.podeExecutar()).toBe(false);
      
      // Aguarda mais que tempoResetMs (100ms)
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(cb.podeExecutar()).toBe(true);
      expect(cb.obterEstado().estado).toBe('SEMI_ABERTO');
    });

    test('resetar() deve voltar ao estado inicial', () => {
      cb.registrarFalha();
      cb.registrarFalha();
      cb.registrarFalha();
      
      cb.resetar();
      
      expect(cb.obterEstado().estado).toBe('FECHADO');
      expect(cb.obterEstado().falhas).toBe(0);
    });
  });
});
