const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

async function generatePaymentLink(data) {
  console.log('Запуск генерации ссылки...');
  
  // Настройки для Vercel
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
  });
  
  try {
    const page = await browser.newPage();
    
    console.log('Открытие страницы...');
    
    await page.goto('https://client.sgtas.ua/pay_qr/genarate', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    // Заполняем форму
    await page.waitForSelector('select', { timeout: 10000 });
    
    // Выбираем отделение "Київ 2" (код 66)
    await page.select('select', '66');
    
    console.log('Заполнение данных формы...');
    
    // Заполняем остальные поля
    await page.waitForSelector('#agentCode', { timeout: 5000 });
    await page.type('#agentCode', '66-5290300001');
    
    await page.waitForSelector('#ipn', { timeout: 5000 });
    await page.type('#ipn', data.ipn);
    
    await page.waitForSelector('#policy_series', { timeout: 5000 });
    await page.type('#policy_series', 'ЕР');
    
    await page.waitForSelector('#policy_number', { timeout: 5000 });
    await page.type('#policy_number', data.policy_number);
    
    await page.waitForSelector('#sum', { timeout: 5000 });
    await page.type('#sum', data.amount);
    
    // Нажимаем кнопку генерации
    await page.waitForSelector('#createQrCodeBtn', { timeout: 5000 });
    await page.click('#createQrCodeBtn');
    
    console.log('Ждем генерацию ссылки...');
    
    // Ждем результат
    await page.waitForSelector('#encodedResult', { timeout: 15000 });
    
    const paymentLink = await page.evaluate(() => {
      const linkElement = document.querySelector('#encodedResult');
      return linkElement ? linkElement.href : null;
    });
    
    console.log('Генерация завершена!');
    return {
      success: true,
      payment_link: paymentLink,
      data: data,
    };
    
  } catch (error) {
    console.error('Ошибка при генерации ссылки:', error);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    await browser.close();
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
