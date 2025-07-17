const axios = require('axios');
const cheerio = require('cheerio');

async function analyzeForm() {
  console.log('Анализируем форму на сайте...');
  
  try {
    const session = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
      }
    });

    console.log('Загружаем страницу...');
    const response = await session.get('https://client.sgtas.ua/pay_qr/genarate');
    const $ = cheerio.load(response.data);
    
    // Анализируем форму
    const forms = [];
    $('form').each((i, form) => {
      const $form = $(form);
      forms.push({
        action: $form.attr('action'),
        method: $form.attr('method'),
        id: $form.attr('id'),
        class: $form.attr('class')
      });
    });
    
    // Анализируем поля ввода
    const inputs = [];
    $('input, select, textarea').each((i, input) => {
      const $input = $(input);
      inputs.push({
        type: $input.attr('type'),
        name: $input.attr('name'),
        id: $input.attr('id'),
        class: $input.attr('class'),
        placeholder: $input.attr('placeholder')
      });
    });
    
    // Ищем JavaScript код
    const scripts = [];
    $('script').each((i, script) => {
      const $script = $(script);
      const src = $script.attr('src');
      const content = $script.html();
      
      if (src) {
        scripts.push({ type: 'external', src });
      } else if (content && (content.includes('ajax') || content.includes('fetch') || content.includes('submit'))) {
        scripts.push({ 
          type: 'inline', 
          content: content.substring(0, 500) + (content.length > 500 ? '...' : '')
        });
      }
    });
    
    // Ищем API endpoints
    const apiEndpoints = [];
    const allText = response.data;
    const endpoints = allText.match(/\/api\/[\w\/\-]+/g) || [];
    const ajaxUrls = allText.match(/url:\s*['"`]([^'"`]+)['"`]/g) || [];
    
    endpoints.forEach(endpoint => apiEndpoints.push(endpoint));
    ajaxUrls.forEach(url => {
      const match = url.match(/url:\s*['"`]([^'"`]+)['"`]/);
      if (match) apiEndpoints.push(match[1]);
    });

    return {
      success: true,
      analysis: {
        pageTitle: $('title').text().trim(),
        forms: forms,
        inputs: inputs.slice(0, 20), // Первые 20 полей
        scripts: scripts.slice(0, 10), // Первые 10 скриптов
        apiEndpoints: [...new Set(apiEndpoints)], // Уникальные endpoints
        hasJQuery: allText.includes('jquery'),
        hasAxios: allText.includes('axios'),
        hasFetch: allText.includes('fetch('),
        responseLength: response.data.length
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      details: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText
      } : null
    };
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    // GET запрос для анализа формы
    const result = await analyzeForm();
    res.json(result);
  } else if (req.method === 'POST') {
    // POST запрос для тестирования
    try {
      const { ipn, policy_number, amount } = req.body;
      
      if (!ipn || !policy_number || !amount) {
        return res.status(400).json({
          success: false,
          error: 'Отсутствуют обязательные поля: ipn, policy_number, amount',
        });
      }
      
      // Сначала анализируем форму
      const analysis = await analyzeForm();
      
      res.json({
        success: false,
        message: 'Форма проанализирована. Нужно найти правильный endpoint для отправки.',
        analysis: analysis.analysis,
        providedData: { ipn, policy_number, amount }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};