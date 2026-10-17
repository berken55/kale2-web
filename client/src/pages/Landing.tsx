import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import '../marketing.css';

/** Sunucudaki son sürüm: /indir/latest.json (deploy/nginx.conf). Okunamazsa sabit adres. */
interface LatestBuild {
  version: string;
  file: string;
  size: number;
  sha256: string;
  date: string;
}
const FALLBACK_DOWNLOAD = '/indir/Kale2-2026.10.17-1.zip';
const formatSize = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

const regions = [
  { id: 'ork', name: 'ORK VADİSİ', type: 'VAHŞİ DOĞA / KEŞİF', description: 'Ormanlık yamaçların arasındaki bu vadi, kestirme arayan savaşçıları ödüllendirir. Yaratık kampları ve dar geçitler kontrolü ele geçirmek için önemlidir.' },
  { id: 'spider', name: 'ÖRÜMCEK ZİNDANI', type: 'KARANLIK ZİNDAN / RİSK', description: 'Koyu dağların sardığı izole bir çanak. Dış dünyanın ışığı kaybolurken dar geçitler ve örümcek yuvası daha tehlikeli bir rota açar.' },
  { id: 'desert', name: 'ÇÖL HARABELERİ', type: 'KUMULLAR / HARABELER', description: 'Kumların yuttuğu eski taşlar ve açık görüş alanları. Burada saklanacak orman yok; doğru zamanı seçmek her şeydir.' },
  { id: 'fire', name: 'ATEŞ DİYARI', type: 'VOLKANİK BÖLGE / GÜÇ', description: 'Lav çatlaklarının aydınlattığı dağlar arasında savaş sertleşir. Geçitleri tutan taraf bu tehlikeli bölgenin gücünü ele geçirir.' },
  { id: 'metin', name: 'METİN VADİSİ', type: 'MERKEZ / BOSS ALANI', description: 'Haritanın kalbinde yükselen Metin taşları, iki krallığı aynı hedefe çağırır. Merkezdeki mücadele savaşın ritmini değiştirir.' },
] as const;

function Brand() {
  return <span className="brand"><span className="brand-mark" aria-hidden="true">♜</span><span className="brand-copy"><strong>KALE SAVAŞLARI</strong><small>5 VS 5 · TEK BİR ZAFER</small></span></span>;
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [regionIndex, setRegionIndex] = useState(0);
  const [preview, setPreview] = useState<{ src: string; caption: string } | null>(null);
  const [shareStatus, setShareStatus] = useState('');
  const [latest, setLatest] = useState<LatestBuild | null>(null);
  const downloadUrl = latest ? `/indir/${latest.file}` : FALLBACK_DOWNLOAD;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedRegion = regions[regionIndex];

  useEffect(() => {
    document.title = 'Kale Savaşları — İyi olan kazansın';
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('is-visible')), { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fetch('/indir/latest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: LatestBuild | null) => b?.file && setLatest(b))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (preview) dialogRef.current?.showModal();
    else if (dialogRef.current?.open) dialogRef.current.close();
  }, [preview]);

  const chooseRegion = (index: number, focus = false) => {
    setRegionIndex(index);
    if (focus) requestAnimationFrame(() => document.getElementById(`region-${regions[index].id}`)?.focus());
  };

  const regionKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? regions.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + regions.length) % regions.length;
    chooseRegion(next, true);
  };

  const share = async () => {
    const data = { title: document.title, text: 'Kale Savaşları — İyi olan kazansın', url: window.location.href };
    try {
      if (navigator.share) { await navigator.share(data); setShareStatus('Paylaşım hazır.'); }
      else if (navigator.clipboard) { await navigator.clipboard.writeText(data.url); setShareStatus('Sayfa bağlantısı kopyalandı.'); }
      else setShareStatus('Bağlantıyı adres çubuğundan kopyalayabilirsin.');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setShareStatus('Paylaşım açılamadı; bağlantıyı adres çubuğundan kopyalayabilirsin.');
    }
  };

  const heroMove = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mouse-x', `${((event.clientX - rect.left) / rect.width - .5) * 16}px`);
    event.currentTarget.style.setProperty('--mouse-y', `${((event.clientY - rect.top) / rect.height - .5) * 10}px`);
  };

  return (
    <div className="marketing-site">
      <a className="skip-link" href="#main">İçeriğe geç</a>
      <header className="site-header" id="top">
        <a href="#top" aria-label="Kale Savaşları ana sayfa"><Brand /></a>
        <nav className="desktop-nav" aria-label="Ana menü"><a href="#oyun">OYUN</a><a href="#dunya">DÜNYA</a><a href="#goruntuler">GÖRÜNTÜLER</a><a href="#indir">İNDİR</a></nav>
        <a className="header-action" href="#indir">OYUNU İNDİR <span aria-hidden>↓</span></a>
        <button className="menu-toggle" type="button" aria-label={menuOpen ? 'Menüyü kapat' : 'Menüyü aç'} aria-controls="mobile-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}><span /><span /><span /></button>
        <nav className="mobile-nav" id="mobile-menu" aria-label="Mobil menü" hidden={!menuOpen}><a href="#oyun" onClick={() => setMenuOpen(false)}>OYUN</a><a href="#dunya" onClick={() => setMenuOpen(false)}>DÜNYA</a><a href="#goruntuler" onClick={() => setMenuOpen(false)}>GÖRÜNTÜLER</a><a className="mobile-download" href="#indir" onClick={() => setMenuOpen(false)}>OYUNU İNDİR ↓</a></nav>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title" onMouseMove={heroMove}>
          <div className="hero-image" role="img" aria-label="Mavi ve kızıl krallığın kaleleri arasındaki savaş alanı" />
          <div className="hero-runes" aria-hidden><i /><i /><i /></div>
          <div className="hero-content page-width">
            <div className="eyebrow hero-eyebrow"><span className="eyebrow-line" /> TAKIMINI TOPLA. KALEYİ ELE GEÇİR.</div>
            <h1 id="hero-title"><span className="hero-versus">5-5</span><br />KALE <em>SAVAŞI</em></h1>
            <div className="battle-facts" aria-label="Oyun özellikleri"><span className="match-time"><strong>30</strong> DAKİKA</span><span className="fair-play">PAY2WIN <b aria-label="yok">✕</b></span></div>
            <p className="loot-line">BOSS <i>/</i> METİN <i>/</i> SANDIK <i>/</i> ŞANS</p>
            <p className="hero-motto">İyi olan kazansın<span>.</span></p>
            <div className="hero-actions"><a className="button button-primary" href={downloadUrl} download><span>ÜCRETSİZ İNDİR</span><span aria-hidden>↓</span></a><a className="text-link" href="#indir"><span className="play-symbol" aria-hidden>▶</span> NASIL KURULUR</a></div>
          </div>
          <div className="hero-bottom page-width"><span>5 OYUNCU <i /> 30 DAKİKA <i /> TEK HEDEF: ZAFER</span><a href="#oyun">SAVAŞI KEŞFET <span aria-hidden>↓</span></a></div>
        </section>

        <section className="intro-section section-shell" id="oyun" aria-labelledby="intro-title"><div className="page-width reveal"><div className="section-label"><span>01</span> / OYUNUN ÖZÜ</div><div className="intro-grid"><div><h2 id="intro-title">BEŞE BEŞ.<br /><span>OMUZ OMUZA.</span><br />KALEYE KADAR.</h2></div><div className="intro-right"><p>Kale Savaşları, Metin tarzı maceranın keşif, yaratık ve ganimet hissini takım odaklı bir kule savaşında buluşturuyor. Yolunu seç; vadilerden, karanlık zindanlardan ve volkanik geçitlerden güç toplayarak rakip kaleye ilerle.</p><a className="inline-link" href="#dunya">SAVAŞ ALANINI İNCELE <span aria-hidden>↗</span></a></div></div><div className="feature-grid"><article className="feature"><span className="feature-number">01</span><span className="feature-icon" aria-hidden>⚔</span><h3>5-5 KALE SAVAŞI</h3><p>Yolları kontrol et, kuleleri aş ve rakibin kalesine ulaş.</p></article><article className="feature"><span className="feature-number">02</span><span className="feature-icon" aria-hidden>◆</span><h3>BOSS / METİN / SANDIK</h3><p>Savaş alanındaki taşları kır, güç kazan ve gidişatı değiştir.</p></article><article className="feature"><span className="feature-number">03</span><span className="feature-icon" aria-hidden>♜</span><h3>30 DAKİKA. TAM REKABET.</h3><p>Pay2Win yok. Takım oyunun, kararların ve biraz da şansın konuşsun.</p></article></div></div></section>

        <section className="showcase-section" aria-labelledby="showcase-title"><div className="showcase-photo" /><div className="page-width showcase-content"><div className="showcase-copy reveal"><div className="section-label"><span>02</span> / SAHAYA İN</div><h2 id="showcase-title">HER YOL<br /><em>BİR SEÇİM.</em><br />HER SEÇİM<br />BİR SAVAŞ.</h2><p>Alıştığın dünyaya başka bir gözle bak. Köprüyü tut, ormanda izini kaybettir ya da tehlikeyi göze alıp gizli geçitten ilerle.</p><a className="button button-outline" href="#goruntuler">OYUNU GÖRÜNTÜLE <span aria-hidden>↗</span></a></div></div><div className="photo-credit">OYUN İÇİ GÖRÜNTÜ / GELİŞTİRME SÜRÜMÜ</div></section>

        <section className="world-section section-shell" id="dunya" aria-labelledby="world-title"><div className="page-width reveal"><div className="section-label"><span>03</span> / DÜNYA</div><div className="world-heading"><h2 id="world-title">HARİTANIN HER KÖŞESİ<br /><span>BAŞKA BİR MÜCADELE.</span></h2><p>Savaş alanı tek bir yol değil. Her bölge farklı bir risk, farklı bir fırsat taşıyor.</p></div><div className="world-panel"><button className="world-art open-image" type="button" onClick={() => setPreview({ src: '/assets/world-concept.webp', caption: 'Dünya haritası konsepti' })} aria-label="Dünya haritası konseptini büyüt"><img src="/assets/world-concept.webp" alt="İki kale ve farklı biyomları gösteren dünya haritası konsepti" loading="lazy" /><span className="image-tag">DÜNYA HARİTASI KONSEPTİ</span><span className="zoom-corner" aria-hidden>↗</span></button><div className="world-info"><span className="world-index">KEŞFEDİLECEK BÖLGELER / 05</span><div className="region-list" role="tablist" aria-label="Bölgeler">{regions.map((region, index) => <button key={region.id} className={`region ${index === regionIndex ? 'active' : ''}`} type="button" role="tab" id={`region-${region.id}`} aria-controls="region-panel" aria-selected={index === regionIndex} tabIndex={index === regionIndex ? 0 : -1} onClick={() => chooseRegion(index)} onKeyDown={e => regionKey(e, index)}><span>{String(index + 1).padStart(2, '0')}</span> {region.name} <b aria-hidden>↗</b></button>)}</div><div className="region-detail" id="region-panel" role="tabpanel" aria-labelledby={`region-${selectedRegion.id}`} tabIndex={0}><span>{selectedRegion.type}</span><h3>{selectedRegion.name}</h3><p>{selectedRegion.description}</p></div></div></div></div></section>

        <section className="gallery-section section-shell" id="goruntuler" aria-labelledby="gallery-title"><div className="page-width reveal"><div className="section-label"><span>04</span> / OYUN İÇİ GÖRÜNTÜLER</div><div className="gallery-heading"><h2 id="gallery-title">DÜNYANIN <span>İÇİNDEN.</span></h2><p>Geliştirme sürümünden gerçek oyun görüntüleri.</p></div><div className="gallery-grid"><button className="gallery-card open-image" type="button" onClick={() => setPreview({ src: '/assets/gameplay-warrior.webp', caption: 'Savaşçı ve açık alan — oyun içi görüntü' })}><img src="/assets/gameplay-warrior.webp" alt="Savaşçı karakterin yeşil vadide ilerlediği oyun içi görüntü" loading="lazy" /><span className="gallery-caption"><small>OYUN İÇİ / 01</small><strong>SAVAŞÇININ YOLU</strong></span><span className="gallery-arrow" aria-hidden>↗</span></button><button className="gallery-card open-image" type="button" onClick={() => setPreview({ src: '/assets/gameplay-battlefield.webp', caption: 'Kızıl orman — oyun içi görüntü' })}><img src="/assets/gameplay-battlefield.webp" alt="Kızıl ormandaki yolun oyun içi görüntüsü" loading="lazy" /><span className="gallery-caption"><small>OYUN İÇİ / 02</small><strong>KIZIL ORMAN</strong></span><span className="gallery-arrow" aria-hidden>↗</span></button></div></div></section>

        <section className="download-section section-shell" id="indir" aria-labelledby="download-title"><div className="page-width reveal"><div className="section-label"><span>05</span> / OYUNU İNDİR</div><div className="download-grid"><div className="download-copy"><h2 id="download-title">SAVAŞA<br /><span>KATIL.</span></h2><p>Kale Savaşları’nın geliştirme sürümünü ücretsiz indir ve savaş alanına ilk adımını at. Dosya tek tıkla, doğrudan iner.</p><div className="download-actions"><a className="button button-primary" href={downloadUrl} download><span>OYUNU İNDİR</span><span aria-hidden>↓</span></a><span className="text-link">{latest ? `SÜRÜM ${latest.version} · ${formatSize(latest.size)} · WINDOWS` : 'WINDOWS · ZIP'}</span></div></div><ol className="download-steps"><li><span>01</span><div><h3>İNDİR'E TIKLA</h3><p>“Oyunu İndir” düğmesine bas; ZIP dosyası doğrudan iner. Yarıda kalırsa tarayıcıdan devam ettirebilirsin.</p></div></li><li><span>02</span><div><h3>KLASÖRE ÇIKAR</h3><p>ZIP dosyasına sağ tıkla → “Tümünü ayıkla”. Kale2 klasöründe Kale2.exe ve Kale2.pck yan yana olmalı.</p></div></li><li><span>03</span><div><h3>BAŞLAT</h3><p>Kale2.exe’yi çalıştır. Windows uyarı verirse “Ek bilgi” → “Yine de çalıştır”. Yeni sürüm çıkınca buradan tekrar indir.</p></div></li></ol></div></div></section>

        <section className="closing-section" aria-labelledby="closing-title"><div className="closing-backdrop" /><div className="page-width closing-content reveal"><div className="section-label"><span>06</span> / SAVAŞ ÇAĞRISI</div><h2 id="closing-title">İYİ OLAN<br /><em>KAZANSIN.</em></h2><p>Kale Savaşları geliştirme aşamasında. Oyunu indir, arkadaşlarını da bu dünyaya çağır.</p><div className="closing-actions"><a className="button button-primary" href={downloadUrl} download><span>OYUNU İNDİR</span><span aria-hidden>↓</span></a><button className="button button-outline share-button" type="button" onClick={share}>SAYFAYI PAYLAŞ <span aria-hidden>↗</span></button><a className="text-link" href="#top">BAŞA DÖN <span aria-hidden>↑</span></a></div><p className="share-status" role="status" aria-live="polite">{shareStatus}</p></div></section>
      </main>

      <footer className="footer"><div className="page-width footer-inner"><a href="#top"><Brand /></a><span>© {new Date().getFullYear()} Kale Savaşları. GELİŞTİRME SÜRÜMÜ.</span><a href="#top">YUKARI DÖN ↑</a></div></footer>
      <dialog ref={dialogRef} className="image-dialog" aria-label="Görsel önizleme" onClose={() => setPreview(null)} onClick={(e) => { if (e.target === dialogRef.current) setPreview(null); }}><button className="dialog-close" type="button" aria-label="Görseli kapat" onClick={() => setPreview(null)}>×</button>{preview && <><img src={preview.src} alt={preview.caption} /><p>{preview.caption}</p></>}</dialog>
    </div>
  );
}
