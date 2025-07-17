const axios = require('axios');

// Функция создания описания платежа
function createPaymentPurpose(data) {
  const policySeries = 'ЕР';
  const policyNumber = data.policy_number;
  const ipn = data.ipn;
  const code = '66'; // Київ 2

  const combined = `Платіж за полісом ${policySeries}—${policyNumber}; Платник: ${ipn}; Код ОМ ${code}`;
  
  return combined;
}

async function generatePaymentLink(data) {
  console.log('Генерируем платежную ссылку...');
  
  try {
    // Создаем URL-encoded строку параметров
    const params = new URLSearchParams({
      account: '66',
      agent: '66-5290300001',
      ipn: data.ipn,
      series: 'ЕР',
      number: data.policy_number,
      sum: data.amount,
      purpose: createPaymentPurpose(data)
    });
    
    // Кодируем параметры в Base64
    const encodedData = Buffer.from(params.toString(), 'utf8').toString('base64');
    const paymentLink = `https://client.sgtas.ua/pay_qr/pay/${encodedData}`;
    
    console.log('Ссылка сгенерирована успешно');
    
    return {
      success: true,
      payment_link: paymentLink,
      data: data,
      encoding_method: 'Base64',
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