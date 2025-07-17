const axios = require('axios');
const cheerio = require('cheerio');

// Функция создания описания платежа (аналог updateCombinedField())
function createPaymentPurpose(data) {
  const policySeries = 'ЕР';
  const policyNumber = data.policy_number;
  const ipn = data.ipn;
  const code = '66'; // Київ 2

  // Формат как на скриншоте: "Платіж за полісом ЕР—123456789; Платник: 1234567890; Код ОМ 66"
  const combined = `Платіж за полісом ${policySeries}—${policyNumber}; Платник: ${ipn}; Код ОМ ${code}`;
  
  return combined;
}

// Функция кодирования данных формы (аналог encodeFormData())
function encodeFormData(data) {
  // Создаем строку параметров
  const params = new URLSearchParams();
  
  // Основные параметры
  params.append('account', '66'); // Київ 2
  params.append('agent', '66-5290300001');
  params.append('ipn', data.ipn);
  params.append('series', 'ЕР');
  params.append('number', data.policy_number);
  params.append('sum', data.amount);
  
  // Добавляем сгенерированное описание платежа
  params.append('purpose', createPaymentPurpose(data));
  
  return params.toString();
}

// Альтернативная функция кодирования (если первая не сработает)
function encodeFormDataBase64(data) {
  const formData = {
    account: '66',
    agent: '66-5290300001',
    ipn: data.ipn,
    series: 'ЕР',
    number: data.policy_number,
    sum: data.amount,
    purpose: createPaymentPurpose(data)
  };
  
  // Пробуем Base64 кодирование
  const jsonString = JSON.stringify(formData);
  return Buffer.from(jsonString).toString('base64');
}

// Функция для извлечения настоящей функции encodeFormData с сайта
async function extractEncodeFunction() {
  try {
    const session = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Загружаем страницу
    const response = await session.get('https://client.sgtas.ua/pay_qr/genarate');
    const $ = cheerio.load(response.data);
    
    // Загружаем site.js
    let siteJsContent = '';
    try {
      const siteJsResponse = await session.get('https://client.sgtas.ua/js/site.js?v=hRQyftXiu1lLX2P9Ly9xa4gHJgLeR1uGN5qegUobtGo');
      siteJsContent = siteJsResponse.data;
    } catch (error) {
      console.log('Не удалось загрузить site.js');
    }
    
    // Ищем функцию encodeFormData
    const allScripts = [];
    $('script:not([src])').each((i, script) => {
      allScripts.push($(script).html());
    });
    
    const allCode = response.data + '\n' + siteJsContent + '\n' + allScripts.join('\n');
    
    // Ищем определение функции encodeFormData
    const encodeFunction = allCode.match(/function\s+encodeFormData\s*\([^)]*\)\s*\{[^}]*\}/);
    if (encodeFunction) {
      return encodeFunction[0];
    }
    
    // Или как переменная
    const encodeFunctionVar = allCode.match(/encodeFormData\s*=\s*function[^}]*\}/);
    if (encodeFunctionVar) {
      return encodeFunctionVar[0];
    }
    
    return null;
    
  } catch (error) {
    return null;
  }
}

async function generatePaymentLink(data) {
  console.log('Генерируем платежную ссылку...');
  
  try {
    // Используем проверенный Base64 метод с кириллицей
    const formData = {
      account: '66',
      agent: '66-5290300001',
      ipn: data.ipn,
      series: 'ЕР', // Возвращаем кириллицу
      number: data.policy_number,
      sum: data.amount,
      purpose: createPaymentPurpose(data) // Возвращаем функцию с кириллицей
    };
    
    const jsonString = JSON.stringify(formData);
    const encodedData = Buffer.from(jsonString, 'utf8').toString('base64');
    
    // URL-safe base64 encoding для избежания проблем с кириллицей
    const safeEncodedData = encodedData.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    
    const paymentLink = `https://client.sgtas.ua/pay_qr/pay/${safeEncodedData}`;
    
    console.log('Ссылка сгенерирована успешно');
    
    return {
      success: true,
      payment_link: paymentLink,
      data: data,
      encoding_method: 'Base64 URL-safe',
      purpose: createPaymentPurpose(data)
    };
    
  } catch (error) {
    console.error('Ошибка:', error.message);
    return {
      success: false,
      error: error.message
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