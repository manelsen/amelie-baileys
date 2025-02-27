const qrcode                  = require('qrcode-terminal');
const { Client, LocalAuth }   = require('whatsapp-web.js');
const { GoogleGenerativeAI }  = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const dotenv                  = require('dotenv');
const winston                 = require('winston');
const Datastore               = require('nedb');
const crypto                  = require('crypto');
const fs                      = require('fs');
const path                    = require('path');

dotenv.config();

// Configuração de variáveis de ambiente
const API_KEY                 = process.env.API_KEY;
const MAX_HISTORY             = parseInt(process.env.MAX_HISTORY || '50');

let bot_name                  = process.env.BOT_NAME || 'Amelie';
let lastProcessedAudio        = null;

// Configuração do logger
function getStackInfo() {
    const originalFunc = Error.prepareStackTrace;

    try {
        const err = new Error();
        Error.prepareStackTrace = (_, stack) => stack;
        const stack = err.stack;
        Error.prepareStackTrace = originalFunc;

        const caller = stack[2];
        const fileName = path.basename(caller.getFileName());
        const lineNumber = caller.getLineNumber();
        return `${fileName}:${lineNumber}`;
    } catch (e) {
        return '';
    }
}

const myFormat = winston.format.printf(({ timestamp, level, message, ...rest }) => {
    const lineInfo = getStackInfo();
    const extraData = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
    return `${timestamp} [${level}] ${lineInfo}: ${message} ${extraData}`;
});

const logger = winston.createLogger({
    level: 'info',
    format: winston
    .format
    .combine(
        winston
        .format
        .timestamp(),
        myFormat
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot.log' })
    ]
});

// Configuração do NeDB
const messagesDb = new Datastore({ filename: './db/messages.db', autoload: true });
const promptsDb  = new Datastore({ filename: './db/prompts.db' , autoload: true });
const configDb   = new Datastore({ filename: './db/config.db'  , autoload: true });
const groupsDb   = new Datastore({ filename: './db/groups.db'  , autoload: true });
const usersDb    = new Datastore({ filename: './db/users.db'   , autoload: true });

// Inicialização do GoogleGenerativeAI
const genAI = new GoogleGenerativeAI(API_KEY);

// Inicialização do modelo Gemini
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  });

// Inicialização do FileManager
const fileManager = new GoogleAIFileManager(API_KEY);

// Mapa para armazenar as últimas respostas por chat
const lastResponses = new Map();

// Configuração padrão
const defaultConfig = {
    temperature: 0.9,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 1024,
    mediaImage: true,  
    mediaAudio: true,  
    mediaVideo: true   
}

// Configuração do cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
    logger.info('QR code gerado');
});

async function initializeBot() {
    try {
        await loadConfigOnStartup();
        logger.info('Todas as configurações foram carregadas com sucesso');
    } catch (error) {
        logger.error('Erro ao carregar configurações:', error);
    }
}

client.on('message_create', async (msg) => {
    try {
        if (msg.fromMe) return;

        const chat = await msg.getChat();
        await chat.sendSeen();

        const isGroup = chat.id._serialized.endsWith('@g.us');
        logger.debug(`Verificação de grupo pelo ID: ${isGroup ? 'É GRUPO' : 'É PRIVADO'}`);

        let groupInfo = '';
        if (isGroup) {
            const group = await getOrCreateGroup(chat);
            groupInfo = ` no grupo "${group.title}" (${chat.id._serialized})`;
            logger.info(`Processando mensagem no grupo: ${group.title}`);
        }

        usuario = await getOrCreateUser(msg.author);
        logger.info(`Mensagem recebida: (${usuario.name}, ${groupInfo}) -> ${msg.body}`);

        const chatId = chat.id._serialized;
        const isCommand = msg.body.startsWith('!');

        if (isCommand) {
            logger.info("Processando comando...");
            await handleCommand(msg, chatId);
            return;
        }

        if (msg.hasMedia) {
            logger.info("Processando mídia...");
            const attachmentData = await msg.downloadMedia();
            if (!attachmentData || !attachmentData.data) {
                logger.error('Não foi possível obter dados de mídia.');
                // await msg.reply('Desculpe, não consegui processar esta mídia.');
                return;
            }

            // Função para inferir mime type do vídeo, caso não seja fornecido
            function inferVideoMimeType(buffer) {
                if (!buffer || buffer.length < 12) {
                    return 'application/octet-stream';
                }
                const hexBytes = buffer.slice(0, 12).toString('hex').toLowerCase();
                if (hexBytes.includes('66747970')) {
                    return 'video/mp4';
                }
                if (hexBytes.startsWith('1a45dfa3')) {
                    return 'video/webm';
                }
                if (hexBytes.startsWith('52494646')) {
                    return 'video/avi';
                }
                if (hexBytes.startsWith('3026b275')) {
                    return 'video/x-ms-wmv';
                }
                return 'application/octet-stream';
            }

            if (!attachmentData.mimetype) {
                const buffer = Buffer.from(attachmentData.data, 'base64');
                const mime = inferVideoMimeType(buffer);
                logger.info(`MIME inferido: ${mime}`);
                attachmentData.mimetype = mime;
            }

            if (attachmentData.mimetype.startsWith('audio/')) {
                await handleAudioMessage(msg, attachmentData, chatId);
                return;
            } else if (attachmentData.mimetype.startsWith('image/')) {
                await handleImageMessage(msg, attachmentData, chatId);
                return;
            } else if (attachmentData.mimetype.startsWith('video/')) {
                await handleVideoMessage(msg, attachmentData, chatId);
                return;
            } else {
                logger.info('Tipo de mídia não suportado.');
                return;
            }
        }

        if (isGroup) {
            logger.debug("Verificando regras do grupo...");
            const shouldRespond = await shouldRespondInGroup(msg, chat);
            if (!shouldRespond) {
                logger.debug("Mensagem não atende critérios de resposta do grupo");
                return;
            }
            logger.debug("Respondendo à mensagem do grupo...");
        } else {
            logger.debug("Respondendo à mensagem privada...");
        }

        await handleTextMessage(msg);

    } catch (error) {
        logger.error(`Erro ao processar mensagem: ${error.message}`, { error });
        await msg.reply('Desculpe, ocorreu um erro inesperado. Por favor, tente novamente mais tarde.');
    }
});

const helpText = `Olá! Eu sou a Amélie, uma assistente de AI multimídia acessível e integrada ao WhatsApp.

Minha idealizadora é a Belle Utsch. Quer conhecê-la? Clica aqui: https://beacons.ai/belleutsch




Comandos disponíveis:\n 
!reset - Limpa o histórico de conversa, restaura todas as configurações
         originais e desativa o modo cego\n 
!prompt set <nome> <texto> - Define uma nova personalidade\n 
!prompt get <nome> - Mostra uma personalidade existente\n 
!prompt list - Lista todas as personalidades\n 
!prompt use <nome> - Usa uma personalidade específica\n 
!prompt clear - Remove a personalidade ativa\n 
!config set <param> <valor> - Define um parâmetro de configuração\n 
!config get [param] - Mostra a configuração atual\n 
!users - Lista os usuários do grupo\n 
!cego - Aplica configurações para usuários com deficiência visual\n 
!help - Mostra esta mensagem de ajuda`;

client.on('group_join', async (notification) => {
    if (notification.recipientIds.includes(client.info.wid._serialized)) {
        const chat = await notification.getChat();
        const group = await getOrCreateGroup(chat);

        await chat.sendMessage('Olá a todos! Estou aqui para ajudar. Aqui estão alguns comandos que vocês podem usar:');
        await chat.sendMessage(helpText);
        logger.info(`Bot foi adicionado ao grupo "${group.title}" (${chat.id._serialized}) e enviou a saudação.`);
    }
});

async function calculateAverageMessageLength(chatId) {
    return new Promise((resolve, reject) => {
      messagesDb.find({ chatId: chatId, type: 'user' })
        .sort({ timestamp: -1 })
        .limit(10)
        .exec((err, messages) => {
          if (err) {
            reject(err);
          } else {
            const totalLength = messages.reduce((sum, msg) => sum + msg.content.length, 0);
            const averageLength = messages.length > 0 ? Math.round(totalLength / messages.length) : 100;
            resolve(averageLength);
          }
        });
    });
}

async function shouldRespondInGroup(msg, chat) {
    if (msg.body.startsWith('!')) {
        logger.info("Vou responder porque é um comando")
        return true;
    }

    const mentions = await msg.getMentions();
    const isBotMentioned = mentions.some(mention => 
        mention.id._serialized === client.info.wid._serialized
    );
    if (isBotMentioned) {
        logger.info("Vou responder porque a bot foi mencionada")
        return true;
    }

    if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg.fromMe) {
            logger.info("Vou responder porque é uma resposta à bot")
            return true;
        }
    }

    const messageLowerCase = msg.body.toLowerCase();
    const botNameLowerCase = bot_name.toLowerCase();
    if (messageLowerCase.includes(botNameLowerCase)) {
        logger.info("Vou responder porque mencionaram meu nome")
        return true;
    }

    logger.info("Não é nenhum caso especial e não vou responder")
    return false;
}

async function handleCommand(msg, chatId) {
    const [command, ...args] = msg.body.slice(1).split(' ');
    logger.info(`Comando: ${command}, Argumentos: ${args}`);

    try {
        switch (command.toLowerCase()) {
            case 'reset':
                await resetHistory(chatId);
                await resetConfig(chatId);
                await clearActiveSystemPrompt(chatId);
                await msg.reply('Histórico e configurações resetados para este chat. As transcrições de áudio e imagem foram habilitadas, e os prompts especiais foram desativados.');
                break;
            case 'help':
                await msg.reply(helpText); break;
            case 'prompt': await handlePromptCommand(msg, args, chatId); break;
            case 'config': await handleConfigCommand(msg, args, chatId); break;
            case 'users':  await listGroupUsers(msg); break;
            case 'cego':   await handleCegoCommand(msg, chatId); break;
            default:
                await msg.reply(
                    'Comando desconhecido. Use !help para ver os comandos disponíveis.'
                );
        }
    } catch (error) {
        logger.error(`Erro ao executar comando: ${error.message}`, { error });
        await msg.reply('Desculpe, ocorreu um erro ao executar o comando. Por favor, tente novamente.');
    }
}

function removeEmojis(text) {
    return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F0FF}\u{1F100}-\u{1F2FF}]/gu, '');
}

function resetConfig(chatId) {
    return new Promise((resolve, reject) => {
        configDb.update(
            { chatId },
            { $set: defaultConfig },
            { upsert: true },
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

async function handleCegoCommand(msg, chatId) {
    try {
        await setConfig(chatId, 'mediaImage', true);
        await setConfig(chatId, 'mediaAudio', false);

        const audiomarPrompt = `Você é um chatbot especializado em audiodescrição, projetado para funcionar em um grupo de WhatsApp com mais de 200 pessoas cegas. Sua função principal é descrever imagens e stickers compartilhados no grupo, fornecendo uma audiodescrição profissional, detalhada, didática e polida.
        
        Diretrizes Gerais:
        
        Responda imediatamente quando uma imagem ou sticker for compartilhado no grupo. Mantenha suas respostas concisas, mas informativas. Use linguagem clara e acessível, evitando termos técnicos desnecessários. Seja respeitoso e inclusivo em todas as suas interações.
        
        Estrutura da Resposta: Para cada imagem ou sticker, sua resposta deve seguir este formato:
        
        [Audiodescrição]
        (Forneça uma descrição objetiva e detalhada da imagem) 
        
        Diretrizes para a Descrição Profissional:

        Comece com uma visão geral da imagem antes de entrar em detalhes.
        Descreva os elementos principais da imagem, do mais importante ao menos relevante.
        Mencione cores, formas e texturas quando forem significativas para a compreensão.
        Indique a posição dos elementos na imagem (por exemplo, "no canto superior direito").
        Descreva expressões faciais e linguagem corporal em fotos com pessoas.
        Mencione o tipo de imagem (por exemplo, fotografia, ilustração, pintura).
        Informe sobre o enquadramento (close-up, plano geral, etc.) quando relevante.
        Inclua detalhes do cenário ou fundo que contribuam para o contexto.
        Evite usar termos subjetivos como "bonito" ou "feio".
        Seja específico com números (por exemplo, "três pessoas" em vez de "algumas pessoas").
        Descreva texto visível na imagem, incluindo legendas ou títulos.
        Mencione a escala ou tamanho relativo dos objetos quando importante.
        Indique se a imagem é em preto e branco ou colorida.
        Descreva a iluminação se for um elemento significativo da imagem.
        Para obras de arte, inclua informações sobre o estilo artístico e técnicas utilizadas.`;

        await setSystemPrompt(chatId, 'Audiomar', audiomarPrompt);
        await setActiveSystemPrompt(chatId, 'Audiomar');

        await msg.reply('Configurações para usuários com deficiência visual aplicadas com sucesso:\n' +
                        '- Descrição de imagens habilitada\n' +
                        '- Transcrição de áudio desabilitada\n' +
                        '- Prompt de audiodescrição "Audiomar" ativado');

        logger.info(`Configurações para usuários com deficiência visual aplicadas no chat ${chatId}`);
    } catch (error) {
        logger.error(`Erro ao aplicar configurações para usuários com deficiência visual: ${error.message}`, { error });
        await msg.reply('Desculpe, ocorreu um erro ao aplicar as configurações. Por favor, tente novamente.');
    }
}

async function handleTextMessage(msg) {
    try {
        const chat = await msg.getChat();
        const chatId = chat.id._serialized;
        const sender = msg.author || msg.from;

        const user = await getOrCreateUser(sender, chat);
        const chatConfig = await getConfig(chatId);

        let imageData = null;
        let userPromptText = msg.body;

        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.hasMedia) {
                const media = await quotedMsg.downloadMedia();
                if (media && media.mimetype.startsWith('image/')) {
                    imageData = media;
                }
            }
        }

        if (imageData) {
            await updateMessageHistory(chatId, user.name, `[Imagem citada] ${userPromptText}`);

            const response = await generateResponseWithTextAndImage(userPromptText, imageData, chatId);

            await updateMessageHistory(chatId, chatConfig.botName, response, true);
            await sendMessage(msg, response);
        } else {
            await updateMessageHistory(chatId, user.name, msg.body);

            const history = await getMessageHistory(chatId);
            const historyText = `Histórico de chat: (formato: nome do usuário e em seguida mensagem; responda à última mensagem)\n\n${history.join('\n')}`;

            const response = await generateResponseWithText(historyText, chatId);

            await updateMessageHistory(chatId, chatConfig.botName, response, true);
            await sendMessage(msg, response);
        }
    } catch (error) {
        logger.error(`Erro ao processar mensagem de texto: ${error.message}`);
        await msg.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.');
    }
}

async function generateResponseWithTextAndImage(userPrompt, imageData, chatId) {
    try {
        const userConfig = await getConfig(chatId);

        const imagePart = {
            inlineData: {
                data: imageData.data.toString('base64'),
                mimeType: imageData.mimetype
            }
        };

        const contentParts = [
            imagePart,
            { text: userPrompt }
        ];

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: userConfig.temperature,
                topK: userConfig.topK,
                topP: userConfig.topP,
                maxOutputTokens: userConfig.maxOutputTokens,
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ],
            systemInstruction: userConfig.systemInstructions
        });

        const result = await model.generateContent(contentParts);
        let responseText = result.response.text();

        if (!responseText) {
            throw new Error('Resposta vazia gerada pelo modelo');
        }

        responseText = removeEmojis(responseText);

        return responseText;
    } catch (error) {
        console.error(`Erro ao gerar resposta com texto e imagem: ${error.message}`);
        return "Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente ou reformule sua pergunta.";
    }
}

async function getOrCreateGroup(chat) {
    return new Promise((resolve, reject) => {
        const groupId = chat.id._serialized;
        groupsDb.findOne({ id: groupId }, async (err, group) => {
            if (err) {
                reject(err);
            } else if (group) {
                if (group.title !== chat.name) {
                    groupsDb.update(
                        { id: groupId }, 
                        { $set: { title: chat.name } }, 
                        {}, 
                        (err) => {
                        if (err) logger.error(
                            `Erro ao atualizar título do grupo ${groupId}: ${err.message}`
                        );
                    });
                }
                resolve(group);
            } else {
                try {
                    const newGroup = {
                        id: groupId,
                        title: chat.name || `Grupo_${groupId.substring(0, 6)}`,
                        createdAt: new Date()
                    };
                    groupsDb.insert(newGroup, (err, doc) => {
                        if (err) reject(err);
                        else resolve(doc);
                    });
                } catch (error) {
                    reject(error);
                }
            }
        });
    });
}

async function getOrCreateUser(sender, chat) {
    return new Promise((resolve, reject) => {
        usersDb.findOne({ id: sender }, async (err, user) => {
            if (err) {
                reject(err);
            } else if (user) {
                resolve(user);
            } else {
                try {
                    const contact = await client.getContactById(sender);
                    
                    let name = contact.pushname || contact.name || contact.shortName;
                    
                    if (!name || name.trim() === '') {
                        const idSuffix = sender;
                        name = `User${idSuffix}`;
                    }

                    const newUser = {
                        id: sender,
                        name: name,
                        joinedAt: new Date()
                    };
                    
                    usersDb.insert(newUser, (err, doc) => {
                        if (err) reject(err);
                        else resolve(doc);
                    });
                } catch (error) {
                    const idSuffix = sender;
                    const newUser = {
                        id: sender,
                        name: `User${idSuffix}`,
                        joinedAt: new Date()
                    };
                    usersDb.insert(newUser, (err, doc) => {
                        if (err) reject(err);
                        else resolve(doc);
                    });
                }
            }
        });
    });
}

async function handleAudioMessage(msg, audioData, chatId) {
    try {
        const config = await getConfig(chatId);
        if (!config.mediaAudio) {
            logger.info(`Transcrição de áudio desabilitada para o chat ${chatId}. Ignorando mensagem de áudio.`);
            return;
        }

        const audioSizeInMB = audioData.data.length / (1024 * 1024);
        if (audioSizeInMB > 20) {
            await msg.reply('Desculpe, só posso processar áudios de até 20MB.');
            return;
        }

        const isPTT = audioData.mimetype === 'audio/ogg; codecs=opus';
        logger.info(`Processando arquivo de áudio: ${isPTT ? 'PTT' : 'Áudio regular'}`);

        const audioHash = crypto.createHash('md5').update(audioData.data).digest('hex');
        if (lastProcessedAudio === audioHash) {
            await msg.reply('Este áudio já foi processado recentemente. Por favor, envie um novo áudio.');
            return;
        }
        lastProcessedAudio = audioHash;

        const base64AudioFile = audioData.data.toString('base64');
        const userConfig = await getConfig(chatId);

        const modelWithInstructions = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0.3,
                topK: userConfig.topK,
                topP: userConfig.topP,
                maxOutputTokens: userConfig.maxOutputTokens,
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ],
            systemInstruction: userConfig.systemInstructions + "\nFoque apenas no áudio mais recente. Transcreva e resuma seu conteúdo em português."
        });

        const contentParts = [
            {
                inlineData: {
                    mimeType: audioData.mimetype,
                    data: base64AudioFile
                }
            },
            { text: `Transcreva o áudio com ID ${audioHash} e resuma seu conteúdo em português. Ignore qualquer contexto anterior.` }
        ];

        const result = await modelWithInstructions.generateContent(contentParts);
        const response = result.response.text();

        await sendMessage(msg, response);
        await updateMessageHistory(chatId, msg.author || msg.from, `[Áudio ${audioHash}]`, false);
        await updateMessageHistory(chatId, userConfig.botName, response, true);

        logger.info(`Áudio processado com sucesso: ${audioHash}`);

    } catch (error) {
        logger.error(`Erro ao processar mensagem de áudio: ${error.message}`, { error });
        await msg.reply('Desculpe, ocorreu um erro ao processar o áudio. Por favor, tente novamente.');
    }
}

async function handleImageMessage(msg, imageData, chatId) {
    try {
        const config = await getConfig(chatId);
        if (!config.mediaImage) {
            logger.info(`Descrição de imagem desabilitada para o chat ${chatId}. Ignorando mensagem de imagem.`);
            return;
        }

        let userPrompt = "Descreva esta imagem em detalhes, focando apenas no que você vê com certeza. Se não tiver certeza sobre algo, não mencione.";
        if (msg.body && msg.body.trim() !== '') {
            userPrompt = msg.body.trim();
        }

        const imagePart = {
            inlineData: {
                data: imageData.data.toString('base64'),
                mimeType: imageData.mimetype
            }
        };

        const userConfig = await getConfig(chatId);
        const history = await getMessageHistory(chatId, 5);
        const historyPrompt = history.join('\n');

        const modelWithInstructions = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0.5,
                topK: userConfig.topK,
                topP: userConfig.topP,
                maxOutputTokens: userConfig.maxOutputTokens,
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ],
            systemInstruction: userConfig.systemInstructions + "\nFoque apenas na imagem mais recente. Descreva apenas o que você vê com certeza. Evite fazer suposições ou inferências além do que é claramente visível na imagem."
        });

        const contentParts = [
            imagePart,
            { text: `Contexto recente da conversa:\n${historyPrompt}\n\nAgora, considerando apenas a imagem fornecida e ignorando qualquer contexto anterior que não seja diretamente relevante, ${userPrompt}\n\nLembre-se: Descreva apenas o que você vê com certeza na imagem. Se não tiver certeza sobre algo, não mencione.` }
        ];

        const result = await modelWithInstructions.generateContent(contentParts);
        const response = await result.response.text();
        await sendMessage(msg, response);

        await updateMessageHistory(chatId, msg.author || msg.from, `[Imagem] ${userPrompt}`, false);
        await updateMessageHistory(chatId, userConfig.botName, response, true);

    } catch (error) {
        logger.error(`Erro ao processar mensagem de imagem: ${error.message}`, { error });
        await msg.reply('Desculpe, ocorreu um erro ao processar a imagem. Por favor, tente novamente.');
    }
}

async function handleVideoMessage(msg, videoData, chatId) {
    try {
        const config = await getConfig(chatId);
        if (!config.mediaVideo) {
            logger.info(`Descrição de vídeo desabilitada para o chat ${chatId}. Ignorando mensagem de vídeo.`);
            return;
        }

        let userPrompt = "Descreva detalhadamente o conteúdo deste vídeo. Foque em informações visuais, áudio, e contexto geral.";
        if (msg.body && msg.body.trim() !== '') {
            userPrompt = msg.body.trim();
        }

        // Cria um arquivo temporário para o vídeo
        const tempFilename = `video_${Date.now()}.mp4`;
        fs.writeFileSync(tempFilename, Buffer.from(videoData.data, 'base64'));

        const uploadResponse = await fileManager.uploadFile(tempFilename, {
            mimeType: videoData.mimetype,
            displayName: "Vídeo Enviado"
        });

        fs.unlinkSync(tempFilename);

        let file = await fileManager.getFile(uploadResponse.file.name);
        while (file.state === "PROCESSING") {
            logger.info("Processando vídeo, aguardando 10s...");
            await new Promise((resolve) => setTimeout(resolve, 10000));
            file = await fileManager.getFile(uploadResponse.file.name);
        }

        if (file.state === "FAILED") {
            await msg.reply("Desculpe, ocorreu um erro ao processar o vídeo.");
            return;
        }

        const userConfig = await getConfig(chatId);

        const contentParts = [
            {
              fileData: {
                mimeType: file.mimeType,
                fileUri: file.uri
              }
            },
            {
              text: userConfig.systemInstructions 
                    + "\nFoque apenas neste vídeo. Descreva seu conteúdo de forma clara e detalhada.\n"
                    + userPrompt
            }
        ];

        const result = await model.generateContent(contentParts);
        let response = result.response.text();
        if (!response || typeof response !== 'string' || response.trim() === '') {
            response = "Não consegui gerar uma descrição para este vídeo.";
        }

        await sendMessage(msg, response);
        await updateMessageHistory(chatId, msg.author || msg.from, `[Vídeo] ${userPrompt}`, false);
        await updateMessageHistory(chatId, userConfig.botName, response, true);

        logger.info("Vídeo processado com sucesso!");
    } catch (error) {
        logger.error(`Erro ao processar mensagem de vídeo: ${error.message}`, { error });
        await msg.reply('Desculpe, ocorreu um erro ao processar o vídeo. Por favor, tente novamente.');
    }
}

async function generateResponseWithText(userPrompt, chatId) {
    try {
      const userConfig = await getConfig(chatId);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: {
          temperature: userConfig.temperature,
          topK: userConfig.topK,
          topP: userConfig.topP,
          maxOutputTokens: userConfig.maxOutputTokens,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        systemInstruction: userConfig.systemInstructions
      });
      
      const result = await model.generateContent(userPrompt);
      let responseText = result.response.text();
  
      if (!responseText) {
        throw new Error('Resposta vazia gerada pelo modelo');
      }
  
      responseText = removeEmojis(responseText);
  
      return responseText;
    } catch (error) {
      console.error(`Erro ao gerar resposta de texto: ${error.message}`);
      return "Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente ou reformule sua pergunta.";
    }
}

function getMessageHistory(chatId, limit = MAX_HISTORY) {
    return new Promise((resolve, reject) => {
        messagesDb.find({ chatId: chatId, type: { $in: ['user', 'bot'] } })
            .sort({ timestamp: -1 })
            .limit(limit * 2)
            .exec((err, docs) => {
                if (err) reject(err);
                else resolve(docs.reverse().map(doc => `${doc.sender}: ${doc.content}`));
            });
    });
}

async function loadConfigOnStartup() {
    return new Promise((resolve, reject) => {
        configDb.find({}, async (err, docs) => {
            if (err) {
                reject(err);
            } else {
                for (const doc of docs) {
                    const chatId = doc.chatId;
                    const config = await getConfig(chatId);
                    logger.info(`Configurações carregadas para o chat ${chatId}`);
                }
                resolve();
            }
        });
    });
}

async function listGroupUsers(msg) {
    const chat = await msg.getChat();
    if (chat.isGroup) {
        const group = await getOrCreateGroup(chat);

        const participants = await chat.participants;
        const userList = await Promise.all(participants.map(async (p) => {
            const user = await getOrCreateUser(p.id._serialized, chat);
            return `${user.name} (${p.id.user})`;
        }));
        await msg.reply(`Usuários no grupo "${group.title}":\n${userList.join('\n')}`);
    } else {
        await msg.reply('Este comando só funciona em grupos.');
    }
}

async function initializeBot() {
    try {
        await loadConfigOnStartup();
        logger.info('Todas as configurações foram carregadas com sucesso');
    } catch (error) {
        logger.error('Erro ao carregar configurações:', error);
    }
}

function updateMessageHistory(chatId, senderName, message, isBot = false) {
    return new Promise((resolve, reject) => {
        messagesDb.insert({
            chatId,
            sender: senderName,
            content: message,
            timestamp: Date.now(),
            type: isBot ? 'bot' : 'user'
        }, (err) => {
            if (err) reject(err);
            else {
                messagesDb.find({ chatId: chatId, type: { $in: ['user', 'bot'] } })
                    .sort({ timestamp: -1 })
                    .skip(MAX_HISTORY * 2)
                    .exec((err, docsToRemove) => {
                        if (err) reject(err);
                        else {
                            messagesDb.remove({ _id: { $in: docsToRemove.map(doc => doc._id) } }, { multi: true }, (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        }
                    });
            }
        });
    });
}

function resetHistory(chatId) {
    return new Promise((resolve, reject) => {
        messagesDb.remove({ chatId: chatId, type: { $in: ['user', 'bot'] } }, { multi: true }, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function handlePromptCommand(msg, args, chatId) {
    const [subcommand, name, ...rest] = args;

    switch (subcommand) {
        case 'set':
            if (name && rest.length > 0) {
                const promptText = rest.join(' ');
                await setSystemPrompt(chatId, name, promptText);
                await msg.reply(`System Instruction "${name}" definida com sucesso. O histórico do chat foi limpo.`);
            } else {
                await msg.reply('Uso correto: !prompt set <nome> <texto>');
            }
            break;
        case 'get':
            if (name) {
                const prompt = await getSystemPrompt(chatId, name);
                if (prompt) {
                    await msg.reply(`System Instruction "${name}":\n${prompt.text}`);
                } else {
                    await msg.reply(`System Instruction "${name}" não encontrada.`);
                }
            } else {
                await msg.reply('Uso correto: !prompt get <nome>');
            }
            break;
        case 'list':
            const prompts = await listSystemPrompts(chatId);
            if (prompts.length > 0) {
                const promptList = prompts.map(p => p.name).join(', ');
                await msg.reply(`System Instructions disponíveis: ${promptList}`);
            } else {
                await msg.reply('Nenhuma System Instruction definida.');
            }
            break;
        case 'use':
            if (name) {
                const prompt = await getSystemPrompt(chatId, name);
                if (prompt) {
                    await setActiveSystemPrompt(chatId, name);
                    await msg.reply(`System Instruction "${name}" ativada para este chat.`);
                } else {
                    await msg.reply(`System Instruction "${name}" não encontrada.`);
                }
            } else {
                await msg.reply('Uso correto: !prompt use <nome>');
            }
            break;
        case 'clear':
            await clearActiveSystemPrompt(chatId);
            await msg.reply('System Instruction removida. Usando o modelo padrão.');
            break;
        default:
            await msg.reply('Subcomando de prompt desconhecido. Use !help para ver os comandos disponíveis.');
    }
}

async function handleConfigCommand(msg, args, chatId) {
    const [subcommand, param, value] = args;

    switch (subcommand) {
        case 'set':
            if (param && value) {
                if (['temperature', 'topK', 'topP', 'maxOutputTokens', 'mediaImage', 'mediaAudio', 'mediaVideo'].includes(param)) {
                    const numValue = (param.startsWith('media')) ? (value === 'true') : parseFloat(value);
                    if (!isNaN(numValue) || typeof numValue === 'boolean') {
                        await setConfig(chatId, param, numValue);
                        await msg.reply(`Parâmetro ${param} definido como ${numValue}`);
                    } else {
                        await msg.reply(`Valor inválido para ${param}. Use um número ou "true"/"false" se for mídia.`);
                    }
                } else {
                    await msg.reply(`Parâmetro desconhecido: ${param}`);
                }
            } else {
                await msg.reply('Uso correto: !config set <param> <valor>');
            }
            break;
        case 'get':
            const config = await getConfig(chatId);
            if (param) {
                if (config.hasOwnProperty(param)) {
                    await msg.reply(`${param}: ${config[param]}`);
                } else {
                    await msg.reply(`Parâmetro desconhecido: ${param}`);
                }
            } else {
                const configString = Object.entries(config)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join('\n');
                await msg.reply(`Configuração atual:\n${configString}`);
            }
            break;
        default:
            await msg.reply('Subcomando de config desconhecido. Use !help para ver os comandos disponíveis.');
    }
}

function setSystemPrompt(chatId, name, text) {
    return new Promise((resolve, reject) => {
        const formattedText = `Seu nome é ${name}. ${text}`;
        promptsDb.update({ chatId, name }, { chatId, name, text: formattedText }, { upsert: true }, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getSystemPrompt(chatId, name) {
    return new Promise((resolve, reject) => {
        promptsDb.findOne({ chatId, name }, (err, doc) => {
            if (err) reject(err);
            else resolve(doc);
        });
    });
}

function listSystemPrompts(chatId) {
    return new Promise((resolve, reject) => {
        promptsDb.find({ chatId }, (err, docs) => {
            if (err) reject(err);
            else resolve(docs);
        });
    });
}

async function setActiveSystemPrompt(chatId, promptName) {
    try {
        const prompt = await getSystemPrompt(chatId, promptName);
        if (prompt) {
            await setConfig(chatId, 'activePrompt', promptName);
            logger.debug(`Active prompt set for chat ${chatId}: ${promptName}`);
            return true;
        }
        return false;
    } catch (error) {
        logger.error(`Erro ao definir System Instruction ativa: ${error.message}`, { error });
        return false;
    }
}

async function clearActiveSystemPrompt(chatId) {
    try {
        await setConfig(chatId, 'activePrompt', null);
        return true;
    } catch (error) {
        logger.error(`Erro ao limpar System Instruction ativa: ${error.message}`, { error });
        return false;
    }
}

function setConfig(chatId, param, value) {
    return new Promise((resolve, reject) => {
        configDb.update(
            { chatId },
            { $set: { [param]: value } },
            { upsert: true },
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

async function getConfig(chatId) {
    return new Promise((resolve, reject) => {
        configDb.findOne({ chatId }, async (err, doc) => {
            if (err) {
                reject(err);
            } else {
                const userConfig = doc || {};
                const config = { ...defaultConfig, ...userConfig };

                if (config.activePrompt) {
                    const activePrompt = await getSystemPrompt(chatId, config.activePrompt);
                    if (activePrompt) {
                        config.systemInstructions = activePrompt.text;
                        const match = config.systemInstructions.match(/^Seu nome é (\w+)\./);
                        config.botName = match ? match[1] : (process.env.BOT_NAME || 'Amelie');
                    }
                } else {
                    config.botName = process.env.BOT_NAME || 'Amelie';
                }

                if (config.systemInstructions && typeof config.systemInstructions !== 'string') {
                    config.systemInstructions = String(config.systemInstructions);
                }

                resolve(config);
            }
        });
    });
}

async function sendMessage(msg, text) {
    try {
        if (!text || typeof text !== 'string' || text.trim() === '') {
            logger.error('Tentativa de enviar mensagem inválida:', { text });
            text = "Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente.";
        }

        let trimmedText = text.trim();
        trimmedText = trimmedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');

        logger.debug('Enviando mensagem:', { text: trimmedText });
        await msg.reply(trimmedText);
        logger.info(`Mensagem enviada: ${ trimmedText }`);
    } catch (error) {
        logger.error('Erro ao enviar mensagem:', { 
            error: error.message,
            stack: error.stack,
            text: text
        });
        await msg.reply(
            'Desculpe, ocorreu um erro ao enviar a resposta. Por favor, tente novamente.');
    }
}

client.initialize();

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`, { error });
    process.exit(1);
});

module.exports = {
    getOrCreateUser,
    updateMessageHistory,
    getMessageHistory,
    resetHistory,
    setSystemPrompt,
    getSystemPrompt,
    listSystemPrompts,
    setActiveSystemPrompt,
    clearActiveSystemPrompt,
    setConfig,
    getConfig,
    generateResponseWithText,
    handleTextMessage,
    handleImageMessage,
    handleAudioMessage,
};
