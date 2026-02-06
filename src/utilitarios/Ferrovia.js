/**
 * Ferrovia.js - Implementação Otimizada do Padrão Railway (Railway Oriented Programming)
 * 
 * Fornece a base monádica (Resultado) e utilitários de fluxo (Trilho) para o sistema.
 * Focado em performance, imutabilidade e semântica de erros.
 */

/**
 * Estrutura monádica para encapsular sucessos e falhas.
 */
const Resultado = {
  sucesso: (dados) => ({ sucesso: true, dados, erro: null }),

  falha: (erro) => ({ 
    sucesso: false, 
    dados: null, 
    erro: erro instanceof Error ? erro : new Error(String(erro))
  }),
  
  mapear: (resultado, fn) => resultado.sucesso 
    ? Resultado.sucesso(fn(resultado.dados)) 
    : resultado,
  
  encadear: (resultado, fn) => resultado.sucesso 
    ? fn(resultado.dados) 
    : resultado,
  
  dobrar: (resultado, aoSucesso, aoFalhar) => 
    resultado.sucesso 
      ? aoSucesso(resultado.dados) 
      : aoFalhar(resultado.erro),
  
  recuperar: (resultado, fn) => resultado.sucesso
    ? resultado
    : fn(resultado.erro),
      
  /**
   * Combina múltiplos resultados em um único (passagem única).
   */
  todos: (resultados) => {
    const dados = [];
    for (const r of resultados) {
      if (!r.sucesso) return r;
      dados.push(r.dados);
    }
    return Resultado.sucesso(dados);
  }
};

/**
 * Orquestrador de fluxos (Trilhos).
 */
const Trilho = {
  dePromise: (promessa) => 
    promessa
      .then(valor => Resultado.sucesso(valor))
      .catch(erro => Resultado.falha(erro)),
  
  envolver: (fn) => (...args) => 
    Trilho.dePromise(fn(...args)),
    
  /**
   * Encadeia operações assíncronas com tratamento de causa original.
   */
  encadear: (...fns) => async (valorInicial) => {
    let resultado = Resultado.sucesso(valorInicial);
    
    for (const fn of fns) {
      if (!resultado.sucesso) break;
      
      const nomeEtapa = fn.name || 'etapa_anonima';
      try {
        const proximo = await fn(resultado.dados);
        
        if (!proximo || typeof proximo.sucesso !== 'boolean') {
          resultado = Resultado.falha(new Error(`Contrato violado na etapa '${nomeEtapa}': Retorno não é um Resultado.`));
          break;
        }

        if (!proximo.sucesso) {
          // Usa a propriedade 'cause' nativa do Node para manter rastreabilidade
          const erroComContexto = new Error(`Falha na etapa '${nomeEtapa}': ${proximo.erro.message}`, { cause: proximo.erro });
          resultado = Resultado.falha(erroComContexto);
          break;
        }
        
        resultado = proximo;
      } catch (erroExcecao) {
        resultado = Resultado.falha(new Error(`Exceção na etapa '${nomeEtapa}': ${erroExcecao.message}`, { cause: erroExcecao }));
        break;
      }
    }
    
    return resultado;
  }
};

const Operacoes = {
  /**
   * Transforma qualquer função em um trilho seguro.
   */
  tentar: (fn) => (...args) => {
    try {
      const res = fn(...args);
      return res instanceof Promise ? Trilho.dePromise(res) : Resultado.sucesso(res);
    } catch (err) {
      return Resultado.falha(new Error(`Erro em '${fn.name || 'anon'}'`, { cause: err }));
    }
  },
  
  verificar: (predicado, mensagemErro) => (valor) =>
    predicado(valor) ? Resultado.sucesso(valor) : Resultado.falha(mensagemErro)
};

module.exports = { Resultado, Trilho, Operacoes };
