// services/aiService.js

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { API_KEY } = require('../utilities/config');
const logger = require('../utilities/logger');
const { removeEmojis } = require('../utilities/helpers');
const { getConfig } = require('../data/database');

const genAI = new GoogleGenerativeAI(API_KEY);

async function generateResponseWithText(userPrompt, chatId) {
  try {
    const userConfig = await getConfig(chatId);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: userConfig.temperature,
        topK: userConfig.topK,
        topP: userConfig.topP,
        maxOutputTokens: userConfig.maxOutputTokens,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
      systemInstruction: userConfig.systemInstructions,
    });

    const result = await model.generateContent(userPrompt);
    let responseText = await result.response.text();

    if (!responseText) {
      throw new Error('Resposta vazia gerada pelo modelo');
    }

    responseText = removeEmojis(responseText);

    return responseText;
  } catch (error) {
    logger.error(`Erro ao gerar resposta de texto: ${error.message}`);
    return 'Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente ou reformule sua pergunta.';
  }
}

module.exports = {
  genAI,
  generateResponseWithText,
};
