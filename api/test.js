export default function handler(req, res) {
  console.log('Тестовый запрос принят');
  res.json({
    message: 'SGTas QR Generator работает!',
    timestamp: new Date().toISOString()
  });
}
