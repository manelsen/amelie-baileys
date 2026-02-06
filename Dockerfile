# Imagem base leve e estável
FROM node:20-bullseye-slim

# Diretório de trabalho no container
WORKDIR /app

# Instalar dependências de sistema necessárias (se houver)
# Para o Baileys puro, geralmente não precisa de chrome/puppeteer
# Mas instalamos ca-certificates e tzdata para garantir HTTPS e Timezone corretos
RUN apt-get update && apt-get install -y \
    ca-certificates \
    tzdata \
    git \
    && rm -rf /var/lib/apt/lists/*

# Definir Timezone
ENV TZ=America/Sao_Paulo

# Copiar apenas arquivos de dependência primeiro (Cache Layering)
COPY package.json ./

# Instalar dependências (apenas produção)
RUN npm install --omit=dev

# Copiar o restante do código fonte
COPY . .

# Criar diretórios necessários para persistência
RUN mkdir -p db logs temp

# Usuário não-root para segurança
USER node

# Comando de inicialização
CMD ["node", "src/index.js"]
