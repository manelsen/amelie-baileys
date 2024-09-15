const { GoogleAIFileManager } = require('@google/generative-ai/server');
const { API_KEY } = require('../config/environment');
const fileManager = new GoogleAIFileManager(API_KEY);

const uploadToFileManager = async (filePath, mimeType) => {
    const uploadedFile = await fileManager.uploadFile({
        filePath: filePath,
        mimeType: mimeType
    });
    return uploadedFile;
};

module.exports = {
    uploadToFileManager
};
