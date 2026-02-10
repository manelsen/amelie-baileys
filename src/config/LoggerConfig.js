/**
 * Configuração de Logs para Amélie
 */
const winston = require('winston');
const moment = require('moment-timezone');
const colors = require('colors/safe');

const configurarLogger = (nivelDebug) => {
    // Encurta IDs de transação para os últimos 6 caracteres
    const encurtarTxId = (id) => id.length > 10 ? `tx_..${id.slice(-6)}` : id;

    const meuFormato = winston.format.printf(({ timestamp, level, message }) => {
        const timestampFormatado = moment(timestamp).format('DD/MM/YYYY HH:mm:ss');
        const contextoMatch = message.match(/^\[([^\]]+)\]\s*/);
        const transacaoMatch = message.match(/\b(tx_[A-Fa-f0-9_]+)\b/);

        let contexto = 'Geral';
        let mensagemPrincipal = message;
        let idTransacao = '';

        if (contextoMatch) {
            contexto = contextoMatch[1];
            mensagemPrincipal = mensagemPrincipal.replace(contextoMatch[0], '');
        }

        if (transacaoMatch) {
            idTransacao = encurtarTxId(transacaoMatch[1]);
            mensagemPrincipal = mensagemPrincipal.replace(transacaoMatch[0], '');
        }

        mensagemPrincipal = mensagemPrincipal.replace(/\s*-\s*$/, '').trim().replace(/\s{2,}/g, ' ');

        const levelFormatado = colors.yellow(`[${level}]`);
        const contextoFormatado = colors.green(`[${contexto}]`);

        let logString = `${timestampFormatado} ${levelFormatado} ${contextoFormatado} ${mensagemPrincipal}`;
        if (idTransacao) logString += ` (${idTransacao})`;

        return logString.trim();
    });

    const formatoArquivo = winston.format.printf(({ timestamp, level, message }) => {
        const timestampFormatado = moment(timestamp).format('DD/MM/YYYY HH:mm:ss');
        const contextoMatch = message.match(/^\[([^\]]+)\]\s*/);
        const transacaoMatch = message.match(/\b(tx_[A-Fa-f0-9_]+)\b/);

        let contexto = 'Geral';
        let mensagemPrincipal = message;
        let idTransacao = '';

        if (contextoMatch) {
            contexto = contextoMatch[1];
            mensagemPrincipal = mensagemPrincipal.replace(contextoMatch[0], '');
        }

        if (transacaoMatch) {
            idTransacao = transacaoMatch[1]; // ID completo nos arquivos de log
            mensagemPrincipal = mensagemPrincipal.replace(transacaoMatch[0], '');
        }

        mensagemPrincipal = mensagemPrincipal.replace(/\s*-\s*$/, '').trim().replace(/\s{2,}/g, ' ');

        let logString = `${timestampFormatado} [${level.toUpperCase()}] [${contexto}] ${mensagemPrincipal}`;
        if (idTransacao) logString += ` (${idTransacao})`;

        return logString.trim();
    });

    return winston.createLogger({
        level: nivelDebug,
        format: winston.format.combine(winston.format.timestamp(), meuFormato),
        transports: [
            new winston.transports.Console(),
            new winston.transports.File({ 
                filename: './logs/bot.log', 
                format: winston.format.combine(winston.format.uncolorize(), formatoArquivo) 
            }),
            new winston.transports.File({ 
                filename: './logs/error.log', 
                level: 'error', 
                format: winston.format.combine(winston.format.uncolorize(), formatoArquivo) 
            })
        ]
    });
};

module.exports = configurarLogger;
