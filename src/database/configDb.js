const Datastore = require('nedb-promises');

// Carregar os bancos de dados existentes
const configDb = Datastore.create({ filename: '../db/config.db', autoload: true });
const promptsDb = Datastore.create({ filename: '../db/prompts.db', autoload: true });

/**
 * Obtém a configuração para um chat específico.
 * @param {string} chatId - ID do chat.
 * @returns {object} - Configuração do chat.
 */
const getConfig = async (chatId) => {
    const config = await configDb.findOne({ chatId });
    return config || {};
};

/**
 * Atualiza ou define um novo prompt de sistema para um chat específico.
 * @param {string} chatId - ID do chat.
 * @param {string} name - Nome da System Instruction.
 * @param {string} promptText - Texto do prompt de sistema.
 */
const setSystemPrompt = async (chatId, name, promptText) => {
    const existingPrompt = await promptsDb.findOne({ chatId, name });

    if (existingPrompt) {
        // Atualiza o prompt existente
        await promptsDb.update({ _id: existingPrompt._id }, { $set: { text: promptText } });
    } else {
        // Insere um novo prompt
        await promptsDb.insert({ chatId, name, text: promptText });
    }
};

/**
 * Obtém uma System Instruction específica.
 * @param {string} chatId - ID do chat.
 * @param {string} name - Nome da System Instruction.
 * @returns {string|null} - Prompt de sistema ou null se não encontrado.
 */
const getSystemPrompt = async (chatId, name) => {
    const prompt = await promptsDb.findOne({ chatId, name });
    return prompt ? prompt.text : null;
};

/**
 * Lista todas as System Instructions de um chat.
 * @param {string} chatId - ID do chat.
 * @returns {array} - Lista de System Instructions.
 */
const listSystemPrompts = async (chatId) => {
    const prompts = await promptsDb.find({ chatId });
    return prompts.map((prompt) => ({ name: prompt.name, text: prompt.text }));
};

/**
 * Remove uma System Instruction específica.
 * @param {string} chatId - ID do chat.
 * @param {string} name - Nome da System Instruction.
 * @returns {number} - Número de registros removidos.
 */
const removeSystemPrompt = async (chatId, name) => {
    const numRemoved = await promptsDb.remove({ chatId, name }, { multi: false });
    return numRemoved;
};

/**
 * Atualiza uma configuração específica para um chat.
 * @param {string} chatId - ID do chat.
 * @param {string} param - Nome do parâmetro.
 * @param {any} value - Novo valor do parâmetro.
 */
const setConfig = async (chatId, param, value) => {
    const existingConfig = await configDb.findOne({ chatId });

    if (existingConfig) {
        await configDb.update({ chatId }, { $set: { [param]: value } });
    } else {
        // Cria uma nova configuração se não existir
        const newConfig = { chatId, [param]: value };
        await configDb.insert(newConfig);
    }
};

/**
 * Atualiza o nome do bot para um chat específico.
 * @param {string} chatId - ID do chat.
 * @param {string} newName - Novo nome do bot.
 */
const updateConfigName = async (chatId, newName) => {
    await setConfig(chatId, 'botName', newName);
};

/**
 * Habilita ou desabilita o processamento de um tipo específico de mídia.
 * @param {string} chatId - ID do chat.
 * @param {string} type - Tipo de mídia ('audio', 'image', 'document').
 * @param {boolean} disable - Estado para desabilitar (true) ou habilitar (false).
 */
const updateConfigDisableType = async (chatId, type, disable) => {
    const typeMap = {
        audio: 'disableAudio',
        image: 'disableImage',
        document: 'disableDocument',
    };

    const configType = typeMap[type];
    if (!configType) throw new Error('Tipo de mídia inválido.');

    await setConfig(chatId, configType, disable);
};

module.exports = {
    getConfig,
    setSystemPrompt,
    getSystemPrompt,
    listSystemPrompts,
    removeSystemPrompt,
    setConfig,
    updateConfigName,
    updateConfigDisableType,
};
