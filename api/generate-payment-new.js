const axios = require('axios');
const cheerio = require('cheerio');

async function findRealEndpoint() {
  try {
    const session = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    console.log('Загружаем страницу...');
    const response = await session.get('https://client.sgtas.ua/pay_qr/genarate');
    const $ = cheerio.load(response.data);
    
    // Загружаем site.js
    console.log('Загружаем site.js...');
    let siteJsContent = '';
    try {
      const siteJsResponse = await session.get('https://client.sgtas.ua/js/site.js?v=hRQyftXiu1lLX2P9Ly9xa4gHJgLeR1uGN5qegUobtGo');
      siteJsContent = siteJsResponse.data;
    } catch (error) {
      console.log('Не удалось загрузить site.js');
    }
    
    // Извлекаем весь JavaScript код
    const allScripts = [];
    $('script:not([src])').each((i, script) => {
      allScripts.push($(script).html());
    });
    
    const allCode = response.data + '\n' + siteJsContent + '\n' + allScripts.join('\n');
    
    // Ищем все возможные endpoints
    const endpoints = [];
    
    // Паттерны поиска
    const patterns = [
      // AJAX вызовы
      /\$\.ajax\s*\(\s*\{[^}]*url\s*:\s*['"`]([^'"`]+)['"`]/g,
      /\$\.post\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /\$\.get\s*\(\s*['"`]([^'"`]+)['"`]/g,
      // Fetch вызовы
      /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
      // Axios вызовы
      /axios\s*\.\s*post\s*\(\s*['"`]([^'"`]+)['"`]/g,
      // Form action
      /action\s*=\s*['"`]([^'"`]+)['"`]/g,
      // URL в переменных
      /(?:url|endpoint|action)\s*[:=]\s*['"`]([^'"`]+)['"`]/g,
      // Любые URL начинающиеся с /
      /['"`](\/[a-zA-Z0-9_\-\/]*(?:generate|create|submit|send|pay)[a-zA-Z0-9_\-\/]*)['"`]/g
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(allCode)) !== null) {
        const url = match[1];
        if (url && url.startsWith('/') && !endpoints.includes(url)) {
          endpoints.push(url);
        }
      }
    });
    
    // Ищем обработчики кнопки #createQrCodeBtn
    const buttonHandlers = [];
    const buttonPatterns = [
      /#createQrCodeBtn[^}]*\{([^}]*)\}/g,
      /createQrCodeBtn[^}]*click[^}]*\{([^}]*)\}/g,
      /click[^}]*createQrCodeBtn[^}]*\{([^}]*)\}/g
    ];
    
    buttonPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(allCode)) !== null) {
        buttonHandlers.push(match[1]);
      }
    });
    
    // Анализируем form элемент детально
    const form = $('form#form, form').first();
    const formData = {
      id: form.attr('id'),
      action: form.attr('action') || 'нет action',
      method: form.attr('method') || 'нет method',
      onsubmit: form.attr('onsubmit')
    };
    
    // Ищем все routes в коде
    const routes = [];
    const routePatterns = [
      /Route::[a-zA-Z]+\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /route\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /url\s*\(\s*['"`]([^'"`]+)['"`]/g
    ];
    
    routePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(allCode)) !== null) {
        routes.push(match[1]);
      }
    });
    
    return {
      success: true,
      data: {
        form: formData,
        endpoints: [...new Set(endpoints)],
        buttonHandlers: buttonHandlers,
        routes: [...new Set(routes)],
        siteJsSize: siteJsContent.length,
        hasJQuery: allCode.includes('jquery') || allCode.includes('jQuery'),
        hasAjax: allCode.includes('ajax') || allCode.includes('$.post') || allCode.includes('$.get'),
        hasFetch: allCode.includes('fetch('),
        codeSnippets: {
          createQrCodeBtn: allCode.includes('createQrCodeBtn') ? 
            allCode.substring(allCode.indexOf('createQrCodeBtn') - 100, allCode.indexOf('createQrCodeBtn') + 200) : 
            'Не найдено'
        }
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = async function handler(req, res) {
  const result = await findRealEndpoint();
  res.json(result);
};