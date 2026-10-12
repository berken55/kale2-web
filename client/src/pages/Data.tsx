import { useRef, useState } from 'react';
import { api } from '../api';
import { PageHeader, Spinner, useConfirm, useToast } from '../components/ui';

interface ImportResult {
  bonusTypesCreated: number;
  itemsCreated: number;
  itemsUpdated: number;
}

export function DataPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const importFile = async (file: File) => {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return toast('error', 'Dosya geçerli bir JSON değil.');
    }
    const count = Array.isArray((data as { items?: unknown[] }).items) ? (data as { items: unknown[] }).items.length : 0;
    if (
      !(await confirm({
        title: 'İçe aktarılsın mı?',
        message: `${count} item içe aktarılacak. Aynı vnum'a sahip mevcut itemlerin bilgileri dosyadakilerle değiştirilir (ikon ve 3D modeller korunur).`,
        confirmText: 'İçe aktar',
      }))
    )
      return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api.post<ImportResult>('/api/import/json', data);
      setResult(r);
      toast('success', 'İçe aktarma tamamlandı.');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="İçe / Dışa Aktar" subtitle="Item veritabanını yedekleyin, sunucular arasında taşıyın veya oyun sunucusu için dışa aktarın" />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-display text-lg text-gold-300">Dışa aktar</h2>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-white/5 bg-ink-850 p-4">
              <div className="font-medium text-slate-200">JSON yedeği</div>
              <p className="mt-1 text-sm text-slate-400">
                Tüm itemler, güç değerleri, bonuslar ve yükseltme tabloları. Bu panele geri yüklenebilir. İkon ve 3D model dosyaları dahil değildir.
              </p>
              <a href="/api/export/json" className="btn-primary mt-3">
                kale2-items.json indir
              </a>
            </div>
            <div className="rounded-lg border border-white/5 bg-ink-850 p-4">
              <div className="font-medium text-slate-200">item_proto (sekmeyle ayrılmış)</div>
              <p className="mt-1 text-sm text-slate-400">
                Metin2 item_proto düzenine benzer metin dosyası: tip/alt tip, ANTI_* bayrakları, saldırı/savunma değerleri ve ilk 6 bonus (APPLY_*). Kendi sunucu
                kaynağınıza göre sütunları uyarlamanız gerekebilir.
              </p>
              <a href="/api/export/item_proto.txt" className="btn-ghost mt-3">
                item_proto.txt indir
              </a>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-display text-lg text-gold-300">İçe aktar</h2>
          <p className="mt-4 text-sm text-slate-400">
            Bu panelden alınmış bir <span className="text-slate-200">kale2-items.json</span> dosyasını yükleyin. Eksik bonus tanımları otomatik oluşturulur. Dosyadaki
            herhangi bir item geçersizse hiçbir değişiklik uygulanmaz.
          </p>
          <button className="btn-primary mt-4" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy && <Spinner />} JSON dosyası seç
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = '';
            }}
          />
          {result && (
            <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                ['Yeni item', result.itemsCreated],
                ['Güncellenen', result.itemsUpdated],
                ['Yeni bonus', result.bonusTypesCreated],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/5 bg-ink-850 p-3">
                  <dd className="font-display text-2xl text-slate-100">{value}</dd>
                  <dt className="text-xs text-slate-500">{label}</dt>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
    </>
  );
}
