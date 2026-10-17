import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { openDatabase } from './db.ts';

try {
  process.loadEnvFile?.('.env');
} catch {
  // .env dosyası opsiyonel
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? (isProd ? '127.0.0.1' : 'localhost');
const dataDir = path.resolve(root, process.env.DATA_DIR ?? 'data');
const uploadDir = path.resolve(root, process.env.UPLOAD_DIR ?? 'uploads');

const username = process.env.ADMIN_USERNAME ?? 'admin';
const password = process.env.ADMIN_PASSWORD ?? (isProd ? '' : 'd2fda.admin');
const secret = process.env.SESSION_SECRET ?? (isProd ? '' : 'dev-secret-degistirin');

if (!password || !secret) {
  console.error('ADMIN_PASSWORD ve SESSION_SECRET ortam değişkenleri production ortamında zorunludur.');
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD) {
  console.warn('Uyarı: ADMIN_PASSWORD tanımlı değil, geliştirme için varsayılan admin şifresi kullanılıyor.');
}

const db = openDatabase(path.join(dataDir, 'kale2.db'));
const app = createApp({
  db,
  uploadDir,
  importPrivateDir: path.join(dataDir, 'import-private'),
  auth: { username, password, secret, secureCookie: process.env.COOKIE_SECURE === 'true' },
  publicWiki: process.env.PUBLIC_WIKI !== 'false',
  clientDir: isProd ? path.join(root, 'dist/client') : undefined,
});

app.listen(port, host, () => {
  console.log(`Kale2 yönetim paneli API'si http://localhost:${port} adresinde çalışıyor`);
});
