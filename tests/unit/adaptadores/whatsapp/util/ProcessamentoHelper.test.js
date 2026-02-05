/**
 * Testes unitários para ProcessamentoHelper.js
 * 
 * O ProcessamentoHelper fornece funções utilitárias para:
 * - inicializarProcessamento: obter config, remetente e validar funcionalidade
 * - gerenciarCicloVidaTransacao: criar transação, executar lógica core, tratar erros
 */

const { 
  inicializarProcessamento, 
  gerenciarCicloVidaTransacao 
} = require('../../../../../src/adaptadores/whatsapp/util/ProcessamentoHelper');
const { Resultado } = require('../../../../../src/utilitarios/Ferrovia');

// Mock do OperacoesChat para isolar o teste
jest.mock('../../../../../src/adaptadores/whatsapp/dominio/OperacoesChat', () => ({
  obterOuCriarUsuario: jest.fn()
}));

const { obterOuCriarUsuario } = require('../../../../../src/adaptadores/whatsapp/dominio/OperacoesChat');

describe('ProcessamentoHelper.js', () => {
  
  let dependencias;

  beforeEach(() => {
    jest.clearAllMocks();
    
    dependencias = {
      registrador: { 
        info: jest.fn(), 
        error: jest.fn(), 
        warn: jest.fn() 
      },
      gerenciadorConfig: { 
        obterConfig: jest.fn() 
      },
      clienteWhatsApp: { 
        cliente: { info: { wid: { _serialized: 'bot@s.whatsapp.net' } } } 
      },
      gerenciadorTransacoes: { 
        criarTransacao: jest.fn(), 
        marcarComoProcessando: jest.fn().mockResolvedValue(true),
        registrarFalhaEntrega: jest.fn().mockResolvedValue(true)
      },
      servicoMensagem: { 
        enviarResposta: jest.fn().mockResolvedValue(Resultado.sucesso(true)) 
      }
    };
  });

  describe('inicializarProcessamento()', () => {
    
    describe('Validação de Funcionalidade', () => {
      
      test('deve falhar se a funcionalidade estiver desabilitada (false)', async () => {
        dependencias.gerenciadorConfig.obterConfig.mockResolvedValue({ 
          mediaAudio: false 
        });
        
        const res = await inicializarProcessamento(
          dependencias, 
          { remetenteId: 'user1' }, 
          'chat1', 
          'mediaAudio'
        );
        
        expect(res.sucesso).toBe(false);
        expect(res.erro.message).toContain('desabilitado');
      });

      test('deve falhar se a funcionalidade não existir na config', async () => {
        dependencias.gerenciadorConfig.obterConfig.mockResolvedValue({ 
          // mediaAudio não definido
        });
        
        const res = await inicializarProcessamento(
          dependencias, 
          {}, 
          'chat1', 
          'mediaAudio'
        );
        
        expect(res.sucesso).toBe(false);
      });

      test('deve falhar se config for null', async () => {
        dependencias.gerenciadorConfig.obterConfig.mockResolvedValue(null);
        
        const res = await inicializarProcessamento(
          dependencias, 
          {}, 
          'chat1', 
          'mediaAudio'
        );
        
        expect(res.sucesso).toBe(false);
      });
    });

    describe('Obtenção de Usuário', () => {
      
      test('deve inicializar com sucesso se habilitado e usuário existir', async () => {
        dependencias.gerenciadorConfig.obterConfig.mockResolvedValue({ 
          mediaAudio: true 
        });
        obterOuCriarUsuario.mockReturnValue(
          () => Promise.resolve(Resultado.sucesso({ name: 'Manel' }))
        );
        
        const res = await inicializarProcessamento(
          dependencias, 
          { remetenteId: 'user1@s.whatsapp.net' }, 
          'chat1@s.whatsapp.net', 
          'mediaAudio'
        );
        
        expect(res.sucesso).toBe(true);
        expect(res.dados.remetente.name).toBe('Manel');
        expect(res.dados.config.mediaAudio).toBe(true);
      });

      test('deve falhar se obtenção de usuário falhar', async () => {
        dependencias.gerenciadorConfig.obterConfig.mockResolvedValue({ 
          mediaAudio: true 
        });
        obterOuCriarUsuario.mockReturnValue(
          () => Promise.resolve(Resultado.falha(new Error('Usuário não encontrado')))
        );
        
        const res = await inicializarProcessamento(
          dependencias, 
          { remetenteId: 'user_invalido' }, 
          'chat1', 
          'mediaAudio'
        );
        
        expect(res.sucesso).toBe(false);
      });
    });

    describe('Diferentes Funcionalidades', () => {
      
      const funcionalidades = [
        'mediaAudio',
        'mediaImage',
        'mediaVideo',
        'mediaDoc'
      ];

      funcionalidades.forEach(func => {
        test(`deve validar funcionalidade '${func}'`, async () => {
          dependencias.gerenciadorConfig.obterConfig.mockResolvedValue({ 
            [func]: true 
          });
          obterOuCriarUsuario.mockReturnValue(
            () => Promise.resolve(Resultado.sucesso({ name: 'User' }))
          );
          
          const res = await inicializarProcessamento(
            dependencias, 
            { remetenteId: 'u1' }, 
            'c1', 
            func
          );
          
          expect(res.sucesso).toBe(true);
        });
      });
    });
  });

  describe('gerenciarCicloVidaTransacao()', () => {
    
    describe('Fluxo de Sucesso', () => {
      
      test('deve criar transação e executar função core', async () => {
        dependencias.gerenciadorTransacoes.criarTransacao.mockResolvedValue(
          Resultado.sucesso({ id: 'trans_001' })
        );
        const funcaoCore = jest.fn().mockResolvedValue(Resultado.sucesso('resultado_core'));

        const res = await gerenciarCicloVidaTransacao(
          dependencias, 
          { id: { id: 'msg1' } }, 
          'chat1', 
          funcaoCore
        );
        
        expect(res.sucesso).toBe(true);
        expect(funcaoCore).toHaveBeenCalledWith({ id: 'trans_001' });
      });

      test('deve marcar transação como processando', async () => {
        dependencias.gerenciadorTransacoes.criarTransacao.mockResolvedValue(
          Resultado.sucesso({ id: 'trans_002' })
        );
        const funcaoCore = jest.fn().mockResolvedValue(Resultado.sucesso('ok'));

        await gerenciarCicloVidaTransacao(dependencias, {}, 'chat1', funcaoCore);
        
        expect(dependencias.gerenciadorTransacoes.marcarComoProcessando)
          .toHaveBeenCalledWith('trans_002');
      });

      test('deve retornar resultado da função core', async () => {
        dependencias.gerenciadorTransacoes.criarTransacao.mockResolvedValue(
          Resultado.sucesso({ id: 'trans_003' })
        );
        const resultadoEsperado = { dados: 'processados', status: 'ok' };
        const funcaoCore = jest.fn().mockResolvedValue(Resultado.sucesso(resultadoEsperado));

        const res = await gerenciarCicloVidaTransacao(dependencias, {}, 'chat1', funcaoCore);
        
        expect(res.dados).toEqual(resultadoEsperado);
      });
    });

    describe('Tratamento de Erros', () => {
      
      test('deve registrar falha se função core lançar exceção', async () => {
        dependencias.gerenciadorTransacoes.criarTransacao.mockResolvedValue(
          Resultado.sucesso({ id: 'trans_erro_001' })
        );
        const erro = new Error('Erro na função core');
        const funcaoCore = jest.fn().mockRejectedValue(erro);

        const res = await gerenciarCicloVidaTransacao(dependencias, {}, 'chat1', funcaoCore);

        expect(res.sucesso).toBe(false);
        expect(dependencias.gerenciadorTransacoes.registrarFalhaEntrega)
          .toHaveBeenCalledWith('trans_erro_001', expect.stringContaining('Erro na função core'));
      });

      test('deve falhar se criação de transação falhar', async () => {
        dependencias.gerenciadorTransacoes.criarTransacao.mockResolvedValue(
          Resultado.falha(new Error('Erro ao criar transação'))
        );
        const funcaoCore = jest.fn();

        const res = await gerenciarCicloVidaTransacao(dependencias, {}, 'chat1', funcaoCore);

        expect(res.sucesso).toBe(false);
        expect(funcaoCore).not.toHaveBeenCalled();
      });

      test('deve falhar se transação criada não tiver ID', async () => {
        dependencias.gerenciadorTransacoes.criarTransacao.mockResolvedValue(
          Resultado.sucesso({ /* sem id */ })
        );
        const funcaoCore = jest.fn();

        const res = await gerenciarCicloVidaTransacao(dependencias, {}, 'chat1', funcaoCore);

        expect(res.sucesso).toBe(false);
        expect(res.erro.message).toContain('ID');
      });

      test('deve logar erro quando função core falhar', async () => {
        dependencias.gerenciadorTransacoes.criarTransacao.mockResolvedValue(
          Resultado.sucesso({ id: 'trans_erro_002' })
        );
        const funcaoCore = jest.fn().mockRejectedValue(new Error('Falha crítica'));

        await gerenciarCicloVidaTransacao(dependencias, {}, 'chat1', funcaoCore);

        // Verifica que o erro foi logado
        expect(dependencias.registrador.error).toHaveBeenCalledWith(
          expect.stringContaining('Falha crítica'),
          expect.anything()
        );
      });
    });
  });
});
