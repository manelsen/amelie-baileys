const { Resultado, Trilho, Operacoes } = require('../../../src/utilitarios/Ferrovia');

describe('Ferrovia (Railway Pattern)', () => {
  describe('Resultado', () => {
    test('sucesso() deve criar um objeto de sucesso', () => {
      const res = Resultado.sucesso('dados');
      expect(res.sucesso).toBe(true);
      expect(res.dados).toBe('dados');
      expect(res.erro).toBeNull();
    });

    test('falha() deve criar um objeto de falha', () => {
      const erro = new Error('erro teste');
      const res = Resultado.falha(erro);
      expect(res.sucesso).toBe(false);
      expect(res.dados).toBeNull();
      expect(res.erro).toBe(erro);
    });

    test('falha() deve converter string em Error', () => {
      const res = Resultado.falha('erro string');
      expect(res.erro).toBeInstanceOf(Error);
      expect(res.erro.message).toBe('erro string');
    });

    test('mapear() deve transformar dados em caso de sucesso', () => {
      const res = Resultado.sucesso(10);
      const novoRes = Resultado.mapear(res, (n) => n * 2);
      expect(novoRes.sucesso).toBe(true);
      expect(novoRes.dados).toBe(20);
    });

    test('mapear() não deve transformar em caso de falha', () => {
      const res = Resultado.falha('erro');
      const novoRes = Resultado.mapear(res, (n) => n * 2);
      expect(novoRes.sucesso).toBe(false);
      expect(novoRes.erro.message).toBe('erro');
    });

    test('encadear() deve fluir em caso de sucesso', () => {
      const res = Resultado.sucesso(10);
      const novoRes = Resultado.encadear(res, (n) => Resultado.sucesso(n + 5));
      expect(novoRes.sucesso).toBe(true);
      expect(novoRes.dados).toBe(15);
    });

    test('dobrar() deve chamar a função correta', () => {
      const sucesso = Resultado.sucesso('ok');
      const falha = Resultado.falha('err');

      const onSucesso = jest.fn();
      const onFalha = jest.fn();

      Resultado.dobrar(sucesso, onSucesso, onFalha);
      expect(onSucesso).toHaveBeenCalledWith('ok');
      expect(onFalha).not.toHaveBeenCalled();

      jest.clearAllMocks();

      Resultado.dobrar(falha, onSucesso, onFalha);
      expect(onSucesso).not.toHaveBeenCalled();
      expect(onFalha).toHaveBeenCalled();
    });
  });

  describe('Trilho (Async)', () => {
    test('dePromise() deve converter promise resolvida em sucesso', async () => {
      const promessa = Promise.resolve('ok');
      const res = await Trilho.dePromise(promessa);
      expect(res.sucesso).toBe(true);
      expect(res.dados).toBe('ok');
    });

    test('dePromise() deve converter promise rejeitada em falha', async () => {
      const promessa = Promise.reject(new Error('falhou'));
      const res = await Trilho.dePromise(promessa);
      expect(res.sucesso).toBe(false);
      expect(res.erro.message).toBe('falhou');
    });

    test('encadear() deve executar sequencialmente', async () => {
      const passo1 = jest.fn().mockResolvedValue(Resultado.sucesso(1));
      const passo2 = jest.fn().mockResolvedValue(Resultado.sucesso(2));

      const fluxo = Trilho.encadear(passo1, passo2);
      const res = await fluxo('inicio');

      expect(res.sucesso).toBe(true);
      expect(res.dados).toBe(2);
      expect(passo1).toHaveBeenCalledWith('inicio');
      expect(passo2).toHaveBeenCalledWith(1);
    });

    test('encadear() deve parar no primeiro erro', async () => {
        const passo1 = jest.fn().mockResolvedValue(Resultado.falha(new Error('erro 1')));
        const passo2 = jest.fn().mockResolvedValue(Resultado.sucesso(2));
  
        const fluxo = Trilho.encadear(passo1, passo2);
        const res = await fluxo('inicio');
  
        expect(res.sucesso).toBe(false);
        expect(res.erro.message).toContain('erro 1'); // Ajustado para verificar se contém a mensagem
        expect(passo2).not.toHaveBeenCalled();
      });
  });

  describe('Operacoes', () => {
    test('tentar() deve capturar exceções', () => {
        const fnPerigosa = () => { throw new Error('boom'); };
        const segura = Operacoes.tentar(fnPerigosa);
        
        const res = segura();
        expect(res.sucesso).toBe(false);
        expect(res.erro.message).toContain('boom');
    });

    test('verificar() deve validar condição', () => {
        const check = Operacoes.verificar(x => x > 0, 'deve ser positivo');
        
        expect(check(10).sucesso).toBe(true);
        expect(check(-5).sucesso).toBe(false);
        expect(check(-5).erro.message).toBe('deve ser positivo');
    });
  });
});
