const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const dotenv = require('dotenv');
const winston = require('winston');
const Datastore = require('nedb');

dotenv.config();

// Configuração de variáveis de ambiente
const API_KEY = process.env.API_KEY;
const MAX_HISTORY = parseInt(process.env.MAX_HISTORY || '500');
let bot_name = process.env.BOT_NAME || 'Amelie';

// Configuração do logger
const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...rest }) => {
            const extraData = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${extraData}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot.log' })
    ]
});

// Configuração do NeDB
const messagesDb = new Datastore({ filename: './db/messages.db', autoload: true });
const promptsDb = new Datastore({ filename: './db/prompts.db', autoload: true });
const configDb = new Datastore({ filename: './db/config.db', autoload: true });
const usersDb = new Datastore({ filename: './db/users.db', autoload: true });

// Inicialização do GoogleGenerativeAI
const genAI = new GoogleGenerativeAI(API_KEY);

// Inicialização do modelo Gemini
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
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
};

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

        logger.info(`Mensagem recebida: User (identificado no Whatsapp como ${msg.author} ou ${msg.from}) -> ${msg.body}`);

        const chatId = chat.id._serialized;

        if (chat.isGroup) {
            const shouldRespond = await shouldRespondInGroup(msg, chat);
            if (!shouldRespond && !msg.hasMedia) return;
        }

        if (msg.body.startsWith('!')) {
            logger.info(`Comando detectado: ${msg.body}`);
            await handleCommand(msg, chatId);
        } else     if (msg.hasMedia) {
            const attachmentData = await msg.downloadMedia();
            if (attachmentData.mimetype === 'audio/ogg; codecs=opus' || 
                attachmentData.mimetype.startsWith('audio/')) {
                await handleAudioMessage(msg, attachmentData, chatId);
            } else if (attachmentData.mimetype.startsWith('image/')) {
                await handleImageMessage(msg, attachmentData, chatId);
            } else {
                await msg.reply('Desculpe, no momento só posso processar áudios e imagens.');
            }
        } else {
            await handleTextMessage(msg);
        }

        resetSessionAfterInactivity(chatId);
    } catch (error) {
        logger.error(`Erro ao processar mensagem: ${error.message}`, { error });
        await msg.reply('Desculpe, ocorreu um erro inesperado. Por favor, tente novamente mais tarde.');
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
            const averageLength = messages.length > 0 ? Math.round(totalLength / messages.length) : 100; // Default to 100 if no messages
            resolve(averageLength);
          }
        });
    });
  }

async function shouldRespondInGroup(msg, chat) {
    const mentions = await msg.getMentions();
    const isBotMentioned = mentions.some(mention => mention.id._serialized === client.info.wid._serialized);

    let isReplyToBot = false;
    if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        isReplyToBot = quotedMsg.fromMe;
    }

    const isBotNameMentioned = msg.body.toLowerCase().includes(bot_name.toLowerCase());

    return isBotMentioned || isReplyToBot || isBotNameMentioned;
}

async function handleCommand(msg, chatId) {
    const [command, ...args] = msg.body.slice(1).split(' ');
    logger.info(`Comando: ${command}, Argumentos: ${args}`);

    try {
        switch (command.toLowerCase()) {
            case 'reset':
                await resetHistory(chatId);
                await msg.reply('🤖 Histórico resetado para este chat');
                break;
            case 'help':
                await msg.reply(
`Comandos disponíveis:\n 
!reset - Limpa o histórico de conversa\n 
!prompt set <nome> <texto> - Define uma nova System Instruction\n 
!prompt get <nome> - Mostra uma System Instruction existente\n 
!prompt list - Lista todas as System Instructions\n 
!prompt use <nome> - Usa uma System Instruction específica\n 
!prompt clear - Remove a System Instruction ativa\n 
!config set <param> <valor> - Define um parâmetro de configuração\n 
!config get [param] - Mostra a configuração atual\n 
!users - Lista os usuários do grupo\n 
!cego - Aplica configurações para usuários com deficiência visual\n 
!help - Mostra esta mensagem de ajuda`
                );
                break;
            case 'prompt':
                await handlePromptCommand(msg, args, chatId);
                break;
            case 'config':
                await handleConfigCommand(msg, args, chatId);
                break;
            case 'users':
                await listGroupUsers(msg);
                break;
            case 'cego':
                await handleCegoCommand(msg, chatId);
                break;
            default:
                await msg.reply('Comando desconhecido. Use !help para ver os comandos disponíveis.');
        }
    } catch (error) {
        logger.error(`Erro ao executar comando: ${error.message}`, { error });
        await msg.reply('Desculpe, ocorreu um erro ao executar o comando. Por favor, tente novamente.');
    }
}

function removeEmojis(text) {
    // Esta regex abrange uma ampla gama de emojis, incluindo sequências de emojis compostos
    return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F0FF}\u{1F100}-\u{1F2FF}]/gu, '');
}

async function handleCegoCommand(msg, chatId) {
    try {
        // Habilitar descrição de imagens
        await setConfig(chatId, 'mediaImage', true);

        // Desabilitar transcrição de áudio
        await setConfig(chatId, 'mediaAudio', false);

        // Definir e ativar o prompt Audiomar
        const audiomarPrompt = `Você é um chatbot especializado em audiodescrição, projetado para funcionar em um grupo de WhatsApp com mais de 200 pessoas cegas. Sua função principal é descrever imagens e stickers compartilhados no grupo, fornecendo duas descrições distintas para cada imagem: Uma descrição profissional e detalhada Uma interpretação amigável e alegre Diretrizes Gerais: Responda imediatamente quando uma imagem ou sticker for compartilhado no grupo. Mantenha suas respostas concisas, mas informativas. Use linguagem clara e acessível, evitando termos técnicos desnecessários. Seja respeitoso e inclusivo em todas as suas interações. Estrutura da Resposta: Para cada imagem ou sticker, sua resposta deve seguir este formato: [Audiodescrição] (Forneça uma descrição objetiva e detalhada da imagem) [Interpretação] (Ofereça uma interpretação mais leve e divertida do conteúdo) Diretrizes para a Descrição Profissional: Comece com uma visão geral da imagem. Descreva os elementos principais, da esquerda para a direita e de cima para baixo. Mencione cores, formas, expressões e posições relevantes. Inclua detalhes importantes, como texto visível ou logotipos. Seja objetivo e evite interpretações pessoais. Diretrizes para a Interpretação Amigável: Use um tom leve e alegre. Interprete o humor ou a emoção transmitida pela imagem. Faça conexões com experiências cotidianas ou sentimentos comuns. Use linguagem mais coloquial e expressiva. Se apropriado, inclua uma pitada de humor leve.`;

        await setSystemPrompt(chatId, 'Audiomar', audiomarPrompt);
        await setActiveSystemPrompt(chatId, 'Audiomar');

        // Confirmar as alterações para o usuário
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
  
      await updateMessageHistory(chatId, user.name, msg.body);
  
      const history = await getMessageHistory(chatId);
      const userPromptText = `Histórico de chat: (formato: nome do usuário e em seguida mensagem; responda à última mensagem)\n\n${history.join('\n')}`;
  
      console.log(`Gerando resposta para: ${userPromptText}`);
      const response = await generateResponseWithText(userPromptText, chatId);
      console.log(`Resposta gerada (sem emojis): ${response}`);
  
      await updateMessageHistory(chatId, chatConfig.botName, response, true);
      await sendLongMessage(msg, response);
    } catch (error) {
      console.error(`Erro ao processar mensagem de texto: ${error.message}`);
      await msg.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.');
    }
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
                    let contact;
                    if (chat.isGroup) {
                        const participants = await chat.participants;
                        contact = participants.find(p => p.id._serialized === sender);
                    } else {
                        contact = await chat.getContact();
                    }
                    
                    const newUser = {
                        id: sender,
                        name: contact.pushname || contact.name || `User${sender.substring(0, 12)}`,
                        joinedAt: new Date()
                    };
                    
                    usersDb.insert(newUser, (err, doc) => {
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

async function handleAudioMessage(msg, audioData, chatId) {
    try {
        // Verifica se o áudio é menor ou igual a 20MB
        const audioSizeInMB = audioData.data.length / (1024 * 1024);
        if (audioSizeInMB > 20) {
            await msg.reply('Desculpe, só posso processar áudios de até 20MB.');
            return;
        }

        const isPTT = audioData.mimetype === 'audio/ogg; codecs=opus';
        
        logger.info(`Processando arquivo de áudio: ${isPTT ? 'PTT' : 'Áudio regular'}`);

        // Converte o buffer de áudio para base64
        const base64AudioFile = audioData.data.toString('base64');

        // Obtém a configuração do usuário, incluindo as system instructions
        const userConfig = await getConfig(chatId);

        // Cria uma instância do modelo com as system instructions
        const modelWithInstructions = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
                temperature: userConfig.temperature,
                topK: userConfig.topK,
                topP: userConfig.topP,
                maxOutputTokens: userConfig.maxOutputTokens,
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ],
            systemInstruction: userConfig.systemInstructions
        });

        // Obtém o histórico de mensagens
        const history = await getMessageHistory(chatId);
        const historyPrompt = history.join('\n');

        // Prepara o conteúdo para geração
        const contentParts = [
            {
                inlineData: {
                    mimeType: audioData.mimetype,
                    data: base64AudioFile
                }
            },
            { text: `Histórico da conversa:\n${historyPrompt}\n\nAgora, considerando este histórico e o áudio fornecido, por favor, transcreva o áudio e depois resuma o conteúdo em português.` }
        ];

        // Gera o conteúdo usando o modelo
        const result = await modelWithInstructions.generateContent(contentParts);
        const response = await result.response.text();

        await sendLongMessage(msg, response);

        // Atualizar o histórico de mensagens
        await updateMessageHistory(chatId, msg.author || msg.from, '[Áudio]', false);
        await updateMessageHistory(chatId, userConfig.botName, response, true);

    } catch (error) {
        logger.error(`Erro ao processar mensagem de áudio: ${error.message}`, { error });
        await msg.reply('Desculpe, ocorreu um erro ao processar o áudio. Por favor, tente novamente.');
    }
}

async function handleImageMessage(msg, imageData, chatId) {
    try {
        let userPrompt = "Descreva esta imagem em detalhes, focando apenas no que você vê com certeza. Se não tiver certeza sobre algo, não mencione.";
        
        // Verifica se há uma mensagem de texto junto com a imagem
        if (msg.body && msg.body.trim() !== '') {
            userPrompt = msg.body.trim();
        }

        const imagePart = {
            inlineData: {
                data: imageData.data.toString('base64'),
                mimeType: imageData.mimetype
            }
        };

        // Obtém a configuração do usuário, incluindo as system instructions
        const userConfig = await getConfig(chatId);

        // Obtém o histórico de mensagens, mas limita a um número menor de mensagens recentes
        const history = await getMessageHistory(chatId, 5); // Limita a 5 mensagens recentes
        const historyPrompt = history.join('\n');

        // Cria uma instância do modelo com as system instructions e temperatura específica para imagens
        const modelWithInstructions = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
                temperature: 0.2, // Temperatura específica para interpretação de imagens
                topK: userConfig.topK,
                topP: userConfig.topP,
                maxOutputTokens: userConfig.maxOutputTokens,
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ],
            systemInstruction: userConfig.systemInstructions + "\nFoque apenas na imagem mais recente. Descreva apenas o que você vê com certeza. Evite fazer suposições ou inferências além do que é claramente visível na imagem."
        });

        // Prepara o conteúdo para geração, incluindo o histórico e prompt do usuário
        const contentParts = [
            imagePart,
            { text: `Contexto recente da conversa:\n${historyPrompt}\n\nAgora, considerando apenas a imagem fornecida e ignorando qualquer contexto anterior que não seja diretamente relevante, ${userPrompt}\n\nLembre-se: Descreva apenas o que você vê com certeza na imagem. Se não tiver certeza sobre algo, não mencione.` }
        ];

        const result = await modelWithInstructions.generateContent(contentParts);

        const response = await result.response.text();
        await sendLongMessage(msg, response);

        // Atualizar o histórico de mensagens
        await updateMessageHistory(chatId, msg.author || msg.from, `[Imagem] ${userPrompt}`, false);
        await updateMessageHistory(chatId, userConfig.botName, response, true);

    } catch (error) {
        logger.error(`Erro ao processar mensagem de imagem: ${error.message}`, { error });
        await msg.reply('Desculpe, ocorreu um erro ao processar a imagem. Por favor, tente novamente.');
    }
}

async function generateResponseWithText(userPrompt, chatId) {
    try {
      const userConfig = await getConfig(chatId);
      const averageLength = await calculateAverageMessageLength(chatId);
      
      const minLength = Math.round(averageLength * 0.8);
      const maxLength = Math.round(averageLength * 1.2);
      
      const systemInstructionWithLength = `${userConfig.systemInstructions}
  Por favor, mantenha sua resposta entre ${minLength} e ${maxLength} caracteres. 
  Se você não puder responder completamente dentro deste limite, forneça a informação mais importante e sugira que o usuário peça mais detalhes se necessário.
  Não use emojis ou emoticons em suas respostas.`;
  
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: userConfig.temperature,
          topK: userConfig.topK,
          topP: userConfig.topP,
          maxOutputTokens: userConfig.maxOutputTokens,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        systemInstruction: systemInstructionWithLength
      });
      
      const result = await model.generateContent(userPrompt);
      let responseText = result.response.text();
  
      if (!responseText) {
        throw new Error('Resposta vazia gerada pelo modelo');
      }
  
      // Remover emojis da resposta
      responseText = removeEmojis(responseText);
  
      // Logging para fins de depuração
      console.log(`Tamanho médio das mensagens: ${averageLength}`);
      console.log(`Tamanho da resposta gerada (após remoção de emojis): ${responseText.length}`);
  
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
        const participants = await chat.participants;
        const userList = await Promise.all(participants.map(async (p) => {
            const user = await getOrCreateUser(p.id._serialized, chat);
            return `${user.name} (${p.id.user})`;
        }));
        await msg.reply(`Usuários no grupo:\n${userList.join('\n')}`);
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

function updateMessageHistory(chatId, sender, message, isBot = false) {
    return new Promise((resolve, reject) => {
        messagesDb.insert({
            chatId,
            sender,
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
                //await clearChatOnInstructionChange(chatId);
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
                if (['temperature', 'topK', 'topP', 'maxOutputTokens'].includes(param)) {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        await setConfig(chatId, param, numValue);
                        await msg.reply(`Parâmetro ${param} definido como ${numValue}`);
                    } else {
                        await msg.reply(`Valor inválido para ${param}. Use um número.`);
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

// Modifique a função setSystemPrompt
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
            // Remova a atribuição global de bot_name
            // bot_name = promptName
            logger.debug(`Active prompt set for chat ${chatId}: ${promptName}`);
            return true;
        }
        return false;
    } catch (error) {
        logger.error(`Erro ao definir System Instruction ativa: ${error.message}`, { error });
        return false;
    }
}

async function clearChatOnInstructionChange(chatId) {
    //try {
    //    await messagesDb.remove({ chatId: chatId }, { multi: true });
    //    logger.info(`Chat limpo para ${chatId} devido à mudança nas instruções do sistema`);
    //} catch (error) {
    //    logger.error(`Erro ao limpar chat para ${chatId}: ${error.message}`);
    //}
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

async function sendLongMessage(msg, text) {
    try {
        if (!text || typeof text !== 'string' || text.trim() === '') {
            logger.error('Tentativa de enviar mensagem inválida:', { text });
            text = "Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente.";
        }

        let trimmedText = text.trim();
        trimmedText = trimmedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');

        logger.debug('Enviando mensagem:', { text: trimmedText });
        await msg.reply(trimmedText);
        logger.info('Mensagem enviada com sucesso');
    } catch (error) {
        logger.error('Erro ao enviar mensagem:', { 
            error: error.message,
            stack: error.stack,
            text: text
        });
        await msg.reply('Desculpe, ocorreu um erro ao enviar a resposta. Por favor, tente novamente.');
    }
}

function resetSessionAfterInactivity(chatId, inactivityPeriod = 3600000) { // 1 hora
    setTimeout(() => {
        logger.info(`Sessão resetada para o chat ${chatId} após inatividade`);
        resetHistory(chatId);
    }, inactivityPeriod);
}

function isSimilar(text1, text2) {
    // Implemente sua lógica de comparação de similaridade aqui
    // Você pode usar algoritmos como Levenshtein distance, cosine similarity, etc.
    return false; // Placeholder
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
    // Adicione outras funções que você quer testar
  };