// utilities/groupUtils.js

const client = require('../services/whatsappService');
const { getConfig } = require('../data/database');

async function shouldRespondInGroup(msg, chat) {
  if (msg.body.startsWith('!')) {
    return true;
  }

  const mentions = await msg.getMentions();
  const isBotMentioned = mentions.some(
    (mention) => mention.id._serialized === client.info.wid._serialized
  );

  let isReplyToBot = false;
  if (msg.hasQuotedMsg) {
    const quotedMsg = await msg.getQuotedMessage();
    isReplyToBot = quotedMsg.fromMe;
  }

  const botName = (await getConfig(chat.id._serialized)).botName;
  const isBotNameMentioned = msg.body
    .toLowerCase()
    .includes(botName.toLowerCase());

  return isBotMentioned || isReplyToBot || isBotNameMentioned;
}

module.exports = {
  shouldRespondInGroup,
};