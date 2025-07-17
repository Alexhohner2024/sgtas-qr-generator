const axios = require('axios');
const cheerio = require('cheerio');

async function generatePaymentLink(data) {
  console.log('Запуск генерации ссылки...');
  
  try {
    const session = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    console.log('Загружаем страницу для получения токенов...');
    
    // Сначала получаем страницу для извлечения токенов
    const pageResponse = await session.get('https://client.sgtas.ua/pay_qr/genarate');
    const $ = cheerio.load(pageResponse.data);
    
    // Извлекаем CSRF токен
    const csrfToken = $('meta[name="csrf-token"]').attr('content') || 
                      $('input[name="_token"]').val() || '';
    
    console.log('CSRF токен найден:', !!csrfToken);

    // Обновляем заголовки с токеном
    if (csrfToken) {
      session.defaults.headers['X-CSRF-TOKEN'] = csrfToken;
    }
    
    session.defaults.headers['Referer'] = 'https://client.sgtas.ua/pay_qr/genarate';
    session.defaults.headers['Origin'] = 'https://client.sgtas.ua';

    console.log('Подготавливаем данные...');

    // Подготавливаем данные как JSON (современные формы часто используют JSON)
    const requestData = {
      accountSelect: '66', // Київ 2
      agentCode: '66-5290300001',
      ipn: data.ipn,
      policy_series: 'ЕР',
      policy_number: data.policy_number,
      sum: data.amount,
      _token: csrfToken
    };

    console.log('Отправляем на /pay_qr/pay/...');

    // Пробуем отправить на найденный endpoint
    let response;
    try {
      response = await session.post('https://client.sgtas.ua/pay_qr/pay/', requestData);
    } catch (error) {
      if (error.response && error.response.status === 405) {
        console.log('405 ошибка, пробуем другие методы...');
        
        // Пробуем как form-data
        const formData = new URLSearchParams();
        Object.entries(requestData).forEach(([key, value]) => {
          formData.append(key, value);
        });
        
        session.defaults.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        
        try {
          response = await session.post('https://client.sgtas.ua/pay_qr/pay/', formData);
        } catch (error2) {
          // Пробуем основной endpoint
          response = await session.post('https://client.sgtas.ua/pay_qr/genarate', formData);
        }
      } else {
        throw error;
      }
    }

    console.log('Ответ получен, статус:', response.status);

    // Обрабатываем ответ
    let result;
    
    if (typeof response.data === 'string') {
      // HTML ответ
      const $result = cheerio.load(response.data);
      
      // Ищем ссылку в HTML
      let paymentLink = null;
      const selectors = [
        '#encodedResult',
        'a[href*="pay"]',
        'input[value*="http"]',
        'textarea',
        '[data-payment-link]'
      ];
      
      for (const selector of selectors) {
        const element = $result(selector);
        if (element.length > 0) {
          paymentLink = element.attr('href') || element.val() || element.text().trim();
          if (paymentLink && paymentLink.startsWith('http')) {
            break;
          }
        }
      }
      
      // Поиск в тексте
      if (!paymentLink) {
        const pageText = $result.text();
        const urlMatch = pageText.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          paymentLink = urlMatch[1];
        }
      }
      
      result = paymentLink ? {
        success: true,
        payment_link: paymentLink,
        data: data,
        method: 'html_parse'
      } : {
        success: false,
        error: 'Ссылка не найдена в HTML ответе',
        debug: {
          responseLength: response.data.length,
          hasEncodedResult: $result('#encodedResult').length > 0,
          title: $result('title').text()
        }
      };
      
    } else {
      // JSON ответ
      result = response.data.payment_link ? {
        success: true,
        payment_link: response.data.payment_link,
        data: data,
        method: 'json_response'
      } : {
        success: false,
        error: 'Ссылка не найдена в JSON ответе',
        debug: response.data
      };
    }

    return result;

  } catch (error) {
    console.error('Ошибка:', error.message);
    return {
      success: false,
      error: error.message,
      details: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: typeof error.response.data === 'string' ? 
              error.response.data.substring(0, 500) : error.response.data
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