// utilities/config.js

const dotenv = require('dotenv');
dotenv.config();

// Configuration variables
const API_KEY = process.env.API_KEY;
const MAX_HISTORY = parseInt(process.env.MAX_HISTORY || '500');
const BOT_NAME = process.env.BOT_NAME || 'Amelie';

const defaultConfig = {
  temperature: 0.9,
  topK: 93,
  topP: 0.95,
  maxOutputTokens: 1024,
  mediaImage: true,  // Enables image descriptions by default
  mediaAudio: true,  // Enables audio transcription by default
};

module.exports = {
  API_KEY,
  MAX_HISTORY,
  BOT_NAME,
  defaultConfig,
};
