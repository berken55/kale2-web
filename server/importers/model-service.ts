import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FetchError, isAllowedUrl } from './fetch.ts';

const worker = fileURLToPath(new URL('../../services/model-downloader/bridge.py', import.meta.url));
const workerDir = path.dirname(worker);
const supported = new Set(['metin2alerts.com', 'www.metin2alerts.com', 'm2icondb.com', 'www.m2icondb.com']);
let active = 0;

export function isModelSource(raw: string) {
  try {
    const u = new URL(raw);
    return isAllowedUrl(raw) && supported.has(u.hostname) &&
      (/^\/(?:item\/\d+\/?|monster\/[A-Za-z0-9_-]+\/?|3d)$/.test(u.pathname) && u.hostname.endsWith('m2icondb.com') ||
       /\/wiki\/(mob|npc)\/\d+(?:-[^/]+)?\/?$/.test(u.pathname) && u.hostname.endsWith('metin2alerts.com'));
  } catch { return false; }
}

export function runWorker<T>(body: Record<string, unknown>): Promise<T> {
  if (active >= 2) return Promise.reject(new FetchError('İndirme servisi meşgul; biraz sonra tekrar deneyin.', 429));
  active++;
  return new Promise((resolve, reject) => {
    const python = process.env.MODEL_DOWNLOADER_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const child = execFile(python, [worker], {
      cwd: workerDir,
      timeout: 180_000,
      maxBuffer: 12 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8',
    }, (error, stdout, stderr) => {
        active--;
        try {
          const result = JSON.parse(stdout) as T & { error?: string };
          if (result.error) reject(new FetchError(result.error, 502));
          else if (error) reject(new FetchError('İndirme servisi tamamlanamadı.', 502));
          else resolve(result);
        } catch {
          const detail = (stderr || stdout || error?.message || '').trim().split('\n').slice(-3).join(' ');
          reject(new FetchError(
            detail
              ? `İndirme servisi çalıştırılamadı: ${detail.slice(0, 240)}`
              : 'İndirme servisi çalıştırılamadı. Python 3.10+ kurulu olduğundan ve services/model-downloader/requirements.txt yüklendiğinden emin olun (MODEL_DOWNLOADER_PYTHON).',
            502,
          ));
        }
      });
    child.stdin?.on('error', () => {});
    child.stdin?.end(JSON.stringify(body));
  });
}

export async function protectedPage(url: string, cookieFile?: string) {
  if (!isAllowedUrl(url) || !supported.has(new URL(url).hostname)) throw new FetchError('İzin verilmeyen adres.');
  return (await runWorker<{ html: string }>({ action: 'page', url, cookieFile })).html;
}

export async function protectedIcon(url: string, cookieFile?: string) {
  if (!isAllowedUrl(url) || !supported.has(new URL(url).hostname)) throw new FetchError('İzin verilmeyen ikon adresi.');
  const result = await runWorker<{ data: string; contentType: string }>({ action: 'asset', url, cookieFile });
  const body = Buffer.from(result.data, 'base64');
  if (body.length > 2 * 1024 * 1024) throw new FetchError('İkon boyutu sınırı aşıldı.', 413);
  return { body, contentType: result.contentType, url };
}

export async function downloadModel(url: string, cookieFile?: string) {
  if (!isModelSource(url)) throw new FetchError('Desteklenmeyen model bağlantısı.');
  const tempRoot = process.env.MODEL_DOWNLOADER_TEMP_DIR || os.tmpdir();
  await fs.promises.mkdir(tempRoot, { recursive: true });
  const temp = await fs.promises.mkdtemp(path.join(tempRoot, 'kale2-model-'));
  try {
    const output = path.join(temp, 'model.glb');
    const result = await runWorker<{ filename: string; warnings: string[] }>({ action: 'download', url, cookieFile, output });
    const data = await fs.promises.readFile(output);
    return { ...result, data };
  } finally {
    await fs.promises.rm(temp, { recursive: true, force: true });
  }
}
