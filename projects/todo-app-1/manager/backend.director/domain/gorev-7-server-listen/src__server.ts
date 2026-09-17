import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const server = app.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} üzerinde çalışıyor.`);
});

const gracefulShutdown = (signal: string) => {
  console.log(`${signal} sinyali alındı. Sunucu kapatılıyor...`);

  server.close(() => {
    console.log('Tüm HTTP bağlantıları kapatıldı. İşlem sonlandırılıyor.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Zorunlu kapatma: Bağlantılar zamanında kapatılamadı.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
