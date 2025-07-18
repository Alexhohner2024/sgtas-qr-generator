const axios = require('axios');

// Функция создания описания платежа
function createPaymentPurpose(data) {
  const policySeries = 'ЕР';
  const policyNumber = data.policy_number;
  const ipn = data.ipn;
  const code = '66'; // Київ 2

  // Используем Unicode символ для длинного тире
  const longDash = '\u2014'; // Unicode для —
  const combined = `Платіж за полісом ${policySeries}${longDash}${policyNumber}; Платник: ${ipn}; Код ОМ ${code}`;
  
  return combined;
}

async function generatePaymentLink(data) {
  console.log('Генерируем платежную ссылку...');
  console.log('Входные данные:', data);
  
  try {
    // Формируем JSON объект с правильной структурой (только 3 поля!)
    const formData = {
      account: '66',
      sum: String(data.amount), // Преобразуем в строку
      clientData: createPaymentPurpose(data)
    };
    
    console.log('formData:', JSON.stringify(formData));
    
    // Кодируем в Base64
    const jsonString = JSON.stringify(formData);
    const encodedData = Buffer.from(jsonString, 'utf8').toString('base64');
    
    // Убираем символы = в конце Base64
    const cleanEncodedData = encodedData.replace(/=+$/, '');
    
    const paymentLink = `https://client.sgtas.ua/pay_qr/pay/${cleanEncodedData}`;
    
    console.log('Ссылка сгенерирована успешно');
    
    return {
      success: true,
      payment_link: paymentLink,
      data: data,
      encoding_method: 'Base64',
      clientData: formData.clientData
    };
    
  } catch (error) {
    console.error('Ошибка в generatePaymentLink:', error);
    console.error('Stack:', error.stack);
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