# Oyuncu lobisi ve beta buluşmaları

29 Ekim 2026

## Oyuncu akışı

- Ana sayfadaki **Kayıt ol / Oyna** → `/oyuncu/kayit`.
- Kayıt başarılı olunca sunucu oyuncu oturumu açar; arayüz doğrudan `/lobi` sayfasına gider.
- Geri dönen oyuncu `/oyuncu/giris` üzerinden giriş yapar. Sayfa yenilendiğinde oturum çerezinden geri yüklenir.
- Lobide savaşçı/ninja seçilir; isim ve uzmanlıkla en fazla altı web önizleme karakteri oluşturulur. Karakterler hesaba bağlı olarak veritabanında saklanır.
- **Maça Başla** → `/indir`. Tarayıcıda maç veya eşleştirme başlatılmaz. Dağıtım mevcut `/indir/latest.json` ve Windows/macOS ZIP adreslerini kullanır.
- Sağdaki gerçek oyuncu listesinden kişi seçilerek özel mesaj gönderilir. Örneğin beta için saat kararlaştırılabilir. Karşı taraf çevrimdışıyken de gönderilen mesaj saklanır.

## Gerçek ve önizleme olan kısımlar

**Gerçek:** kayıt, giriş, çıkış, hesap oturumu, karakter taslaklarının saklanması, oyuncu arama, mesaj geçmişi, okunmamış sayısı, okundu bilgisi ve son görülme.

**Önizleme:** web karakterleri, birinci seviye gösterimi ve uzmanlık seçimi. Oyun hesabı, oyun envanteri, gerçek karakter, maç sırası veya rank ile entegrasyon yoktur. Bu ayrım kayıt/lobi/indirme ekranlarında açıklanır.

## Çevrimiçi ve son görülme

- Oturum açmış, görünür web sayfası 25 saniyede bir `/heartbeat` çağırır. Görünür sayfaya dönüşte hemen çağırır.
- Son 75 saniyede etkinlik bildiren, süresi geçmemiş en az bir oturum varsa oyuncu çevrimiçi görünür.
- Normal çıkışta o oturum silinir. Diğer cihazda etkin oturum varsa oyuncu çevrimiçi kalır.
- Sekme kapandığında veya bağlantı kesildiğinde en geç etkinlik penceresi sonunda çevrimdışı görünür. Bu anlık oyun sunucusu durumu değildir.
- Son görülme UTC milisaniye olarak kalıcı saklanır; arayüz ziyaretçinin yerel saatine göre gösterir.
- Oyuncu listesi 5 saniyede, açık konuşma 3 saniyede bir yenilenir. Gizli sekmede yoklama yapılmaz.

## Backend ve veri

Asıl çalışma dizini `C:\Users\user\Documents\GitHub\kale2-web` dizinidir. Ana sayfa, maç istatistikleri, yönetim paneli ve geri bildirim bölümü bu projeden korunur. `/profil`, `/beta`, `/game` ve `/oyun` eski girişleri yeni `/lobi` ekranına yönlenir; geri bildirim `/feedback` üzerinden kullanılmaya devam eder.

Mevcut `accounts` tablosu tek hesap kaynağıdır; ikinci bir `players` hesap tablosu oluşturulmaz. Eski hesaplar mevcut şifreleriyle kullanıcı adı veya e-posta kullanarak giriş yapabilir. E-posta tekilliği ve yönetici listesindeki hesap sayısı korunur. Yeni kayıtlar da aynı tabloya yazılır.

SQLite dosyasına eklenen tablolar: `player_sessions`, `lobby_characters`, `player_messages`. `accounts` tablosuna `last_seen_at` sütunu eklenir; önceki giriş/kayıt tarihinden başlangıç değeri alınır. Mevcut hesap veya maç kaydı silinmez. Eski `/api/auth/register` ve `/api/player/login` adresleri de aynı yeni oturum sistemini kullanır. Profil okuma ve uzmanlık değiştirme yalnızca oturum sahibinin hesabına izin verir.

- Yönetici çerezi ve oyuncu çerezi ayrıdır. Oyuncu hesabı yönetici API'lerine erişemez.
- Parolalar rastgele salt ile scrypt kullanılarak saklanır. Oturum çerezleri HttpOnly, SameSite=Lax ve 30 gün sürelidir; DB'de tokenın kendisi yerine SHA-256 özeti tutulur.
- Üretimde mevcut `COOKIE_SECURE=true` ayarı HTTPS çerezini etkinleştirir.
- Yazma uçları JSON ve aynı kaynak kontrolü uygular. Kayıt/giriş IP başına 15 dakikada 20 deneme, mesaj gönderimi oyuncu başına dakikada 30 mesaj ile sınırlıdır.
- Oyuncu listesi yalnız ad, kimlik, son görülme, çevrimiçi ve kullanıcıya ait okunmamış sayısını verir. Mesajlar yalnız gönderen/alıcı tarafından okunur; arayüz metin olarak gösterir.
- Liste 50 kişilik sayfalarla, mesajlar 50 kayıtlık geçmişle sunulur. Eski mesajlar ayrıca yüklenebilir.

| Yöntem | `/api/players` altındaki yol | İşlev |
|---|---|---|
| POST | `/register` | Kayıt ve otomatik oturum |
| POST | `/login` | Oyuncu girişi |
| GET | `/me` | Oturum ve oyuncu |
| POST | `/heartbeat` | Web etkinliği |
| POST | `/logout` | Mevcut cihazda çıkış |
| GET | `/members?search=&offset=0` | Oyuncu listesi |
| GET / POST | `/characters` | Önizleme karakterleri |
| GET | `/messages/:playerId?before=&after=` | İkili mesaj geçmişi; before ve after birlikte kullanılamaz |
| POST | `/messages/:playerId` | `{ body }` ile mesaj gönderimi |
| POST | `/messages/:playerId/read` | `{ throughId }` ile gelen mesajların okunması |

## Model hazırlığı

`client/public/assets/characters/` altındaki GLB'ler mevcut oyun modellerinden hazırlanır. Orijinaller korunur; varsayılan gövde/yüz/saç, gömülü dokular ve tek bekleme animasyonu alınır.

```text
python scripts/prepare-lobby-models.py warrior --game-root C:\Users\user\Desktop\codex\kale2
python scripts/prepare-lobby-models.py ninja --game-root C:\Users\user\Desktop\codex\kale2
```

Hazırlık için `--game-root` ile oyun deposu belirtilir. Normal web build'i bu betiği çalıştırmaz; üretilen GLB dosyalarını kullanır. Savaşçı yaklaşık 860 KB, ninja 350 KB'dır. 3D desteklenmeyen tarayıcıda açıklama gösterilir; karakter oluşturma ve mesajlaşma kullanılabilir.

## Çalıştırma ve doğrulama

```text
npm run dev
npm run typecheck
npm test
npm run build
```

Windows PowerShell script politikası `npm.ps1` çalıştırmıyorsa aynı komutlarda `npm.cmd` kullanılabilir.

Yeni `tests/players.test.ts` hesabın otomatik açılması, şifre/çerez saklama, yönetici ayrımı, süre aşımı/çoklu cihaz, mesaj gizliliği, okunma, geçmiş sayfalama, karakter sınırları, kaynak kontrolü ve hız sınırını kapsar.

GitHub çalışma kopyasında 72 test, tip kontrolü ve production build başarılı. İki izole tarayıcı hesabıyla kayıt, yeniden yükleme, iki sınıfta karakter oluşturma, mesajlaşma, okundu, çıkış/son görülme, indirmeye yönlendirme, ana sayfaya dönüş ve mevcut geri bildirim sayfasındaki oturum da kontrol edildi. `3091` yerel önizlemesi bu projenin `dist/client` çıktısını ve mevcut veritabanını kullanır; test hesapları ayrı geçici veritabanında doğrulandı. Bu çalışma canlı sunucuya dağıtım yapmaz.
