# Relatório de Transição: Migration Amélie-Baileys

## 🟢 O que já foi feito
1. **Ambiente:** Criada a pasta `amelie-baileys` e clonado o código original.
2. **Repositório:** Criado e sincronizado o novo repositório `manelsen/amelie-baileys` no GitHub.
3. **Dependências:** Instaladas as bibliotecas core (`@whiskeysockets/baileys`, `pino`, `qrcode-terminal`, etc.).
4. **Novo Cliente:** Criado e aprimorado `src/adaptadores/whatsapp/ClienteBaileys.js`:
   - Suporte a multi-file auth.
   - Implementação de `deveResponderNoGrupo` usando lógica nativa do Baileys.
   - Integração com `MapperMensagem` para emissão de eventos normalizados.
5. **Mapeamento de Mensagens (`MapperMensagem.js`):**
   - Implementado tradutor robusto de Baileys -> Contrato Amélie.
   - Suporte a `downloadMedia` (usando `downloadMediaMessage` do Baileys).
   - Mock do método `getChat` e propriedades `id._serialized` para compatibilidade.
   - Extração de menções e citações.
6. **Integração no `index.js`:**
   - Trocado `ClienteWhatsApp` por `ClienteBaileys`.
   - Ajustada passagem de cliente (agora passa o wrapper `ClienteBaileys` em vez da propriedade `.cliente` interna).
7. **Limpeza:**
   - Removido `whatsapp-web.js` e `puppeteer` do `package.json`.
   - Removidas chamadas incompatíveis em `GerenciadorNotificacoes.js` (agora usa `enviarMensagem` do wrapper).
8. **Refatoração de Domínio:**
   - `OperacoesChat.js` adaptado via mocks no Mapper, permitindo que a lógica de domínio existente funcione sem alterações drásticas.

## 🛠️ Próximos Passos
1. **Testes de Integração:**
   - Executar o bot (`npm start`) e validar conexão QR Code.
   - Testar envio/recebimento de mensagens (Texto, Imagem, Áudio).
   - Verificar comportamento em grupos (menções, citações).
2. **Validação de Notificações:**
   - Testar se notificações pendentes são entregues corretamente com o novo mecanismo.
3. **Ajuste Fino de Validações:**
   - Observar se `Validadores.js` barra mensagens legítimas devido a diferenças no objeto `_data`.
4. **Deploy:**
   - Preparar Dockerfile para a nova stack (Node puro, sem Chrome/Puppeteer).

## 📝 Notas de Arquitetura
- O `MapperMensagem.js` atua como um Anti-Corruption Layer, protegendo o domínio das mudanças na lib externa.
- O JID do Baileys usa `@s.whatsapp.net`, o que foi tratado no `ClienteBaileys.js`.
