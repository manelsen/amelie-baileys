# Arquitetura do Amélie-Baileys

Este documento descreve a arquitetura interna do projeto `amelie-baileys/src`, focando nos padrões de design adotados para garantir robustez, escalabilidade e facilidade de manutenção.

## 1. O Padrão Railway (Ferrovia.js)

O sistema utiliza o padrão **Railway Oriented Programming (ROP)**, implementado através do módulo `Ferrovia.js`. 

### Por que Railway?
Diferente do tratamento de erros tradicional baseado em blocos `try/catch` espalhados, o ROP trata o fluxo de dados como uma linha ferroviária com dois trilhos:
- **Trilho do Sucesso (Success Track):** Onde os dados fluem quando tudo ocorre conforme o esperado.
- **Trilho da Falha (Failure Track):** Para onde o fluxo é desviado assim que ocorre um erro ou validação negativa.

### Implementação: `Resultado` e `Trilho`
A base da arquitetura é o objeto `Resultado`, que encapsula o estado da operação:
```javascript
{ sucesso: true, dados: {...}, erro: null }
// ou
{ sucesso: false, dados: null, erro: Error(...) }
```

O utilitário `Trilho.encadear` permite compor diversas funções pequenas e puras em um fluxo complexo, onde cada etapa só é executada se a anterior retornar sucesso. Isso elimina a "pirâmide do doom" e centraliza o tratamento de erros.

## 2. Fábricas de Funções vs. Classes

O projeto migrou de uma estrutura baseada em classes para **Fábricas de Funções (Factory Functions)**. Esta decisão foi tomada para:
- **Encapsulamento Real:** Utilização de closures para manter estados privados verdadeiros, sem depender de convenções de nomenclatura (como prefixos `_`).
- **Composição sobre Herança:** Facilita a criação de módulos flexíveis que injetam suas dependências explicitamente.
- **Testabilidade:** Funções puras e fábricas são mais fáceis de mockar e testar unitariamente.

Exemplo de estrutura:
```javascript
const criarProcessador = (dependencias) => {
  const { logger, adaptadorIA } = dependencias;
  
  // Estado privado via closure
  let contadorProcessamento = 0;

  return {
    processar: async (dados) => {
       // Lógica aqui...
    }
  };
};
```

## 3. Pipelines de Mídia e Filas (Better-Queue)

Para lidar com o processamento pesado de mídias (áudio, imagem, vídeo e documentos), o sistema implementa uma arquitetura baseada em eventos e filas. O sistema utiliza a biblioteca **Better-Queue** para gerenciar o processamento assíncrono em memória, garantindo que o bot permaneça responsivo.

### Estrutura das Filas (`src/adaptadores/queue/FilasMidia.js`)
As filas são configuradas com limites de concorrência específicos para otimizar o uso de recursos e evitar rate limits das APIs:
- **Imagens:** 10 processos simultâneos.
- **Áudios:** 10 processos simultâneos.
- **Documentos:** 5 processos simultâneos.
- **Vídeos:** 2 processos simultâneos (devido ao alto consumo de memória e tempo de upload).

### Pipelines de Processamento (`src/adaptadores/queue/OrquestradorMidia.js`)

1. **Recepção:** O `AdaptadorBaileys` identifica uma mídia e a envia para o `GerenciadorMensagens`.
2. **Enfileiramento:** Dependendo do tipo de mídia, a tarefa é adicionada a uma fila específica.
3. **Execução do Job:**
   - **Fluxo Curto (Imagem/Áudio/Documento):** O buffer da mídia é enviado diretamente para o `GerenciadorAI`. O resultado é retornado e enviado ao usuário através do `servicoMensagem`.
   - **Fluxo Longo (Vídeo):** 
     - Realiza o upload do arquivo para o **Google File API** através do `GoogleFileManager`.
     - Monitora o status do processamento via polling (até 20 tentativas com intervalo de 5s).
     - Uma vez ativo, solicita a geração de conteúdo baseada no URI do arquivo.
     - Limpa os arquivos temporários locais e remove o arquivo da nuvem Google após a conclusão.

Este desacoplamento permite que a Amélie confirme o recebimento da mídia instantaneamente ("Processando vídeo..."), enquanto o trabalho pesado ocorre em background.

## 4. Estrutura de Pastas (src)

- `adaptadores/`: Interfaces com o mundo externo (WhatsApp/Baileys, Filas, IA).
- `bancodedados/`: Camada de persistência (Suporte a MongoDB e NeDB).
- `config/`: Gestão de variáveis de ambiente e prompts de sistema.
- `portas/`: Definições de contratos e interfaces lógicas.
- `servicos/`: Lógica de negócio agnóstica a transporte.
- `utilitarios/`: Ferramentas transversais (Ferrovia, Manipulação de Arquivos).
