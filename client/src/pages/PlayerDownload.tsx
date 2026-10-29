import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../player-lobby.css';

type Latest = { version: string; file: string; size: number; mac?: { file: string; size: number } };
export function PlayerDownload() {
  const [latest, setLatest] = useState<Latest | null>(null);
  useEffect(() => { document.title = 'Oyunu İndir · KALE2'; void fetch('/indir/latest.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(data => { if (data && typeof data.file === 'string' && /^[A-Za-z0-9._-]+\.zip$/i.test(data.file)) setLatest(data); }).catch(() => {}); }, []);
  const file = (mac: boolean) => { const value = mac ? latest?.mac?.file : latest?.file; return value && /^[A-Za-z0-9._-]+\.zip$/i.test(value) ? `/indir/${encodeURIComponent(value)}` : mac ? '/indir/Kale2-Mac.zip' : '/indir/Kale2.zip'; };
  return <main className="player-download"><header><Link to="/" className="lobby-brand">KALE<span>2</span></Link><Link to="/lobi">← Lobine dön</Link></header><p className="lobby-eyebrow">BİR SONRAKİ ADIM / OYUN İSTEMCİSİ</p><h1>LOBİDEN<br /><em>SAVAŞ ALANINA.</em></h1><p>Gerçek maçlar oyun uygulamasında oynanır.<br />Uygun sürümü indir, arkadaşlarınla aynı saatte buluş.</p><div className="download-platforms"><article><span>01 / WINDOWS</span><h2>KILICINI KUŞAN.</h2><ol><li>Windows paketini indir.</li><li>ZIP dosyasını bir klasöre çıkar.</li><li>Kale2.exe dosyasını çalıştır.</li></ol><a className="lobby-primary" href={file(false)}>WINDOWS İÇİN İNDİR ↓</a></article><article><span>02 / MACOS</span><h2>CEPHEYE KATIL.</h2><ol><li>macOS paketini indir.</li><li>ZIP dosyasını aç.</li><li>Kale2 uygulamasını Uygulamalar'a taşı.</li></ol><a className="lobby-primary" href={file(true)}>MACOS İÇİN İNDİR ↓</a></article></div><p className="download-note">{latest ? `Güncel sürüm: ${latest.version}` : 'İndirme bağlantıları mevcut dağıtım adreslerini kullanır. Paket henüz yayımlanmadıysa indirme kullanılamayabilir.'}<br />Web lobisindeki önizleme karakterleri oyun karakterine dönüşmez. Web hesabı, oyun içi hesap entegrasyonu değildir.</p><Link to="/lobi" className="download-return">ARKADAŞLARINLA BULUŞMA SAATİNİ KONUŞ ↗</Link></main>;
}
