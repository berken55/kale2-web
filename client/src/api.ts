export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
  }
}

export const UNAUTHORIZED_EVENT = 'kale2:unauthorized';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, data.error ?? `İstek başarısız (${res.status})`, data.issues);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T = void>(url: string) => request<T>('DELETE', url),
};

/** Yükleme ilerlemesini raporlayabilmek için XHR ile dosya gönderir. */
export function uploadFile<T>(url: string, file: File, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* boş yanıt */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(xhr.status, data.error ?? `Yükleme başarısız (${xhr.status})`));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Ağ hatası, yükleme tamamlanamadı.'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
