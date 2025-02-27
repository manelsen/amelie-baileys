# Amélie: Assistente de IA Multimídia para WhatsApp

Seja bem-vindo(a) ao repositório da **Amélie**, sua ajudante de Inteligência Artificial super amigável e integrada ao WhatsApp! Este projeto foi idealizado por [Belle Utsch](https://beacons.ai/belleutsch), com o objetivo de oferecer uma experiência inclusiva, interativa e versátil para quem deseja automatizar tarefas e responder mensagens usando **Google Generative AI**.

## Sobre o Projeto

- **Amélie** utiliza a biblioteca [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) para se comunicar com o WhatsApp.
- Integra o modelo Gemini do **Google Generative AI** para gerar textos e transcrições, descrever imagens e muito mais.
- Permite gerenciar prompts personalizados (personalidades/configurações de System Instructions) e ativá-los no chat.
- Oferece recursos de acessibilidade, como **descrição de imagens** e **transcrições de áudio**, úteis em grupos com pessoas cegas ou com baixa visão.

## Recursos Principais

1. **Comandos de Texto**:
   - `!help` para ver todos os comandos.
   - `!reset` para limpar o histórico e restaurar configurações iniciais.
   - `!config` para ajustar parâmetros como temperatura, topK, etc.
   - `!prompt` para criar, listar, ver ou usar diferentes personalidades.
   - `!cego` para ativar descrição automática de imagens e outras configurações acessíveis.
2. **Mídia Inteligente**:
   - Descrição de **imagens** (se habilitada).
   - Transcrição de **áudios** (se habilitada).
   - Suporte a **vídeos**, gerando uma descrição do conteúdo (quando autorizado).
3. **Banco de Dados NeDB**:
   - Armazena histórico de conversas.
   - Mantém configurações por chat.
   - Gerencia personalidades (prompts).
   - Organiza dados de grupos e usuários.
4. **Logs**:
   - Utiliza [winston](https://github.com/winstonjs/winston) para registrar tudo em `console` e em arquivo (`bot.log`).

## Quer usar a Amélie?

Clique [aqui](http://wa.me/5531993340000) para falar com ela no WhatsApp.

## Quer contribuir com o Projeto?

Faça assim:

1. **Clonar este Repositório**:

   ```
   git clone https://github.com/manelsen/amelie
   cd amelie
   ```

2. **Instalar Dependências**:

   ```
   npm install
   ```

3. **Configurar Variáveis de Ambiente**:

   - Crie um arquivo `.env` na raiz do projeto, seguindo o modelo:

     ```
     API_KEY=SuaChaveDoGoogleGenerativeAI
     BOT_NAME=Amélie
     MAX_HISTORY=50
     ```

4. **Executar o Bot**:

   ```
   node amelie.js
   ```

   O terminal exibirá um QR code para ser lido com seu WhatsApp. Depois de escanear, a Amélie começará a ouvir mensagens.

5. **Interagir pelo WhatsApp**:

   - Assim que a Amélie estiver ativa, envie uma mensagem do tipo `!help` no chat para descobrir todos os comandos disponíveis.
   - Para grupos, ela só responde quando mencionada, quando citada em resposta ou quando recebe um comando (`!comando`).

## Comandos Úteis

- `**!help**` Lista os comandos disponíveis e mostra como cada um funciona.

- `**!reset**` Restaura tudo ao padrão e limpa o histórico de mensagens do chat.

- `**!config**`

  ```
  !config set <param> <valor>   // Ex.: !config set temperature 0.8
  !config get [param]           // Ex.: !config get temperature ou !config get (para ver tudo)
  ```

  Ajusta o comportamento do modelo (ex.: temperature) ou habilita/desabilita recursos (ex.: descrição de imagem).

- `**!prompt**`

  ```
  !prompt set <nome> <texto>    // Define uma nova 'personalidade' ou System Instruction
  !prompt get <nome>            // Mostra o texto de uma personalidade
  !prompt list                  // Lista todas as personalidades disponíveis
  !prompt use <nome>            // Ativa uma personalidade existente
  !prompt clear                 // Remove a personalidade ativa e volta ao padrão
  ```

- `**!cego**` Ajusta as configurações para grupos com pessoas cegas, habilitando descrição de imagens e desabilitando transcrições de áudio, além de ativar um prompt específico de audiodescrição.

## Links Importantes

- **Idealizadora**: [Belle Utsch](https://beacons.ai/belleutsch)
- **Repositório Oficial**: [GitHub](https://github.com/manelsen/amelie)
- **whatsapp-web.js**: [Documentação](https://github.com/pedroslopez/whatsapp-web.js)
- **Google Generative AI**: [Site Oficial](https://ai.google/tools)

## Contribuindo

Fique à vontade para abrir *issues*, mandar *pull requests* ou sugestões. A ideia é manter a **Amélie** colaborativa e em constante evolução para atender às mais diversas necessidades de automação e acessibilidade.

## Licença

Este projeto está sob a MIT License. Isso significa que você pode usar, modificar e distribuir este código conforme achar melhor, mas sempre lembre de dar os devidos créditos!

Aproveite a **Amélie** e divirta-se! Se precisar de ajuda ou tiver alguma sugestão, é só chamar. Com amor, *A equipe da Amélie*
