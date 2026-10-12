# Kale2 Yönetim Paneli

Metin2 tarzı bir MMORPG için item yönetim paneli. Panelden şunları yapabilirsiniz:

- **Item tanımlama:** Silah (kılıç, çift el, hançer, yay, çan, yelpaze, pençe), zırh ve ekipman (zırh, kask, kalkan, bilezik, ayakkabı, kolye, küpe), kostüm, kemer, kullanılabilir item ve malzeme tanımlanabilir. Her item için vnum, nadirlik, gereken seviye, sınıf ve cinsiyet kısıtı, fiyatlar, ticaret izni ve açıklama girilebilir.
- **Güç değerleri:** Fiziksel ve büyülü saldırı aralıkları, saldırı hızı ve savunma.
- **Bonuslar (efsunlar):** Her iteme en fazla 10 sabit bonus eklenebilir. Bonus değerleri, bonus tanımında belirlenen üst sınırla kontrol edilir.
- **Yükseltme tabloları:** +0 … +15 arası her seviye için saldırı, büyü saldırısı ve savunma artışı, başarı şansı, Yang maliyeti ve gerekli malzemeler (vnum × adet). Otomatik tablo oluşturucu da var.
- **İkon ve 3D model yükleme:** GLB, GLTF, OBJ ve FBX dosyaları yüklenebilir. Yüklenen model tarayıcıda döndürülüp yakınlaştırılabilir; tel kafes görünümü de var.
- **Oyun içi önizleme:** Itemin oyunda nasıl görüneceğini gösteren tooltip. Seçilen yükseltme seviyesine göre değerler güncellenir.
- **Bonus tanımları:** 35 klasik Metin2 bonusu hazır gelir. Bunlar düzenlenebilir, yenileri eklenebilir.
- **İçe / dışa aktarma:** JSON yedek ve geri yükleme ile `item_proto` benzeri, sekmeyle ayrılmış dışa aktarma.
- Genel bakış ekranı, değişiklik geçmişi, item kopyalama, arama, filtreleme ve sayfalama.

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

- Panel: http://localhost:5173
- API: http://localhost:3001

Geliştirme ortamında `.env` dosyası yoksa giriş bilgileri `admin` / `admin` olur.

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

- **GLB** önerilen formattır: doku ve malzemeler tek dosyada gelir.
- **GLTF** dosyaları yalnızca dokular dosyanın içine gömülüyse doğru görünür.
- Metin2'nin **.gr2** (Granny) dosyaları tarayıcıda açılamaz. Bunları önce Blender gibi bir araçla GLB'ye dönüştürün.
- Dosya boyutu sınırı: model için 50 MB, ikon için 2 MB.

## API

Tüm uç noktalar `/api` altındadır ve `/api/auth/*` dışında oturum gerektirir.

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
