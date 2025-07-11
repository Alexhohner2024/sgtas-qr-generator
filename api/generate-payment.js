const { chromium } = require('playwright-core');

async function generatePaymentLink(data) {
  console.log('Запуск генерации ссылки...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // Необходимые флаги для Vercel
  });

  try {
    const page = await browser.newPage();
    console.log('Открытие страницы...');

    await page.goto('https://client.sgtas.ua/pay_qr/genarate', {
      waitUntil: 'networkidle',
    });

    await page.waitForSelector('.select2-selection__rendered', { timeout: 10000 });
    await page.click('.select2-selection__rendered');
    await page.waitForTimeout(2000);

    await page.waitForSelector('.select2-results__option', { timeout: 10000 });
    await page.selectOption('#accountSelect', '66');

    console.log('Заполнение данных формы...');
    await page.fill('#agentCode', '66-5290300001');
    await page.fill('#ipn', data.ipn);
    await page.fill('#policy_series', 'ЕР');
    await page.fill('#policy_number', data.policy_number);
    await page.fill('#sum', data.amount);

    await page.click('#createQrCodeBtn');

    console.log('Ждем генерацию ссылки...');
    await page.waitForSelector('#encodedResult', { timeout: 10000 });

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

export default async function handler(req, res) {
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
}
