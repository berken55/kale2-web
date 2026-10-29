/**
 * Oyun sunucusunun maç / oturum günlüklerini (JSONL) panel veritabanına aktarır. Panel MATCH_LOG_DIR tanımlıysa
 * bunu kendisi dakikada bir yapar; bu betik elle (ya da cron ile) çalıştırmak için.
 *   node --import tsx scripts/import-match-logs.ts [günlük klasörü] [veritabanı]
 * Varsayılanlar: MATCH_LOG_DIR, DATA_DIR/kale2.db.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../server/db.ts';
import { importMatchLogs } from '../server/match-logs.ts';

try {
  process.loadEnvFile?.('.env');
} catch {
  // .env dosyası opsiyonel
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] ?? process.env.MATCH_LOG_DIR;
const dbFile = process.argv[3] ?? path.join(path.resolve(root, process.env.DATA_DIR ?? 'data'), 'kale2.db');

if (!dir) {
  console.error('Günlük klasörü verilmedi (argüman ya da MATCH_LOG_DIR).');
  process.exit(1);
}

const result = importMatchLogs(openDatabase(dbFile), dir);
console.log(`Aktarıldı: ${result.matches} maç, ${result.sessions} oturum satırı; bekleyen maç: ${result.pending}`);
for (const e of result.errors) console.error('  hata:', e);
process.exit(result.errors.length ? 1 : 0);
