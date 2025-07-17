const axios = require('axios');
const cheerio = require('cheerio');

async function generatePaymentLink(data) {
  console.log('Запуск генерации ссылки через axios...');
  
  try {
    // Создаем сессию с реалистичными заголовками
    const session = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8,ru;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      }
    });

    console.log('Загружаем страницу формы...');
    
    // Получаем форму
    const formResponse = await session.get('https://client.sgtas.ua/pay_qr/genarate');
    const $ = cheerio.load(formResponse.data);
    
    console.log('Анализируем форму...');
    
    // Извлекаем все скрытые поля и токены
    const hiddenInputs = {};
    $('input[type="hidden"]').each((i, el) => {
      const name = $(el).attr('name');
      const value = $(el).attr('value');
      if (name && value) {
        hiddenInputs[name] = value;
      }
    });
    
    // CSRF токен
    const csrfToken = $('input[name="_token"]').val() || 
                      $('meta[name="csrf-token"]').attr('content') || 
                      '';

    console.log('Найденные скрытые поля:', Object.keys(hiddenInputs));

    // Анализируем форму для правильных имен полей
    const formAction = $('form').attr('action') || '/pay_qr/genarate';
    const formMethod = $('form').attr('method') || 'POST';
    
    console.log('Подготавливаем данные для отправки...');

    // Подготавливаем данные формы с правильными именами полей
    const formData = new URLSearchParams();
    
    // Добавляем скрытые поля
    Object.entries(hiddenInputs).forEach(([name, value]) => {
      formData.append(name, value);
    });
    
    // Добавляем CSRF токен
    if (csrfToken) {
      formData.append('_token', csrfToken);
    }
    
    // Основные поля (используем разные варианты имен)
    formData.append('office', '66');
    formData.append('office_code', '66');
    formData.append('om', '66');
    formData.append('agentCode', '66-5290300001');
    formData.append('agent_code', '66-5290300001');
    formData.append('ipn', data.ipn);
    formData.append('client_ipn', data.ipn);
    formData.append('policy_series', 'ЕР');
    formData.append('series', 'ЕР');
    formData.append('policy_number', data.policy_number);
    formData.append('number', data.policy_number);
    formData.append('sum', data.amount);
    formData.append('amount', data.amount);
    formData.append('purpose', 'Оплата страхового полиса');

    console.log('Отправляем форму...');

    // Отправляем форму
    const submitResponse = await session.post(
      `https://client.sgtas.ua${formAction}`,
      formData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://client.sgtas.ua/pay_qr/genarate',
          'Origin': 'https://client.sgtas.ua',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin'
        },
        maxRedirects: 5,
        validateStatus: function (status) {
          return status < 500; // Принимаем любой статус < 500
        }
      }
    );

    console.log('Статус ответа:', submitResponse.status);

    // Парсим ответ
    const $result = cheerio.load(submitResponse.data);
    
    // Ищем сгенерированную ссылку или QR код
    let paymentLink = null;
    
    // Расширенный список селекторов
    const linkSelectors = [
      '#encodedResult',
      '#qrResult',
      '#paymentLink',
      'a[href*="pay"]',
      'a[href*="qr"]',
      'input[value*="http"]',
      'textarea',
      '.qr-link',
      '.payment-link',
      '[data-qr]',
      '[data-payment]'
    ];

    for (const selector of linkSelectors) {
      const element = $result(selector);
      if (element.length > 0) {
        paymentLink = element.attr('href') || 
                      element.attr('data-qr') ||
                      element.attr('data-payment') ||
                      element.val() || 
                      element.text().trim();
        
        if (paymentLink && paymentLink.startsWith('http')) {
          break;
        }
      }
    }

    // Поиск в JavaScript коде страницы
    if (!paymentLink) {
      const scripts = $result('script').toArray();
      for (const script of scripts) {
        const scriptContent = $(script).html() || '';
        const urlMatch = scriptContent.match(/(https?:\/\/[^\s"']+)/);
        if (urlMatch && urlMatch[1].includes('pay')) {
          paymentLink = urlMatch[1];
          break;
        }
      }
    }

    // Поиск в тексте страницы
    if (!paymentLink) {
      const pageText = $result.text();
      const urlMatch = pageText.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        paymentLink = urlMatch[1];
      }
    }

    if (paymentLink) {
      console.log('Ссылка найдена:', paymentLink);
      return {
        success: true,
        payment_link: paymentLink,
        data: data,
        method: 'axios',
        response_status: submitResponse.status
      };
    } else {
      console.log('Ссылка не найдена в ответе');
      
      // Ищем ошибки в форме
      const formErrors = [];
      $result('.error, .alert-danger, .invalid-feedback').each((i, el) => {
        const errorText = $(el).text().trim();
        if (errorText) formErrors.push(errorText);
      });
      
      return {
        success: false,
        error: 'Не удалось найти ссылку для оплаты в ответе сервера',
        debug: {
          responseLength: submitResponse.data.length,
          responseStatus: submitResponse.status,
          hasForm: $result('form').length > 0,
          hasInputs: $result('input').length,
          foundHiddenFields: Object.keys(hiddenInputs),
          formErrors: formErrors,
          pageTitle: $result('title').text().trim()
        }
      };
    }

  } catch (error) {
    console.error('Ошибка при генерации ссылки:', error);
    return {
      success: false,
      error: error.message,
      details: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data ? error.response.data.substring(0, 500) : null
      } : null
    };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    console.log('Получен запрос на генерацию платежной ссылки');
    const { ipn, policy_number, amount } = req.body;
    
    if (!ipn || !policy_number || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствуют обязательные поля: ipn, policy_number, amount',
      });
    }
    
    const result = await generatePaymentLink({
      ipn,
      policy_number,
      amount,
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Ошибка при генерации ссылки:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};