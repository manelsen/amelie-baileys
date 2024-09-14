const sendLongMessage = async (msg, text) => {
    const MAX_MESSAGE_LENGTH = 4096;
    if (text.length <= MAX_MESSAGE_LENGTH) {
        await msg.reply(text);
    } else {
        const parts = splitMessage(text, MAX_MESSAGE_LENGTH);
        for (const part of parts) {
            await msg.reply(part);
        }
    }
};

const splitMessage = (text, maxLength) => {
    const parts = [];
    let remainingText = text;
    while (remainingText.length > maxLength) {
        let sliceIndex = remainingText.lastIndexOf('\n', maxLength);
        if (sliceIndex === -1) sliceIndex = maxLength;
        parts.push(remainingText.slice(0, sliceIndex));
        remainingText = remainingText.slice(sliceIndex);
    }
    parts.push(remainingText);
    return parts;
};

module.exports = {
    sendLongMessage
};
