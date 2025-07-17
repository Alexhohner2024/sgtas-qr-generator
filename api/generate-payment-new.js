const axios = require('axios');
const cheerio = require('cheerio');

async function generatePaymentLink(data) {
  console.log('Запуск генерации ссылки через axios...');
  
  try {
    // Создаем сессию
    const session = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'uk-UA,uk;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    console.log('Загружаем страницу формы...');
    
    // Получаем форму
    const formResponse = await session.get('https://client.sgtas.ua/pay_qr/genarate');
    const $ = cheerio.load(formResponse.data);
    
    // Извлекаем CSRF токен если есть
    const csrfToken = $('input[name="_token"]').val() || 
                      $('meta[name="csrf-token"]').attr('content') || 
                      '';

    console.log('Подготавливаем данные для отправки...');

    // Подготавливаем данные формы
    const formData = new URLSearchParams({
      'office': '66',                    // Київ 2
      'agentCode': '66-5290300001',
      'ipn': data.ipn,
      'policy_series': 'ЕР',
      'policy_number': data.policy_number,
      'sum': data.amount,
      'purpose': 'Оплата страхового полиса'
    });

    // Добавляем CSRF токен если есть
    if (csrfToken) {
      formData.append('_token', csrfToken);
    }

    console.log('Отправляем форму...');

    // Отправляем форму
    const submitResponse = await session.post(
      'https://client.sgtas.ua/pay_qr/genarate',
      formData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://client.sgtas.ua/pay_qr/genarate'
        }
      }
    );

    // Парсим ответ
    const $result = cheerio.load(submitResponse.data);
    
    // Ищем сгенерированную ссылку
    let paymentLink = null;
    
    // Варианты поиска ссылки
    const linkSelectors = [
      '#encodedResult',
      'a[href*="pay"]',
      'input[value*="http"]',
      'textarea',
      '.qr-link',
      '.payment-link'
    ];

    for (const selector of linkSelectors) {
      const element = $result(selector);
      if (element.length > 0) {
        paymentLink = element.attr('href') || 
                      element.val() || 
                      element.text().trim();
        
        if (paymentLink && paymentLink.startsWith('http')) {
          break;
        }
      }
    }

    // Если не нашли ссылку, ищем в тексте страницы
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
        method: 'axios'
      };
    } else {
      console.log('Ссылка не найдена в ответе');
      return {
        success: false,
        error: 'Не удалось найти ссылку для оплаты в ответе сервера',
        debug: {
          responseLength: submitResponse.data.length,
          hasForm: $result('form').length > 0,
          hasInputs: $result('input').length
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
        statusText: error.response.statusText
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