require('dotenv').config();

const API_KEY = process.env.API_KEY || '';
const MAX_HISTORY = parseInt(process.env.MAX_HISTORY || '1000');
const BOT_NAME = process.env.BOT_NAME || 'Amelie';

module.exports = {
    API_KEY,
    MAX_HISTORY,
    BOT_NAME
};
