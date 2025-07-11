const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

// Функция для генерации платёжной ссылки
async function generatePaymentLink(data) {
  console.log('Запуск генерации ссылки...'); // Лог для начала генерации
  const browser = await puppeteer.launch({
    headless: 'new',  // Новый headless режим
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    console.log('Открытие страницы...');
    // Переходим на страницу
    await page.goto('https://client.sgtas.ua/pay_qr/genarate', {
      waitUntil: 'networkidle0'
    });

    // Заполняем форму
    await page.waitForSelector('.select2-selection__rendered', { timeout: 10000 });  // Ждем появления выпадающего списка
    await page.click('.select2-selection__rendered');  // Кликаем по выпадающему списку
    await page.waitForTimeout(2000); // Ждем 2 секунды, чтобы элементы подгрузились

    // Ждем появления вариантов и выбираем "Київ 2"
    await page.waitForSelector('.select2-results__option', { timeout: 10000 });
    await page.select('#accountSelect', '66');  // Используем правильное значение для "Київ 2" (код ОМ 66)

    console.log('Заполнение данных формы...');
    // Заполняем остальные поля
    await page.type('#agentCode', '66-5290300001');
    await page.type('#ipn', data.ipn);
    await page.type('#policy_series', 'ЕР');
    await page.type('#policy_number', data.policy_number);
    await page.type('#sum', data.amount);

    // Нажимаем кнопку "Генерировать"
    await page.click('#createQrCodeBtn');

    console.log('Ждем генерацию ссылки...');
    // Ждем, пока появится ссылка
    await page.waitForSelector('#encodedResult', { timeout: 10000 });

    // Получаем сгенерированную ссылку
    const paymentLink = await page.evaluate(() => {
      const linkElement = document.querySelector('#encodedResult');
      return linkElement ? linkElement.href : null;
    });

    console.log('Генерация завершена!');
    return {
      success: true,
      payment_link: paymentLink,
      data: data
    };

  } catch (error) {
    console.error('Ошибка при генерации ссылки:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await browser.close();
  }
}

// Тестовый endpoint
app.get('/test', (req, res) => {
  console.log('Тестовый запрос принят');
  res.json({
    message: 'SGTas QR Generator работает!',
    timestamp: new Date().toISOString()
  });
});

// Endpoint для генерации платёжной ссылки
app.post('/generate-payment', async (req, res) => {
  try {
    console.log('Получен запрос на генерацию платежной ссылки');
    const { ipn, policy_number, amount } = req.body;

    // Валидация данных
    if (!ipn || !policy_number || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствуют обязательные поля: ipn, policy_number, amount'
      });
    }

    // Генерация ссылки
    const result = await generatePaymentLink({
      ipn,
      policy_number,
      amount
    });

    res.json(result);

  } catch (error) {
    console.error('Ошибка при генерации ссылки:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
}).on('error', (err) => {
  console.error('Ошибка при запуске сервера:', err);
});
