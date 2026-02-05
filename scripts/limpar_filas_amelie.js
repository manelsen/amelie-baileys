const Queue = require('bull');

const redisConfig = {
    host: 'localhost',
    port: 6379
};

const filas = [
    'midia-upload-imagem',
    'midia-analise-imagem',
    'midia-principal-imagem',
    'midia-upload-video',
    'midia-processamento-video',
    'midia-analise-video',
    'midia-principal-video',
    'midia-problemas'
];

async function limpar() {
    console.log('--- LIMPANDO FILAS AMÉLIE ---');
    for (const nome of filas) {
        const fila = new Queue(nome, { redis: redisConfig });
        console.log(`Limpando ${nome}...`);
        await fila.empty();
        await fila.clean(0, 'completed');
        await fila.clean(0, 'failed');
        await fila.clean(0, 'delayed');
        await fila.clean(0, 'active');
        await fila.clean(0, 'wait');
        await fila.close();
    }
    console.log('--- CONCLUÍDO ---');
}

limpar();
