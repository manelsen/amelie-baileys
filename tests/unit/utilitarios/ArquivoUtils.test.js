/**
 * Testes unitários para ArquivoUtils.js
 * 
 * Testa operações de manipulação de arquivos usando o padrão Railway.
 * Usa um diretório temporário para isolamento dos testes.
 */

const fs = require('fs');
const path = require('path');
const { 
  criarDiretorio, 
  verificarArquivoExiste, 
  salvarArquivoJson, 
  salvarArquivoBinario, 
  copiarArquivo 
} = require('../../../src/utilitarios/ArquivoUtils');

// Diretório temporário isolado para os testes
const TMP_DIR = path.join(__dirname, '../../tmp');

describe('ArquivoUtils.js', () => {
  
  // Setup: Criar diretório temporário antes de todos os testes
  beforeAll(() => {
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }
  });

  // Cleanup: Remover diretório temporário após todos os testes
  afterAll(() => {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  describe('criarDiretorio()', () => {
    test('deve criar um novo diretório', async () => {
      const novoDir = path.join(TMP_DIR, 'teste-criar-dir');
      
      const resultado = await criarDiretorio(novoDir);
      
      expect(resultado.sucesso).toBe(true);
      expect(resultado.dados).toBe(novoDir);
      expect(fs.existsSync(novoDir)).toBe(true);
    });

    test('deve retornar sucesso se diretório já existe', async () => {
      const dirExistente = path.join(TMP_DIR, 'dir-existente');
      fs.mkdirSync(dirExistente, { recursive: true });
      
      const resultado = await criarDiretorio(dirExistente);
      
      expect(resultado.sucesso).toBe(true);
    });

    test('deve criar diretórios aninhados recursivamente', async () => {
      const dirAninhado = path.join(TMP_DIR, 'nivel1', 'nivel2', 'nivel3');
      
      const resultado = await criarDiretorio(dirAninhado);
      
      expect(resultado.sucesso).toBe(true);
      expect(fs.existsSync(dirAninhado)).toBe(true);
    });
  });

  describe('verificarArquivoExiste()', () => {
    test('deve retornar true para arquivo existente', async () => {
      const arquivo = path.join(TMP_DIR, 'arquivo-existe.txt');
      fs.writeFileSync(arquivo, 'conteudo de teste');
      
      const resultado = await verificarArquivoExiste(arquivo);
      
      expect(resultado.sucesso).toBe(true);
      expect(resultado.dados).toBe(true);
    });

    test('deve retornar false para arquivo inexistente', async () => {
      const arquivoInexistente = path.join(TMP_DIR, 'nao-existe-xyz.txt');
      
      const resultado = await verificarArquivoExiste(arquivoInexistente);
      
      expect(resultado.sucesso).toBe(true);
      expect(resultado.dados).toBe(false);
    });

    test('deve retornar true para diretório existente', async () => {
      const resultado = await verificarArquivoExiste(TMP_DIR);
      
      expect(resultado.sucesso).toBe(true);
      expect(resultado.dados).toBe(true);
    });
  });

  describe('salvarArquivoJson()', () => {
    test('deve salvar objeto como JSON formatado', async () => {
      const arquivo = path.join(TMP_DIR, 'dados.json');
      const dados = { nome: 'Amélie', versao: '2.0', ativo: true };
      
      const resultado = await salvarArquivoJson(arquivo, dados);
      
      expect(resultado.sucesso).toBe(true);
      expect(resultado.dados).toBe(arquivo);
      
      // Verificar conteúdo salvo
      const conteudoSalvo = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      expect(conteudoSalvo).toEqual(dados);
    });

    test('deve salvar array como JSON', async () => {
      const arquivo = path.join(TMP_DIR, 'array.json');
      const dados = [1, 2, 3, 'quatro'];
      
      const resultado = await salvarArquivoJson(arquivo, dados);
      
      expect(resultado.sucesso).toBe(true);
      const conteudoSalvo = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      expect(conteudoSalvo).toEqual(dados);
    });

    test('deve lidar com objeto vazio', async () => {
      const arquivo = path.join(TMP_DIR, 'vazio.json');
      
      const resultado = await salvarArquivoJson(arquivo, {});
      
      expect(resultado.sucesso).toBe(true);
      const conteudoSalvo = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      expect(conteudoSalvo).toEqual({});
    });
  });

  describe('salvarArquivoBinario()', () => {
    test('deve salvar dados binários de base64', async () => {
      const arquivo = path.join(TMP_DIR, 'binario.bin');
      const textoOriginal = 'Dados binários de teste';
      const base64 = Buffer.from(textoOriginal).toString('base64');
      
      const resultado = await salvarArquivoBinario(arquivo, base64);
      
      expect(resultado.sucesso).toBe(true);
      expect(resultado.dados).toBe(arquivo);
      
      // Verificar conteúdo
      const conteudo = fs.readFileSync(arquivo, 'utf8');
      expect(conteudo).toBe(textoOriginal);
    });

    test('deve salvar string vazia em base64', async () => {
      const arquivo = path.join(TMP_DIR, 'vazio.bin');
      const base64Vazio = Buffer.from('').toString('base64');
      
      const resultado = await salvarArquivoBinario(arquivo, base64Vazio);
      
      expect(resultado.sucesso).toBe(true);
      const conteudo = fs.readFileSync(arquivo, 'utf8');
      expect(conteudo).toBe('');
    });
  });

  describe('copiarArquivo()', () => {
    test('deve copiar arquivo com sucesso', async () => {
      const origem = path.join(TMP_DIR, 'origem-copia.txt');
      const destino = path.join(TMP_DIR, 'destino-copia.txt');
      const conteudo = 'Conteúdo para copiar';
      fs.writeFileSync(origem, conteudo);
      
      const resultado = await copiarArquivo(origem, destino);
      
      expect(resultado.sucesso).toBe(true);
      expect(resultado.dados).toBe(destino);
      expect(fs.readFileSync(destino, 'utf8')).toBe(conteudo);
    });

    test('deve sobrescrever arquivo destino se existir', async () => {
      const origem = path.join(TMP_DIR, 'origem-sobrescrever.txt');
      const destino = path.join(TMP_DIR, 'destino-sobrescrever.txt');
      
      fs.writeFileSync(origem, 'Novo conteúdo');
      fs.writeFileSync(destino, 'Conteúdo antigo');
      
      await copiarArquivo(origem, destino);
      
      expect(fs.readFileSync(destino, 'utf8')).toBe('Novo conteúdo');
    });

    test('deve falhar se arquivo origem não existir', async () => {
      const origemInexistente = path.join(TMP_DIR, 'origem-inexistente.txt');
      const destino = path.join(TMP_DIR, 'destino-falha.txt');
      
      const resultado = await copiarArquivo(origemInexistente, destino);
      
      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toBeDefined();
    });
  });
});
