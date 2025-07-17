const axios = require('axios');
const cheerio = require('cheerio');

async function extractJavaScript() {
  try {
    const session = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Загружаем главную страницу
    console.log('Загружаем страницу...');
    const response = await session.get('https://client.sgtas.ua/pay_qr/genarate');
    const $ = cheerio.load(response.data);
    
    // Извлекаем inline JavaScript
    const inlineScripts = [];
    $('script:not([src])').each((i, script) => {
      const content = $(script).html();
      if (content && content.trim()) {
        inlineScripts.push(content);
      }
    });
    
    // Пытаемся загрузить site.js
    let siteJsContent = null;
    try {
      const siteJsResponse = await session.get('https://client.sgtas.ua/js/site.js');
      siteJsContent = siteJsResponse.data;
    } catch (error) {
      console.log('Не удалось загрузить site.js:', error.message);
    }
    
    // Ищем упоминания form submit, ajax, fetch
    const relevantCode = [];
    
    inlineScripts.forEach((script, index) => {
      if (script.includes('submit') || 
          script.includes('ajax') || 
          script.includes('fetch') || 
          script.includes('form') ||
          script.includes('createQrCodeBtn') ||
          script.includes('generate')) {
        relevantCode.push({
          type: 'inline',
          index: index,
          content: script.substring(0, 2000) + (script.length > 2000 ? '...' : '')
        });
      }
    });
    
    if (siteJsContent) {
      // Ищем функции отправки формы в site.js
      const lines = siteJsContent.split('\n');
      let currentFunction = '';
      let inRelevantFunction = false;
      
      lines.forEach((line, lineNum) => {
        if (line.includes('submit') || 
            line.includes('ajax') || 
            line.includes('form') ||
            line.includes('createQrCodeBtn') ||
            line.includes('generate') ||
            line.includes('/pay_qr/')) {
          inRelevantFunction = true;
          currentFunction = '';
        }
        
        if (inRelevantFunction) {
          currentFunction += line + '\n';
          
          // Если функция закончилась
          if (line.includes('}') && currentFunction.split('{').length <= currentFunction.split('}').length) {
            relevantCode.push({
              type: 'site.js',
              lineNumber: lineNum,
              content: currentFunction
            });
            inRelevantFunction = false;
          }
        }
      });
    }
    
    // Ищем кнопки и их обработчики
    const buttons = [];
    $('button, input[type="submit"], input[type="button"]').each((i, btn) => {
      const $btn = $(btn);
      buttons.push({
        id: $btn.attr('id'),
        class: $btn.attr('class'),
        onclick: $btn.attr('onclick'),
        text: $btn.text().trim() || $btn.val()
      });
    });
    
    // Ищем возможные endpoints в коде
    const endpoints = [];
    const allContent = response.data + (siteJsContent || '');
    
    // Паттерны для поиска URL
    const urlPatterns = [
      /['"`]\/[^'"`\s]+['"`]/g,
      /url:\s*['"`]([^'"`]+)['"`]/g,
      /action=['"`]([^'"`]+)['"`]/g,
      /fetch\(['"`]([^'"`]+)['"`]/g,
      /ajax.*url.*['"`]([^'"`]+)['"`]/g
    ];
    
    urlPatterns.forEach(pattern => {
      const matches = allContent.match(pattern) || [];
      matches.forEach(match => {
        const url = match.replace(/['"`]/g, '').replace(/url:\s*/, '').replace(/action=/, '');
        if (url.startsWith('/') && !endpoints.includes(url)) {
          endpoints.push(url);
        }
      });
    });
    
    return {
      success: true,
      data: {
        relevantCode: relevantCode,
        buttons: buttons,
        possibleEndpoints: endpoints,
        hasSiteJs: !!siteJsContent,
        siteJsSize: siteJsContent ? siteJsContent.length : 0
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
  if (req.method === 'GET') {
    const result = await extractJavaScript();
    res.json(result);
  } else {
    res.status(405).json({ error: 'Only GET method allowed' });
  }
};