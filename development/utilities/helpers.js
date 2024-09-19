// utilities/helpers.js

function removeEmojis(text) {
    return text.replace(
      /[\u{1F600}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}]/gu,
      ''
    );
  }
  
  module.exports = {
    removeEmojis,
  };