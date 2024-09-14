const listGroupUsers = async (msg) => {
    const chat = await msg.getChat();
    if (chat.isGroup) {
        let text = 'Membros do grupo:\n';
        for (let participant of chat.participants) {
            const contact = await msg.client.getContactById(participant.id._serialized);
            text += `- ${contact.pushname || contact.number}\n`;
        }
        await msg.reply(text);
    } else {
        await msg.reply('Este comando só pode ser usado em grupos.');
    }
};

module.exports = {
    listGroupUsers
};
