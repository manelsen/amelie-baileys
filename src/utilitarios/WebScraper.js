/**
 * WebScraper.js - Utilitário para extração de conteúdo de URLs
 */
const cheerio = require('cheerio');
const { Resultado } = require('./Ferrovia');

/**
 * Busca e extrai conteúdo textual de uma URL
 * @param {string} url - URL para ler
 * @returns {Promise<Resultado>} Resultado com { titulo, texto, url }
 */
const extrairConteudo = async (urlInput) => {
  try {
    let url = urlInput.trim();
    
    // Ajuste automático de protocolo se faltar
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    // Validação básica de URL
    try {
      new URL(url);
    } catch (e) {
      return Resultado.falha(new Error("URL inválida"));
    }

    // Fetch com timeout e User-Agent para evitar bloqueios simples
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AmelieBot/1.0; +http://example.com/bot)'
      }
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      return Resultado.falha(new Error(`Falha ao acessar URL: ${response.status} ${response.statusText}`));
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
        return Resultado.falha(new Error(`Conteúdo não é HTML (Tipo: ${contentType})`));
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remover elementos indesejados
    $('script, style, nav, footer, iframe, noscript, svg, button, form').remove();

    // Extrair Título
    const titulo = $('title').text().trim() || $('h1').first().text().trim() || 'Sem título';

    // Extrair Texto Principal (tenta focar em article ou main, fallback para body)
    let container = $('article');
    if (container.length === 0) container = $('main');
    if (container.length === 0) container = $('body');

    // Limpar espaços em branco excessivos
    const texto = container.text()
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 20000); // Limite seguro de caracteres para não estourar token da IA

    if (texto.length < 50) {
        return Resultado.falha(new Error("Não foi possível extrair conteúdo textual relevante desta página."));
    }

    return Resultado.sucesso({
      titulo,
      texto,
      url
    });

  } catch (erro) {
    const msg = erro.name === 'AbortError' ? 'Tempo limite excedido (15s)' : erro.message;
    return Resultado.falha(new Error(`Erro ao ler site: ${msg}`));
  }
};

module.exports = {
  extrairConteudo
};
