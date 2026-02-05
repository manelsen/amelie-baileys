const Queue = require('bull');

const redisConfig = {
    host: 'localhost',
    port: 6379
};

const filaImagem = new Queue('fila-imagem-principal', { redis: redisConfig });

console.log('--- TESTE BULL ---');

// Definir processador
filaImagem.process('processar-imagem', async (job) => {
    console.log(`[WORKER] Processando job ${job.id}`);
    console.log('Dados:', job.data);
    return { sucesso: true };
});

// Adicionar job
console.log('Adicionando job...');
filaImagem.add('processar-imagem', { teste: true, timestamp: Date.now() })
    .then(job => {
        console.log(`Job adicionado: ${job.id}`);
    })
    .catch(err => console.error('Erro ao adicionar:', err));

// Monitorar eventos
filaImagem.on('completed', (job, result) => {
    console.log(`Job ${job.id} completado! Resultado:`, result);
    process.exit(0);
});

filaImagem.on('error', (err) => {
    console.error('Erro na fila:', err);
});
