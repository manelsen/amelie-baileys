/**
 * LimpadorTemp - Gerenciamento de resíduos temporários (Padrão Funcional)
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Limpa arquivos antigos de um diretório
 * @param {string} diretorio 
 * @param {number} idadeMaximaMinutos 
 * @param {Object} logger 
 */
const limpar = async (diretorio, idadeMaximaMinutos = 30, logger) => {
    try {
        const agora = Date.now();
        const limite = idadeMaximaMinutos * 60 * 1000;
        
        try { await fs.access(diretorio); } catch { return; }

        const arquivos = await fs.readdir(diretorio);
        let contador = 0;

        for (const arquivo of arquivos) {
            if (arquivo === 'ultimo_check.txt' || arquivo === '.gitkeep' || arquivo.startsWith('.')) continue;

            const caminhoCompleto = path.join(diretorio, arquivo);
            const stats = await fs.stat(caminhoCompleto);
            
            if ((agora - stats.mtimeMs) > limite) {
                await fs.unlink(caminhoCompleto);
                contador++;
            }
        }

        if (contador > 0 && logger) {
            logger.info(`[LimpadorTemp] Removidos ${contador} arquivos temporários antigos`);
        }
    } catch (erro) {
        if (logger) logger.error(`[LimpadorTemp] Erro: ${erro.message}`);
    }
};

/**
 * Agenda a execução periódica da limpeza (com guarda contra chamadas duplicadas)
 */
let agendamentoAtivo = false;

const agendarLimpeza = (diretorio, intervaloMs, logger) => {
    if (agendamentoAtivo) {
        if (logger) logger.warn('[LimpadorTemp] Limpeza já agendada. Ignorando chamada duplicada.');
        return;
    }
    agendamentoAtivo = true;
    setInterval(() => limpar(diretorio, 30, logger), intervaloMs);
    if (logger) logger.info(`[LimpadorTemp] Limpeza horária ativa`);
};

module.exports = {
    limpar,
    agendarLimpeza
};
