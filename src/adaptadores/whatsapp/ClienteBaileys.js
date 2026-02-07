const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const EventEmitter = require('events');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const { baileysParaAmelie } = require('./MapperMensagem');

// Logger silencioso para o Baileys
const criarLoggerBaileys = () => P({ 
    level: 'silent',
    enabled: false 
});

/**
 * ClienteBaileys - Adaptador funcional para a biblioteca Baileys
 * @param {Object} registrador - Logger do sistema
 * @param {Object} opcoes - Opções (clienteId, etc)
 */
const criarClienteBaileys = (registrador, opcoes = {}) => {
    const eventos = new EventEmitter();
    const clienteId = opcoes.clienteId || 'principal';
    const diretorioAuth = `./db/auth-${clienteId}`;
    const loggerBaileys = criarLoggerBaileys();
    
    let sock = null;
    let pronto = false;

    /**
     * Inicializa a conexão com o WhatsApp
     */
    const inicializar = async () => {
        const { state, saveCreds } = await useMultiFileAuthState(diretorioAuth);
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, loggerBaileys),
            },
            printQRInTerminal: false,
            logger: loggerBaileys,
            browser: ['Amélie', 'MacOS', '3.0.0']
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                qrcode.generate(qr, { small: true });
                registrador.info('[Baileys] QR Code gerado.');
                eventos.emit('qr', qr);
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
                registrador.error(`[Baileys] Conexão fechada. Reconectar: ${shouldReconnect}`);
                pronto = false;
                if (shouldReconnect) inicializar();
            } else if (connection === 'open') {
                registrador.info('[Baileys] Conexão aberta com sucesso.');
                pronto = true;
                eventos.emit('pronto');
            }
        });

        sock.ev.on('messages.upsert', async m => {
            if (m.type === 'notify') {
                for (const msg of m.messages) {
                    const mensagemMapeada = baileysParaAmelie(msg);
                    if (!mensagemMapeada) continue;

                    if (!msg.key.fromMe) {
                        eventos.emit('mensagem', mensagemMapeada);
                    }
                }
            }
        });
    };

    /**
     * Envia uma mensagem de texto
     */
    const enviarMensagem = async (para, conteudo, opcoesMsg = null) => {
        try {
            const jid = para.includes('@') ? para : `${para}@s.whatsapp.net`;
            let quotedFinal = opcoesMsg?.quoted;

            if (quotedFinal && quotedFinal.key) {
                if (!quotedFinal.key.remoteJid) {
                    quotedFinal.key.remoteJid = quotedFinal.key.remote || jid;
                }
                if (quotedFinal.key.participant === '' || quotedFinal.key.participant === null) {
                    delete quotedFinal.key.participant;
                }
            } else {
                quotedFinal = undefined;
            }

            const sentMsg = await sock.sendMessage(jid, { text: conteudo }, { quoted: quotedFinal });
            
            return { sucesso: !!sentMsg, dados: sentMsg, erro: null };
        } catch (erro) {
            registrador.error(`[Baileys] ERRO NO ENVIO: ${erro.message}`);
            return { sucesso: false, dados: null, erro };
        }
    };

    /**
     * Verifica se o bot deve responder em um grupo
     */
    const deveResponderNoGrupo = async (msg, chat) => {
        if (msg.body && msg.body.trim().startsWith('.')) return true;
        if (msg.hasMedia) return true;

        const botId = sock?.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : null;
        if (botId && msg.mentionedIds && msg.mentionedIds.includes(botId)) return true;
        if (botId && msg.quotedParticipant === botId) return true;

        return false;
    };

    // Objeto de interface (Fachada)
    const interfaceCliente = {
        // Eventos
        on: (evento, callback) => eventos.on(evento, callback),
        emit: (evento, dados) => eventos.emit(evento, dados),
        
        // Ações
        inicializar,
        enviarMensagem,
        enviarTexto: enviarMensagem, // Alias
        deveResponderNoGrupo,
        estaProntoRealmente: async () => pronto,
        
        // Lógica de histórico revertida para mock original
        obterHistoricoMensagens: async () => [],

        reconectar: async () => {
            registrador.info('[Baileys] Reconexão automática ativa.');
            return true;
        },

        // Getter compatível para o "sock" cru se necessário (Proxy para manter legado)
        get cliente() {
            return new Proxy(sock || {}, {
                get: (target, prop) => {
                    if (prop in target) return target[prop];
                    if (prop === 'getContactById') {
                        return async (id) => ({
                            id: { _serialized: (typeof id === 'string') ? id : (id?._serialized || 'unknown') },
                            name: 'Usuário'
                        });
                    }
                    return undefined;
                }
            });
        }
    };

    // Iniciar automaticamente como fazia a classe
    inicializar();

    return interfaceCliente;
};

module.exports = criarClienteBaileys;
