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
    // Пытаемся извлечь настоящую функцию кодирования
    const realEncodeFunction = await extractEncodeFunction();
    console.log('Настоящая функция найдена:', !!realEncodeFunction);
    
    // Пробуем разные варианты кодирования
    const encodingVariants = [
      encodeFormData(data),
      encodeFormDataBase64(data),
      // Простое кодирование без параметров
      `${data.ipn}/${data.policy_number}/${data.amount}`,
      // С серией
      `ЕР/${data.policy_number}/${data.ipn}/${data.amount}`,
      // URL encode
      encodeURIComponent(JSON.stringify({
        account: '66',
        agent: '66-5290300001',
        ipn: data.ipn,
        series: 'ЕР',
        number: data.policy_number,
        sum: data.amount,
        purpose: createPaymentPurpose(data)
      }))
    ];
    
    const baseUrl = 'https://client.sgtas.ua/pay_qr/pay/';
    const results = [];
    
    // Тестируем каждый вариант
    for (let i = 0; i < encodingVariants.length; i++) {
      const encodedData = encodingVariants[i];
      const testUrl = baseUrl + encodedData;
      
      try {
        console.log(`Тестируем вариант ${i + 1}:`, testUrl.substring(0, 100) + '...');
        
        const session = axios.create({
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const testResponse = await session.get(testUrl);
        
        if (testResponse.status === 200 && testResponse.data.length > 100) {
          // Проверяем, содержит ли ответ QR код или платежную информацию
          const $ = cheerio.load(testResponse.data);
          const hasPaymentContent = $('body').text().toLowerCase().includes('оплата') || 
                                   $('body').text().toLowerCase().includes('платіж') ||
                                   $('body').text().toLowerCase().includes('qr') ||
                                   $('img').length > 0;
          
          results.push({
            variant: i + 1,
            url: testUrl,
            status: testResponse.status,
            hasContent: hasPaymentContent,
            contentLength: testResponse.data.length,
            title: $('title').text().trim()
          });
          
          if (hasPaymentContent) {
            console.log(`Вариант ${i + 1} работает!`);
            return {
              success: true,
              payment_link: testUrl,
              data: data,
              variant_used: i + 1,
              encoding_method: ['URLSearchParams', 'Base64', 'Simple', 'WithSeries', 'URLEncode'][i]
            };
          }
        }
        
      } catch (error) {
        console.log(`Вариант ${i + 1} не работает:`, error.message);
        results.push({
          variant: i + 1,
          error: error.message,
          status: error.response ? error.response.status : 'network_error'
        });
      }
    }
    
    return {
      success: false,
      error: 'Ни один вариант кодирования не сработал',
      debug: {
        realEncodeFunction: realEncodeFunction,
        testedVariants: results,
        baseUrl: baseUrl
      }
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