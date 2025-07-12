const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

async function generatePaymentLink(data) {
  console.log('Запуск генерации ссылки...');
  
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
    
    await page.waitForSelector('.select2-selection__rendered', { timeout: 10000 });
    await page.click('.select2-selection__rendered');
    await page.waitForTimeout(2000);
    await page.waitForSelector('.select2-results__option', { timeout: 10000 });
    
    // Выбираем опцию в select2
    await page.evaluate(() => {
      const option = document.querySelector('[data-select2-id="66"]');
      if (option) option.click();
    });
    
    console.log('Заполнение данных формы...');
    await page.type('#agentCode', '66-5290300001');
    await page.type('#ipn', data.ipn);
    await page.type('#policy_series', 'ЕР');
    await page.type('#policy_number', data.policy_number);
    await page.type('#sum', data.amount);
    
    await page.click('#createQrCodeBtn');
    
    console.log('Ждем генерацию ссылки...');
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
