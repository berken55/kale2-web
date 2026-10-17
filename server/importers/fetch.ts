/**
 * Yalnızca izin verilen alan adlarından, boyut ve süre sınırıyla veri indirir.
 * Yönlendirmeler tek tek kontrol edilir; böylece izinli bir adres bizi
 * iç ağa veya başka bir siteye yönlendiremez.
 */

export class FetchError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const DEFAULT_ALLOWED = ['metin2alerts.com', 'm2icondb.com'];

export function allowedHosts(): string[] {
  const env = process.env.IMPORT_ALLOWED_HOSTS;
  const extra = env ? env.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean) : [];
  return [...DEFAULT_ALLOWED, ...extra];
}

/** Alan adının kendisi veya bir alt alan adı izinliyse true. */
export function isAllowedUrl(raw: string, hosts = allowedHosts()): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
  const host = url.hostname.toLowerCase();
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

export interface FetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  accept?: string;
}

export interface FetchResult {
  url: string;
  contentType: string;
  body: Buffer;
}

export async function safeFetch(raw: string, { maxBytes, timeoutMs = 20_000, accept = '*/*' }: FetchOptions): Promise<FetchResult> {
  let current = raw;
  for (let hop = 0; hop < 4; hop++) {
    if (!isAllowedUrl(current)) throw new FetchError(`İzin verilmeyen adres: ${current}`);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'Mozilla/5.0 (Kale2 Admin Importer)', Accept: accept },
      });
    } catch (e) {
      const reason = e instanceof Error && e.name === 'TimeoutError' ? 'zaman aşımı' : 'bağlantı kurulamadı';
      throw new FetchError(`Kaynağa ulaşılamadı (${reason}).`, 502);
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new FetchError('Kaynak geçersiz bir yönlendirme döndürdü.', 502);
      current = new URL(location, current).toString();
      continue;
    }
    if (!res.ok) {
      throw new FetchError(res.status === 404 ? 'Kaynakta bu sayfa bulunamadı (404).' : `Kaynak hata döndürdü (${res.status}).`, 502);
    }
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new FetchError('Dosya boyutu sınırı aşıldı.', 413);

    const chunks: Buffer[] = [];
    let size = 0;
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new FetchError('Dosya boyutu sınırı aşıldı.', 413);
        }
        chunks.push(Buffer.from(value));
      }
    }
    return { url: current, contentType: res.headers.get('content-type') ?? '', body: Buffer.concat(chunks) };
  }
  throw new FetchError('Çok fazla yönlendirme.', 502);
}
