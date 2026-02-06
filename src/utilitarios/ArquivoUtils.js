/**
 * ArquivoUtils - Utilitários otimizados para manipulação de arquivos
 * Implementado seguindo o padrão Railway.
 */

const fs = require('fs').promises;
const path = require('path');
const { Resultado } = require('./Ferrovia');

const ArquivoUtils = {
    criarDiretorio: async (diretorio) => {
        try {
            await fs.mkdir(diretorio, { recursive: true });
            return Resultado.sucesso(diretorio);
        } catch (e) {
            return Resultado.falha(e);
        }
    },

    verificarArquivoExiste: async (caminho) => {
        try {
            await fs.access(caminho);
            return Resultado.sucesso(true);
        } catch (e) {
            return Resultado.sucesso(false); // Retorna sucesso(false) para existência
        }
    },

    salvarArquivoJson: async (caminho, dados) => {
        try {
            await fs.writeFile(caminho, JSON.stringify(dados, null, 2), 'utf8');
            return Resultado.sucesso(caminho);
        } catch (e) {
            return Resultado.falha(e);
        }
    },

    salvarArquivoBinario: async (caminho, buffer) => {
        try {
            const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer, 'base64');
            await fs.writeFile(caminho, buf);
            return Resultado.sucesso(caminho);
        } catch (e) {
            return Resultado.falha(e);
        }
    },

    copiarArquivo: async (origem, destino) => {
        try {
            await fs.copyFile(origem, destino);
            return Resultado.sucesso(destino);
        } catch (e) {
            return Resultado.falha(e);
        }
    },

    removerArquivo: async (caminho) => {
        try {
            await fs.unlink(caminho);
            return Resultado.sucesso(true);
        } catch (e) {
            return Resultado.falha(e);
        }
    }
};

/**
 * Salva conteúdo bloqueado para auditoria (Lógica de Domínio)
 */
const salvarConteudoBloqueado = (tipo, diretorioBase) => async (dados, erro) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const caminhoJson = path.join(diretorioBase, `${tipo}_blocked_${timestamp}.json`);
    const caminhoMidia = path.join(diretorioBase, `${tipo}_blocked_${timestamp}${tipo === 'video' ? '.mp4' : '.bin'}`);

    await ArquivoUtils.criarDiretorio(diretorioBase);

    const metadados = {
        timestamp,
        origemInfo: dados.origemInfo,
        erro: erro.message,
        prompt: dados.prompt,
        arquivoSalvo: path.basename(caminhoMidia)
    };

    const salvarMidia = tipo === 'video' 
        ? ArquivoUtils.copiarArquivo(dados.caminhoVideo, caminhoMidia)
        : ArquivoUtils.salvarArquivoBinario(caminhoMidia, dados.imagemData?.data || '');

    return Promise.all([
        ArquivoUtils.salvarArquivoJson(caminhoJson, metadados),
        salvarMidia
    ]).then(() => Resultado.sucesso({ caminhoJson, caminhoMidia }));
};

module.exports = { ...ArquivoUtils, salvarConteudoBloqueado };
