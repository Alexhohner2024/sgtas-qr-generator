const axios = require('axios');

// Функция создания описания платежа
function createPaymentPurpose(data) {
  const policySeries = 'ЕР';
  const policyNumber = data.policy_number;
  const ipn = data.ipn;
  const code = '66'; // Київ 2

  const longDash = '\u2014'; // Unicode для —
  const combined = `Платіж за полісом ${policySeries}${longDash}${policyNumber}; Платник: ${ipn}; Код ОМ ${code}`;
  
  return combined;
}

async function generatePaymentLink(data) {
  console.log('Генерируем платежную ссылку...');
  console.log('Входные данные:', data);
  
  try {
    // Формируем JSON объект с правильной структурой
    const formData = {
      account: '66',
      sum: String(data.amount),
      clientData: createPaymentPurpose(data)
    };
    
    console.log('formData:', JSON.stringify(formData));
    
    // Правильное кодирование как в оригинале
    const jsonString = JSON.stringify(formData);
    const base64 = Buffer.from(jsonString, 'utf8').toString('base64');
    const urlSafeBase64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    const paymentLink = `https://client.sgtas.ua/pay_qr/pay/${urlSafeBase64}`;
    
    console.log('Ссылка сгенерирована успешно');
    
    return {
      success: true,
      payment_link: paymentLink,
      data: data,
      encoding_method: 'Base64 URL-safe',
      clientData: formData.clientData
    };
    
  } catch (error) {
    console.error('Ошибка в generatePaymentLink:', error);
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
    console.log('Raw body:', req.body);
    console.log('Body type:', typeof req.body);
    
    let body = req.body;
    
    // Если приходит строка, парсим JSON
    if (typeof body === 'string') {
      // Убираем переносы строк и лишние пробелы из JSON строки
      body = body.replace(/\n\s*/g, '').replace(/\s+/g, ' ');
      body = JSON.parse(body);
    }
    
    // Извлекаем и очищаем данные
    const ipn = body.ipn ? body.ipn.toString().trim() : '';
    const policy_number = body.policy_number ? body.policy_number.toString().trim() : '';
    const amount = body.amount ? body.amount.toString().trim() : '';
    
    console.log('Очищенные данные:', { ipn, policy_number, amount });
    
    if (!ipn || !policy_number || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствуют обязательные поля: ipn, policy_number, amount',
        received_data: body
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
    console.error('Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};