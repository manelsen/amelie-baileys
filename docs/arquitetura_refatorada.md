# Documentação Técnica: Amélie (Baileys Edition)

**Versão:** 3.0.0 (Refatorada)
**Data:** 06/02/2026

## 1. Visão Geral da Arquitetura

A Amélie utiliza uma **Arquitetura Hexagonal (Ports & Adapters)** combinada com **Railway Oriented Programming (ROP)** para tratamento robusto de erros.

### Princípios Chave
*   **Isolamento:** O núcleo da aplicação (Domínio/Serviços) não conhece os detalhes da infraestrutura externa (WhatsApp/Baileys, Banco de Dados).
*   **Adaptadores:** A comunicação com o mundo externo é feita através de adaptadores plugáveis.
*   **Fluxo Ferroviário (Railway):** Erros não lançam exceções descontroladas; eles retornam um objeto `Resultado` (Sucesso ou Falha) que trafega pelos trilhos da aplicação até ser tratado.

## 2. Estrutura de Diretórios

```
src/
├── adaptadores/           # A Camada de Infraestrutura (O mundo externo)
│   ├── whatsapp/          # Adaptador para Baileys
│   │   ├── comandos/      # Implementação do Command Pattern (Ações do usuário)
│   │   ├── processadores/ # Pipelines de processamento de mídia (Áudio, Vídeo, Doc)
│   │   └── util/          # Utilitários específicos do canal
│   ├── ai/                # Adaptador para Gemini/Google AI
│   ├── queue/             # Gerenciamento de filas (Better-Queue)
│   └── transacoes/        # Persistência e auditoria de operações
├── servicos/              # A Camada de Aplicação (Regras de negócio e orquestração)
│   ├── mensagens/         # Submódulos de envio e reconstrução de contexto
│   │   ├── EstrategiasEnvio.js
│   │   └── ServicoSnapshot.js
│   ├── ServicoMensagem.js # Orquestrador central de comunicação
│   └── ServicoLimpeza.js  # Manutenção automática
├── utilitarios/           # Ferramentas transversais
│   ├── Ferrovia.js        # Implementação do padrão Result/Railway
│   └── ArquivoUtils.js    # Manipulação segura de arquivos
└── index.js               # O Ponto de Entrada (Injeção de Dependências)
```

## 3. Fluxo de Processamento de Mensagem

1.  **Entrada:** O `ClienteBaileys` recebe um evento do socket.
2.  **Mapeamento:** O `MapperMensagem` normaliza o objeto cru do Baileys para o formato interno da Amélie (abstração de domínio).
3.  **Roteamento:** O `GerenciadorMensagens` recebe a mensagem normalizada e decide o destino:
    *   É um comando explícito (ex: `.reset`)? -> `ProcessadorComandos`
    *   É mídia (áudio, imagem)? -> `FilasProcessadoresMidia` (Assíncrono)
    *   É texto conversacional? -> `ProcessadorTexto` (IA)
4.  **Processamento:** O processador específico executa a lógica (chama IA, converte arquivos, etc.).
5.  **Resposta:** O resultado é passado para o `ServicoMensagem`.

## 4. O Padrão Railway (Ferrovia.js)

Toda operação crítica retorna um objeto `Resultado`:

```javascript
const Resultado = {
  sucesso: true, // ou false
  dados: { ... }, // Se sucesso
  erro: Error(...) // Se falha
}
```

Isso permite encadear operações sem `try/catch` aninhados (callback hell), usando funções como `.mapear()` ou `.dobrar()`.

## 5. Serviço de Mensagem Refatorado

O antigo monolito `ServicoMensagem.js` foi dividido em três responsabilidades:

1.  **Orquestrador (`ServicoMensagem.js`):** Recebe o pedido de envio, valida o texto, gerencia transações (auditoria) e escolhe a estratégia. Se falhar, aciona o fallback.
2.  **Estratégias de Envio (`mensagens/EstrategiasEnvio.js`):** Contém a lógica "suja" de como falar com o Baileys:
    *   `envioBaileysNativo`: Usa o socket para enviar com citação (reply) real.
    *   `envioDireto`: Envia sem citação (broadcast).
    *   `envioComContextoManual`: Reconstrói o contexto no corpo da mensagem (fallback visual).
3.  **Snapshot (`mensagens/ServicoSnapshot.js`):** Captura o estado de uma mensagem (quem falou, o que era, legenda) para que, se precisarmos responder horas depois (via fila) ou após um erro, tenhamos o contexto preservado para reconstrução manual.

## 6. Sistema de Transações e Filas

Para evitar bloqueios e perda de mensagens em operações longas (ex: processar PDF de 50 páginas):

1.  Uma **Transação** é criada no banco de dados (`GerenciadorTransacoes`).
2.  O job entra na fila (`better-queue`).
3.  Se o bot reiniciar, a transação persiste como "pendente".
4.  Ao finalizar, o `OrquestradorMidia` usa o ID da transação para responder.
5.  Se o envio falhar (ex: erro de rede), a resposta é salva como **Notificação Pendente** (JSON em disco) e tentada novamente pelo cron interno.

---

## Guia de Manutenção Rápida

*   **Para adicionar um novo comando:** Crie um arquivo em `src/adaptadores/whatsapp/comandos/implementacoes/` e registre em `RegistroComandos.js`.
*   **Para mudar o modelo de IA:** Edite `src/config/ConfigManager.js` ou as variáveis de ambiente.
*   **Para ajustar timeouts:** Verifique `src/adaptadores/queue/FilasConfiguracao.js`.
