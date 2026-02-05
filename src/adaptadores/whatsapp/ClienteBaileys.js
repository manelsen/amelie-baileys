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

class ClienteBaileys extends EventEmitter {
    constructor(registrador, opcoes = {}) {
        super();
        this.registrador = registrador;
        this.clienteId = opcoes.clienteId || 'principal';
        this.diretorioAuth = `./db/auth-${this.clienteId}`;
        this.sock = null;
        this.pronto = false;
        
        this.inicializar();
    }

    async inicializar() {
        const { state, saveCreds } = await useMultiFileAuthState(this.diretorioAuth);
        const { version } = await fetchLatestBaileysVersion();

        this.sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' })),
            },
            printQRInTerminal: false,
            logger: P({ level: 'silent' }),
            browser: ['Amélie', 'MacOS', '3.0.0']
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                qrcode.generate(qr, { small: true });
                this.registrador.info('[Baileys] QR Code gerado.');
                this.emit('qr', qr);
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
                this.registrador.error(`[Baileys] Conexão fechada. Reconectar: ${shouldReconnect}`);
                this.pronto = false;
                if (shouldReconnect) this.inicializar();
            } else if (connection === 'open') {
                this.registrador.info('[Baileys] Conexão aberta com sucesso.');
                this.pronto = true;
                this.emit('pronto');
            }
        });

        this.sock.ev.on('messages.upsert', async m => {
            if (m.type === 'notify') {
                for (const msg of m.messages) {
                    if (!msg.key.fromMe) {
                        // Converter para formato Amélie
                        const mensagemMapeada = baileysParaAmelie(msg);
                        if (mensagemMapeada) {
                            this.emit('mensagem', mensagemMapeada);
                        }
                    }
                }
            }
        });
    }

    async enviarMensagem(para, conteudo, opcoes = null) {
        try {
            // DEBUG: Logs detalhados para investigação de falha de envio
            // this.registrador.info(`[Baileys] INICIO ENVIO DE MENSAGEM`); // Log removido para redução de ruído
            // this.registrador.info(`[Baileys] Parametro 'para' recebido: "${para}"`); // Log removido
            
            const jid = para.includes('@') ? para : `${para}@s.whatsapp.net`;
            // this.registrador.info(`[Baileys] JID normalizado para envio: "${jid}"`); // Log removido
            
            let quotedFinal = opcoes?.quoted;
            if (quotedFinal) {
                // this.registrador.info(`[Baileys] Opcoes.quoted presente.`); // Log removido
                try {
                    // Cuidado com estruturas circulares, mas JSON.stringify geralmente ok para objetos de mensagem serializados
                    // const quotedDump = JSON.stringify(quotedFinal, null, 2); // Log removido
                    // this.registrador.info(`[Baileys] DUMP Quoted: ${quotedDump}`); // Log removido
                    
                    // Correção proativa de chaves malformadas (compatibilidade legado/mapper antigo)
                    if (quotedFinal.key) {
                        // Garantir remoteJid (Baileys exige)
                        if (!quotedFinal.key.remoteJid && quotedFinal.key.remote) {
                            quotedFinal.key.remoteJid = quotedFinal.key.remote;
                            // this.registrador.warn(`[Baileys] Corrigido: remoteJid preenchido a partir de remote: ${quotedFinal.key.remoteJid}`); // Log removido
                        }
                        // Se ainda não tiver remoteJid, tentar usar o jid do destinatário (assumindo resposta no mesmo chat)
                        if (!quotedFinal.key.remoteJid) {
                             quotedFinal.key.remoteJid = jid;
                             // this.registrador.warn(`[Baileys] Corrigido: remoteJid assumido do destinatário: ${quotedFinal.key.remoteJid}`); // Log removido
                        }

                        // Garantir id (se por algum milagre não tiver)
                        if (!quotedFinal.key.id && quotedFinal.key._serialized) {
                             quotedFinal.key.id = quotedFinal.key._serialized;
                        }
                        
                        // Limpeza de participant vazio (causa erro em PV)
                        if (quotedFinal.key.participant === '' || quotedFinal.key.participant === null) {
                            delete quotedFinal.key.participant;
                            // this.registrador.info(`[Baileys] Participant vazio removido da key.`); // Log removido
                        }

                        // this.registrador.info(`[Baileys] Quoted.key FINAL: remoteJid=${quotedFinal.key.remoteJid}, id=${quotedFinal.key.id}, participant=${quotedFinal.key.participant}`); // Log removido
                    } else {
                        // this.registrador.warn(`[Baileys] ALERTA: opcoes.quoted não possui propriedade 'key'! A citação será IGNORADA para evitar crash.`); // Mantendo como debug se necessário ou removendo
                        quotedFinal = undefined;
                    }
                } catch (e) {
                    this.registrador.error(`[Baileys] Falha ao tratar quoted: ${e.message}`);
                }
            } else {
                // this.registrador.info(`[Baileys] Enviando SEM quoted message.`); // Log removido
            }

            // this.registrador.info(`[Baileys] Executando sock.sendMessage(${jid})...`); // Log removido
            
            const sentMsg = await this.sock.sendMessage(jid, { text: conteudo }, { quoted: quotedFinal });
            
            // this.registrador.info(`[Baileys] Sucesso no sock.sendMessage. ID: ${sentMsg?.key?.id}`); // Log removido
            // Retornar objeto compatível com o padrão Railway do ServicoMensagem
            return { sucesso: !!sentMsg, dados: sentMsg, erro: null };
        } catch (erro) {
            this.registrador.error(`[Baileys] ERRO CRÍTICO NO ENVIO: ${erro.message}`);
            this.registrador.error(`[Baileys] Stack: ${erro.stack}`);
            // Logar propriedades adicionais do erro se existirem (comum em erros do Baileys/Axios)
            if (erro.data || erro.output || erro.details) {
                 try {
                     const errExtra = JSON.stringify({ data: erro.data, output: erro.output, details: erro.details });
                     this.registrador.error(`[Baileys] Detalhes extras do erro: ${errExtra}`);
                 } catch(ignore) {}
            }
            return { sucesso: false, dados: null, erro };
        }
    }
    
    // Alias para compatibilidade
    async enviarTexto(para, conteudo, opcoes = null) {
        return this.enviarMensagem(para, conteudo, opcoes);
    }

    // Mock para histórico de mensagens (Baileys não suporta fetch histórico fácil sem Store)
    async obterHistoricoMensagens(chatId, limite = 10) {
        // TODO: Implementar store persistente se necessário
        return []; 
    }

    // Métodos de compatibilidade para o MonitorSaude e legacy code
    
    async reconectar() {
        this.registrador.info('[Baileys] Solicitação de reconexão recebida (gerenciada nativamente pelo Baileys).');
        // O Baileys reconecta sozinho. Se precisarmos forçar:
        // this.sock.end(new Error('Forçando reconexão'));
        return true;
    }

    async estaProntoRealmente() {
        return this.pronto;
    }

    // Getter para manter compatibilidade com código que acessa .cliente
    get cliente() {
        // Retorna um Proxy para interceptar chamadas a métodos inexistentes no sock
        return new Proxy(this.sock, {
            get: (target, prop) => {
                if (prop in target) return target[prop];
                
                // Mock getContactById
                if (prop === 'getContactById') {
                    return async (id) => ({
                        id: { _serialized: id },
                        name: 'Usuário',
                        shortName: 'Usuário',
                        pushname: 'Usuário'
                    });
                }
                
                return undefined;
            }
        });
    }

    async deveResponderNoGrupo(msg, chat) {
        // Verifica se é comando
        if (msg.body && msg.body.trim().startsWith('.')) return true;

        // Verifica se tem mídia
        if (msg.hasMedia) return true;

        // ID do Bot (normalizado)
        const botId = this.sock?.user?.id ? this.sock.user.id.split(':')[0] + '@s.whatsapp.net' : null;

        // Verifica menção
        if (botId && msg.mentionedIds && msg.mentionedIds.includes(botId)) return true;

        // Verifica resposta a mensagem do bot
        if (botId && msg.quotedParticipant === botId) return true;

        return false;
    }
}

module.exports = ClienteBaileys;
