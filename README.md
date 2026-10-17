# METİN3 Website ve Kale2 Yönetim Paneli

METİN3 tanıtım sitesi ile Metin2 tarzı MMORPG item yönetim panelini aynı uygulamada barındırır. Ana adres oyunculara açık websiteyi, `/admin` yönetim panelini ve `/wiki` item veritabanını sunar.

Panelden şunları yapabilirsiniz:

- **Item tanımlama:** Silah (kılıç, çift el, hançer, yay, çan, yelpaze, pençe), zırh ve ekipman (zırh, kask, kalkan, bilezik, ayakkabı, kolye, küpe), kostüm, kemer, kullanılabilir item ve malzeme tanımlanabilir. Her item için vnum, nadirlik, gereken seviye, sınıf ve cinsiyet kısıtı, fiyatlar, ticaret izni ve açıklama girilebilir.
- **Güç değerleri:** Fiziksel ve büyülü saldırı aralıkları, saldırı hızı ve savunma.
- **Bonuslar (efsunlar):** Her iteme en fazla 10 sabit bonus eklenebilir. Bonus değerleri, bonus tanımında belirlenen üst sınırla kontrol edilir.
- **Yükseltme tabloları:** +0 … +15 arası her seviye için saldırı, büyü saldırısı ve savunma artışı, başarı şansı, Yang maliyeti ve gerekli malzemeler (vnum × adet). Otomatik tablo oluşturucu da var.
- **İkon ve 3D model yükleme:** GLB, GLTF, OBJ ve FBX dosyaları yüklenebilir. Yüklenen model tarayıcıda döndürülüp yakınlaştırılabilir; tel kafes görünümü de var.
- **Oyun içi önizleme:** Itemin oyunda nasıl görüneceğini gösteren tooltip. Seçilen yükseltme seviyesine göre değerler güncellenir.
- **Bonus tanımları:** 35 klasik Metin2 bonusu hazır gelir. Bunlar düzenlenebilir, yenileri eklenebilir.
- **İçe / dışa aktarma:** JSON yedek ve geri yükleme ile `item_proto` benzeri, sekmeyle ayrılmış dışa aktarma.
- **Linkten içe aktarma:** metin2alerts.com'daki bir item linkini yapıştırarak isim, seviye, sınıf, güç değerleri, bonuslar, +0…+N yükseltme tablosu, ikon ve 3D model okunabilir. Veriler düzenleyicide taslak olarak açılır; ayrıntılar aşağıda.
- **Item Wiki (`/wiki`):** Oyuncuların giriş yapmadan gezebileceği item veritabanı. Ayrıntıları aşağıda.
- Genel bakış ekranı, değişiklik geçmişi, item kopyalama, arama, filtreleme ve sayfalama.

## Linkten içe aktarma

**Itemler → Linkten içe aktar** menüsüne `https://metin2alerts.com/en/wiki/item/180-poison-sword` gibi bir item linki yapıştırın. Akış şöyle işler:

1. Sunucu sayfayı indirir ve okur. Okunan alanlar ve uyarılar bir önizleme penceresinde gösterilir. Tip ve alt tip burada düzeltilebilir.
2. Panelde tanımlı olmayan yükseltme malzemeleri tek tıkla **Malzeme** olarak içe aktarılabilir.
3. **Düzenleyicide aç** dendiğinde item, formu doldurulmuş ama **kaydedilmemiş** bir taslak olarak açılır. Her alan düzenlenebilir.
4. Kaydedince, seçildiyse kaynaktaki ikon ve 3D model sunucuya indirilir.
5. Aynı vnum zaten varsa, mevcut item güncellenebilir ya da yeni bir vnum ile ayrı item oluşturulabilir.
6. Kaynak link item'da saklanır. Düzenleyicideki **Kaynaktan güncelle** butonu verileri yeniden okuyup forma uygular; kaydetmezseniz hiçbir şey değişmez.

**Güvenlik:** Sunucu yalnızca `https://` ile başlayan ve izin verilen alan adlarından (varsayılan olarak `metin2alerts.com` ve alt alan adları) veri indirir. Yönlendirmeler tek tek kontrol edilir. Sayfa için 3 MB, ikon için 2 MB, model için 50 MB boyut sınırı vardır. Ek alan adları `IMPORT_ALLOWED_HOSTS` ile tanımlanır.

> **Not:** metin2alerts okuyucusu (`server/importers/metin2alerts.ts`), site geliştirme ortamından erişilemediği için gerçek sayfa görülmeden yazıldı. Bilinen adres yapısına ve sayfalarda geçen metinlere dayanıyor. Gerçek sayfalarla doğrulanması ve gerektiğinde düzeltilmesi gerekiyor. Okunamayan alanlar taslakta boş kalır ve önizlemede işaretlenir. Testlerde kullanılan `tests/fixtures/metin2alerts-approx.html` elle yazılmış yaklaşık bir örnektir.

Başka bir site eklemek için `server/importers/` altına `SiteImporter` arayüzünü uygulayan bir modül yazıp `IMPORTERS` listesine eklemeniz yeterli.

## Item Wiki

`/wiki` adresi, panelde tanımlanan itemleri oyunculara gösteren salt okunur bir veritabanıdır ve giriş gerektirmez.

- **Kategoriler:** Kılıç, çift el, hançer, yay, çan, yelpaze, pençe, zırh, kask, kalkan, bilezik, ayakkabı, kolye, küpe, kemer ve diğerleri.
- **Kategori listesi:** Üstteki +0 … +9 seçiciyle tüm itemlerin o seviyedeki saldırı, büyülü saldırı ve savunma değerleri gösterilir. O seviyeye yükseltilemeyen itemler kendi en yüksek seviyesiyle ve soluk renkle görünür.
- **Item sayfası:** Seviye seçici, oyun içi tooltip, 3D model, bonuslar ve yükseltme tablosu. Tabloda her seviye için toplam değerler, başarı şansı, Yang maliyeti, toplam Yang ve gerekli malzemeler yer alır. Malzeme panelde tanımlıysa ikonu ve sayfa bağlantısıyla gösterilir.
- **Seviye vnum'ları:** Metin2 geleneğine göre +N seviyesi `taban vnum + N` ile anılır. Örneğin `/wiki/item/19`, 10 numaralı itemin +9 sayfasını açar.
- **Kapatma:** Wiki'yi yalnızca yöneticilere açmak için `PUBLIC_WIKI=false` ayarlayın.

## Teknoloji

| Katman | Kullanılan |
| --- | --- |
| Sunucu | Node.js, Express, SQLite (better-sqlite3), Zod |
| Arayüz | React 18, Vite, Tailwind CSS, React Router |
| 3D | three.js (GLTF/OBJ/FBX yükleyicileri, OrbitControls) |
| Test | Vitest, Supertest |

Veritabanı tek bir dosyadır (`data/kale2.db`). Yüklenen dosyalar `uploads/` klasöründe tutulur. Ayrı bir veritabanı sunucusu kurmanız gerekmez.

## Kurulum

Node.js 20 veya üstü gerekir.

```bash
npm install
cp .env.example .env   # ADMIN_PASSWORD ve SESSION_SECRET değerlerini değiştirin
npm run dev
```

- Website: http://localhost:5173
- Yönetim paneli: http://localhost:5173/admin
- Item Wiki: http://localhost:5173/wiki
- API: http://localhost:3001

Geliştirme ortamında `.env` dosyası yoksa giriş bilgileri `admin` / `d2fda.admin` olur.

### Production

```bash
npm run build
npm start              # arayüz ve API aynı porttan (PORT, varsayılan 3001) sunulur
```

Production ortamında `ADMIN_PASSWORD` ve `SESSION_SECRET` tanımlanmak zorundadır. Panel HTTPS arkasında çalışıyorsa `COOKIE_SECURE=true` ayarlayın.

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | API ve arayüzü geliştirme modunda başlatır |
| `npm run build` | Arayüzü `dist/client` klasörüne derler |
| `npm start` | Production sunucusunu başlatır |
| `npm test` | API testlerini çalıştırır |
| `npm run typecheck` | TypeScript tip kontrolü yapar |

## Proje yapısı

```
server/   Express API: kimlik doğrulama, itemler, bonuslar, yükleme, içe/dışa aktarma
client/   React arayüzü (sayfalar, bileşenler, 3D görüntüleyici)
shared/   Sunucu ve arayüzün paylaştığı tipler ve oyun sabitleri (item tipleri, sınıflar, bonuslar)
tests/    API testleri
```

Item tipleri, alt tipler, sınıflar ve nadirlik seviyeleri `shared/constants.ts` dosyasında tanımlıdır. Oyununuza özel bir tip eklemek için bu dosyayı düzenlemeniz yeterlidir.

## 3D modeller hakkında

Admin panelindeki **Linkten içe aktar** alanı Metin2Alerts eşya/canavar/NPC ve
m2icondb eşya/canavar/3D bağlantılarını destekler. Model indirme servisi kurulumu,
çerez yükleme ve destek sınırları için [servis belgelerine](services/model-downloader/README.md) bakın.

- **GLB** önerilen formattır: doku ve malzemeler tek dosyada gelir.
- **GLTF** dosyaları yalnızca dokular dosyanın içine gömülüyse doğru görünür.
- Metin2'nin **.gr2** (Granny) dosyaları tarayıcıda açılamaz. Bunları önce Blender gibi bir araçla GLB'ye dönüştürün.
- Dosya boyutu sınırı: model için 50 MB, ikon için 2 MB.

## API

Tüm uç noktalar `/api` altındadır. `/api/auth/*` ve `/api/public/*` dışındakiler oturum gerektirir.

| Yöntem | Yol | Açıklama |
| --- | --- | --- |
| POST | `/api/auth/login`, `/api/auth/logout` | Oturum açma ve kapatma |
| GET | `/api/dashboard` | Özet istatistikler ve son değişiklikler |
| GET | `/api/items` | Liste (`search`, `type`, `subtype`, `rarity`, `class`, `hasModel`, `sort`, `page`, `pageSize`) |
| GET / POST / PUT / DELETE | `/api/items/:id` | Item okuma, oluşturma, güncelleme ve silme |
| POST | `/api/items/:id/clone` | Itemi sıradaki boş vnum ile kopyalar |
| POST / DELETE | `/api/items/:id/icon`, `/api/items/:id/model` | Dosya yükleme ve kaldırma (multipart, `file` alanı) |
| GET / POST / PUT / DELETE | `/api/bonus-types` | Bonus tanımları |
| GET | `/api/export/json`, `/api/export/item_proto.txt` | Dışa aktarma |
| POST | `/api/import/json` | JSON içe aktarma (vnum'a göre ekler veya günceller) |
| POST | `/api/import/url` | Linkten okuyup taslak döndürür (kaydetmez) |
| POST | `/api/items/:id/remote-media` | Kaynaktaki ikon veya 3D modeli indirip iteme bağlar |
| GET | `/api/public/catalog`, `/api/public/items`, `/api/public/items/:vnum` | Wiki için salt okunur uç noktalar (giriş gerektirmez) |
