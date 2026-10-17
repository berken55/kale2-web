import { isAllowedUrl } from './fetch.ts';

/** m2icondb item sayfası gibi bağlantıları indirilebilir dosya adresine çevirir. */
export function resolveRemoteMediaUrl(kind: 'icon' | 'model', rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return rawUrl;
  }
  if (!isAllowedUrl(url.toString())) return rawUrl;
  const host = url.hostname.replace(/^www\./, '');
  const item = url.pathname.match(/^\/item\/(\d+)\/?$/);
  if (host === 'm2icondb.com' && item) {
    if (kind === 'model') return url.toString();
    return `https://m2icondb.com/og/item/${item[1]}`;
  }
  return url.toString();
}
