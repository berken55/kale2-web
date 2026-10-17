# Kale2 oyunu ↔ kale2-web entegrasyon raporu

Hedef: köy/lobi haritasını gerçek bir Metin2 köyü gibi yaşatmak (yaratık ve Metin taşı spawnları, bosslar,
mistik olaylar, karakter gelişimi) ve bütün bu oyun verisini **kale2-web panelinden** yönetmek. Oyun
(Godot) veriyi koddan değil panelden alacak; yeni yaratık, item ya da drop eklemek için oyunu yeniden
derlemek gerekmeyecek.

Bu rapor iki projenin bugünkü durumuna bakılarak yazıldı (2026-10-17) ve panelde nelerin eklenip
değişmesi gerektiğini sırayla listeler.

---

## 1. Bugünkü durum

### kale2-web

| Konu | Durum |
| --- | --- |
| Sunucu | Express + SQLite (`data/kale2.db`), `kale2.peasy.com.tr` = `45.87.173.55`, port 3001 (nginx arkasında). **Oyun sunucusuyla aynı makine.** |
| Tablolar | `items`, `item_bonuses`, `item_upgrades`, `bonus_types`, `activity_log` |
| Yaratıklar | **`items` tablosunda** `type = 'MONSTER'` (alt tip `MOB` / `BOSS` / `NPC`) olarak duruyor: 41 kayıt (101 Yabani Köpek … 5163 Maymun Lordu). Saldırı ve savunma item sütunlarında, geri kalan her şey (HP, EXP, STR/DEX…, ırk, rütbe, HP yenilenmesi, `stat:*` ham hücreler) tek bir `monster_stats` JSON metninde. |
| Drop | **Yok.** Hiçbir tabloda “hangi yaratık neyi hangi oranla düşürür” bilgisi yok. |
| Spawn | **Yok.** `data/village1-import/selected.json` içinde yaratıkların hangi Metin2 haritalarında çıktığı (`maps`, `mapIds`) var ama veritabanında değil. |
| Dosyalar | `uploads/icons`, `uploads/models` (12 model, 9.9 MB). Item ve yaratıkların `model_path` alanı buraya işaret ediyor. |
| Oyun için API | **Yok.** `/api/public/*` sadece wiki için (itemler), yaratıkları ayırmıyor; yetkilendirilmiş bir “oyun verisi” uç noktası yok. |

metin2alerts yaratık sayfalarında drop listesi var ama **oranlar yok** (sadece item adı ve ikonu), spawn
yerleri koordinatlarıyla var. Yani drop oranlarını biz belirleyeceğiz; içe aktarıcı en fazla “bu yaratık
şu itemleri düşürür” listesini öneri olarak getirebilir.

### Oyun (Godot)

| Konu | Bugün nereden geliyor |
| --- | --- |
| Yaratık tanımı | `game/data/mobs.json` → `mobs` (24 tür, string id: `wolf`, `orc_lord`…). Alanlar: `name, model, scale, hp, damage[min,max], attack_range, attack_cooldown, walk_speed, run_speed, aggressive, aggro_range, xp, loot_chance, loot_count, yang, yang_chance`. **Statlar 1. seviye için**, `MobSpawner` seviyeye göre ölçekliyor. |
| Spawn | `mobs.json` → `zones`: MOBA haritası için, **kaleye uzaklığa göre** halkalar (`min_distance/max_distance`, `camps`, ağırlıklı `spawns`, bölge başına bir boss). Köy için konum tabanlı spawn yok. |
| Drop | `mob.gd::_die`: `loot_chance` tutarsa `GroundItemSpawner.spawn_random_loot` **rastgele herhangi bir item** düşürür; boss `loot_count` kadar. Yang `mobs.json → yang` kurallarıyla. **Yaratığa özel drop tablosu yok.** |
| Itemler | `modules/inventory/data/items/*.json`, **string kodlu** (`RUSTY_SWORD`); panelde ise **sayısal vnum**. İki katalog birbirinden habersiz. |
| Metin taşı | `game/systems/world/guardian_stone.gd` (`kind = "metin"`): kod içinde üretilen yer tutucu görünüm, rastgele ganimet. |
| Karakter | Seviye, XP, `character_stats.gd` (vit/str/int/dex dağıtımı). **Kalıcı kayıt yok**: oyuncu çıkınca karakter kaybolur. |
| Modeller | `Assets/metin2/monsters/…` (projeye gömülü GLB). |

---

## 2. Önerilen mimari

```
kale2-web (yönetim + tek doğru kaynak)            Godot oyun sunucusu (aynı makine)
┌──────────────────────────────────┐   GET /api/game/bundle    ┌──────────────────────────┐
│ SQLite: items, monsters, drops,  │ ─────────────────────────▶│ açılışta + "yayınla"da   │
│ spawns, maps, exp_table, config  │   (Bearer GAME_API_TOKEN) │ bundle'ı alır, doğrular  │
│ Panel: düzenle → "Yayınla"       │                           │ ve kendi diske yazar     │
│ uploads/: GLB, ikon, minimap     │ ◀─ GET /uploads/... ──────│ eksik modelleri indirir  │
└──────────────────────────────────┘                           └────────────┬─────────────┘
                                                                            │ bağlanan istemciye
                                                                            ▼ bundle sürümü + veri
                                                               Godot istemciler (oyuncular)
```

İlkeler:

1. **Panel tek doğru kaynak.** Oyun `mobs.json`, item JSON'ları gibi dosyaları elle tutmayı bırakır;
   onların yerine panelden gelen **bundle** gelir. Projedeki JSON'lar sadece çevrimdışı/geliştirme için
   yedek kalır.
2. **Taslak / yayın ayrımı.** Panelde yapılan değişiklik hemen oyuna gitmez. “Yayınla” tuşu o anki
   veriden **numaralı, değişmez bir anlık görüntü** (bundle) üretir. Oyun her zaman belirli bir sürümü
   çalıştırır; kötü bir değişiklik bir önceki sürüme dönülerek geri alınır.
3. **Oyun sunucusu yetkilidir.** Drop zarı, spawn, EXP hesabı sunucuda yapılır (hile önleme). İstemciler
   sadece gösterim için gereken kısmı (isim, model, ikon, tooltip) alır.
4. **Sayısal vnum her yerde ortak anahtar.** Item ve yaratıklar oyunda da vnum ile anılır.

---

## 3. Veritabanı değişiklikleri

Aşağıdaki şema mevcut `server/db.ts` tarzında (`CREATE TABLE IF NOT EXISTS` + `migrate()`) eklenmeli.
Oranlar Metin2 geleneğine uygun olarak **yüzde değil, 1/1.000.000 (ppm)** tamsayı tutulur: `%0.05`
gibi çok küçük boss drop oranlarında kayan nokta hatası olmaz. Panel bunu yüzde olarak gösterir.

### 3.1 Yaratıklar `items`'tan ayrılmalı → `monsters`

Yaratık bir item değil; satış fiyatı, bonus, yükseltme tablosu anlamsız, buna karşılık HP/EXP/AI alanları
item tablosunda yok. Bugünkü `monster_stats` JSON'u sorgulanamıyor ve doğrulanamıyor.

```sql
CREATE TABLE monsters (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vnum            INTEGER NOT NULL UNIQUE,          -- Metin2 numarası (101, 691, 8001…)
  code            TEXT NOT NULL UNIQUE,             -- oyundaki kısa ad: 'wolf', 'orc_lord'
  name            TEXT NOT NULL,
  rank            TEXT NOT NULL DEFAULT 'NORMAL',   -- NORMAL | ELITE | BOSS | KING | STONE | NPC
  level           INTEGER NOT NULL,
  race            TEXT NOT NULL DEFAULT '',         -- ANIMAL | HUMAN | ORC | MYSTIC | UNDEAD | DEVIL | INSECT | DESERT
  hp              INTEGER NOT NULL,
  hp_regen_pct    INTEGER NOT NULL DEFAULT 0,       -- her hp_regen_sec saniyede %
  hp_regen_sec    INTEGER NOT NULL DEFAULT 0,
  exp             INTEGER NOT NULL,
  damage_min      INTEGER NOT NULL,
  damage_max      INTEGER NOT NULL,
  defense         INTEGER NOT NULL DEFAULT 0,
  str INTEGER NOT NULL DEFAULT 0, dex INTEGER NOT NULL DEFAULT 0,
  vit INTEGER NOT NULL DEFAULT 0, int INTEGER NOT NULL DEFAULT 0,
  attack_speed    INTEGER NOT NULL DEFAULT 100,
  move_speed      INTEGER NOT NULL DEFAULT 100,
  attack_range    REAL NOT NULL DEFAULT 1.5,        -- metre (oyun birimi)
  aggressive      INTEGER NOT NULL DEFAULT 0,
  aggro_range     REAL NOT NULL DEFAULT 8,
  yang_min        INTEGER NOT NULL DEFAULT 0,       -- 0/0 = genel yang kuralı
  yang_max        INTEGER NOT NULL DEFAULT 0,
  resists         TEXT NOT NULL DEFAULT '{}',       -- {"FIRE":10,"SWORD":-5} (doğrulanmış JSON)
  flags           TEXT NOT NULL DEFAULT '[]',       -- ["NO_KNOCKBACK","REVIVE",...]
  model_path      TEXT, model_scale REAL NOT NULL DEFAULT 1, icon_path TEXT,
  description     TEXT NOT NULL DEFAULT '',
  source_url      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- **Metin taşları da `monsters` içinde, `rank = 'STONE'`** (Metin2'de de öyle: 8001 Hüzün Metni…).
  Taşa özgü davranış ayrı tabloda (3.4).
- **Bosslar** `BOSS`/`KING`. Hangisinin duyurulacağı, ne sıklıkla doğacağı spawn tarafında (3.3).
- **Taşıma (migration):** `items WHERE type='MONSTER'` satırları `monsters`'a aktarılır;
  `monster_stats` JSON'undaki `hp, exp, strength…, hpRegenPercent…` alanları sütunlara, `stat:*`
  ham hücreleri `description`'a ya da atılır. Sonra `ITEM_TYPES`'tan `MONSTER` kaldırılır.
- `code` alanı oyunun bugünkü id'leriyle eşlenir (`101 → wild_dog`, `102 → wolf`, `691 → orc_lord`…)
  böylece oyun tarafı geçişte kırılmaz.

### 3.2 Drop sistemi

Metin2'deki üç katmanı karşılayacak yapı: yaratığa özel drop, birden çok yaratığın paylaştığı drop
grupları ve seviyeye göre genel drop.

```sql
-- Yeniden kullanılabilir drop listesi ("Kurt derisi grubu", "Seviye 20-30 iksirler", "Boss sandığı")
CREATE TABLE drop_groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  roll_mode   TEXT NOT NULL DEFAULT 'EACH',  -- EACH: her satır ayrı zar | ONE_OF: ağırlıklı tek seçim
  rolls       INTEGER NOT NULL DEFAULT 1,     -- ONE_OF için kaç kez seçilir
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE drop_group_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id      INTEGER NOT NULL REFERENCES drop_groups(id) ON DELETE CASCADE,
  item_vnum     INTEGER NOT NULL REFERENCES items(vnum) ON UPDATE CASCADE,
  chance_ppm    INTEGER NOT NULL,      -- EACH: 1/1.000.000 olasılık | ONE_OF: ağırlık
  count_min     INTEGER NOT NULL DEFAULT 1,
  count_max     INTEGER NOT NULL DEFAULT 1,
  upgrade_min   INTEGER NOT NULL DEFAULT 0,   -- düşen silah/zırhın +seviyesi
  upgrade_max   INTEGER NOT NULL DEFAULT 0,
  CHECK (chance_ppm BETWEEN 0 AND 1000000), CHECK (count_min <= count_max)
);

-- Yaratık → drop (doğrudan item veya grup)
CREATE TABLE monster_drops (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  monster_id    INTEGER NOT NULL REFERENCES monsters(id) ON DELETE CASCADE,
  item_vnum     INTEGER REFERENCES items(vnum) ON UPDATE CASCADE,
  group_id      INTEGER REFERENCES drop_groups(id) ON DELETE CASCADE,
  chance_ppm    INTEGER NOT NULL,             -- bu satırın (veya grubun) tetiklenme şansı
  count_min     INTEGER NOT NULL DEFAULT 1,
  count_max     INTEGER NOT NULL DEFAULT 1,
  upgrade_min   INTEGER NOT NULL DEFAULT 0,
  upgrade_max   INTEGER NOT NULL DEFAULT 0,
  CHECK ((item_vnum IS NULL) <> (group_id IS NULL))
);

-- Seviye aralığına göre her yaratıkta geçerli genel drop (Metin2 common_drop_item)
CREATE TABLE level_drops (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  level_min     INTEGER NOT NULL,
  level_max     INTEGER NOT NULL,
  ranks         TEXT NOT NULL DEFAULT '["NORMAL","ELITE"]',  -- hangi rütbelerde geçerli
  item_vnum     INTEGER REFERENCES items(vnum) ON UPDATE CASCADE,
  group_id      INTEGER REFERENCES drop_groups(id) ON DELETE CASCADE,
  chance_ppm    INTEGER NOT NULL,
  CHECK ((item_vnum IS NULL) <> (group_id IS NULL))
);
```

Genel kurallar (`game_config`, bkz. 3.5) bundle'da gider, zar sunucuda atılır:

- **Seviye farkı cezası:** oyuncu yaratıktan çok yüksekse drop şansı düşer
  (`drop_level_penalty: [{diff: 5, mult: 0.8}, {diff: 10, mult: 0.5}, {diff: 15, mult: 0.1}]`).
- **Genel çarpan** (etkinlik: “hafta sonu 2× drop”) ve **Yang kuralı** (bugünkü `mobs.json → yang`).
- **Sahiplik:** düşen item belirli bir süre son vuruşu yapana / en çok hasar verene ait
  (bugünkü `GroundItemSpawner` sahip alanı kullanılır).

Panelde **drop simülatörü** olmalı: bir yaratığı 1.000 / 10.000 kez öldürüp ortalama ne çıktığını
gösterir. Oranları ayarlamanın en hızlı yolu bu.

### 3.3 Haritalar ve spawn

Bugünkü oyun spawnları MOBA'ya göre (kaleye uzaklık). Köy için **harita koordinatlı bölgeler** gerekiyor.

```sql
CREATE TABLE maps (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,      -- 'village1' (oyundaki sahne adıyla eşleşir)
  name          TEXT NOT NULL,
  minimap_path  TEXT,                      -- uploads/maps/village1.png (oyundan dışa aktarılır)
  world_min_x REAL NOT NULL, world_min_z REAL NOT NULL,   -- minimap'in kapsadığı dünya dikdörtgeni
  world_max_x REAL NOT NULL, world_max_z REAL NOT NULL
);

-- Haritada bir alan: daire ya da çokgen. "Kurt ormanı", "Ayı mağarası önü", "Metin vadisi"
CREATE TABLE spawn_regions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id      INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  shape       TEXT NOT NULL DEFAULT 'CIRCLE',   -- CIRCLE | POLYGON
  x REAL, z REAL, radius REAL,                  -- CIRCLE
  points      TEXT NOT NULL DEFAULT '[]',       -- POLYGON: [[x,z],...]
  level_min   INTEGER NOT NULL DEFAULT 1,       -- bilgi + panel uyarısı (yaratık seviyesiyle uyuşmazsa)
  level_max   INTEGER NOT NULL DEFAULT 99,
  UNIQUE (map_id, code)
);

-- Bölgede ne doğar
CREATE TABLE spawn_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  region_id     INTEGER NOT NULL REFERENCES spawn_regions(id) ON DELETE CASCADE,
  monster_id    INTEGER NOT NULL REFERENCES monsters(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'PACK',   -- PACK: sürekli sürüler | STONE: Metin taşı | BOSS | EVENT
  max_alive     INTEGER NOT NULL DEFAULT 1,     -- bölgede aynı anda en fazla kaç grup
  pack_min      INTEGER NOT NULL DEFAULT 1,
  pack_max      INTEGER NOT NULL DEFAULT 1,
  respawn_min_s INTEGER NOT NULL DEFAULT 60,    -- ölünce yenisi için rastgele bekleme
  respawn_max_s INTEGER NOT NULL DEFAULT 90,
  announce      INTEGER NOT NULL DEFAULT 0,     -- doğunca/ölünce sohbet duyurusu (boss, Metin)
  schedule      TEXT NOT NULL DEFAULT '',       -- EVENT için: "daily 20:00", "every 2h", "night"
  leader_id     INTEGER REFERENCES monsters(id) -- PACK'in lideri (Metin2 "group": lider + yandaşlar)
);
```

- **Mistik olaylar** `kind = 'EVENT'` + `schedule` ile: gece çıkan hayalet kurtlar (`night`), günde bir
  doğan dünya bossu (`daily 20:00`), rastgele beliren mistik taş (`every 2h`, bölgede rastgele nokta).
  Oyunda gündüz/gece zaten var (`TimeOfDay`), `night` doğrudan buna bağlanır.
- **Panelde harita editörü:** minimap resminin üstüne tıklayarak daire/çokgen çizilir, bölgeye yaratık
  sürüklenir. Minimap ve dünya dikdörtgeni oyundan dışa aktarılır (oyunda `MobaMap.minimap_texture()` ve
  `minimap_rect()` zaten var; köy için aynısını dosyaya yazan küçük bir araç eklenir).
- metin2alerts sayfalarındaki “Spawn locations” bilgisi Metin2'nin kendi haritalarına ait; bizim köyle
  koordinatları uyuşmaz. İçe aktarıcı bunu sadece “bu yaratık 1. köy yaratığıdır” önerisi için
  kullanabilir (`village1-import/selected.json` zaten bunu yapıyor).

### 3.4 Metin taşları

`monsters` satırı (`rank='STONE'`) + davranış:

```sql
CREATE TABLE stone_settings (
  monster_id      INTEGER PRIMARY KEY REFERENCES monsters(id) ON DELETE CASCADE,
  minion_group    TEXT NOT NULL DEFAULT '[]',  -- [{"monster_vnum":102,"count":[3,5]}]
  minion_hp_steps TEXT NOT NULL DEFAULT '[90,70,50,30,10]',  -- can bu yüzdelerin altına inince yandaş dalgası
  despawn_s       INTEGER NOT NULL DEFAULT 0   -- kimse vurmazsa kaybolma süresi (0 = kalıcı)
);
```

Taşın dropu da `monster_drops` ile (ruh taşı, beceri kitabı…). Görsel model `monsters.model_path`.

### 3.5 Karakter gelişimi

```sql
-- Seviye -> sonraki seviye için gereken EXP (Metin2 exp tablosu)
CREATE TABLE exp_table (level INTEGER PRIMARY KEY, exp_to_next INTEGER NOT NULL);

-- Sınıfın başlangıç değerleri ve seviye başı artışı
CREATE TABLE class_stats (
  class           TEXT PRIMARY KEY,        -- WARRIOR | NINJA | SURA | SHAMAN (shared/constants CLASSES)
  base_str INTEGER, base_dex INTEGER, base_vit INTEGER, base_int INTEGER,
  base_hp INTEGER, hp_per_level INTEGER, hp_per_vit INTEGER,
  base_sp INTEGER, sp_per_level INTEGER, sp_per_int INTEGER,
  attack_per_str REAL, defense_per_vit REAL, ...
);

-- Tek satırlık sayısal ayarlar (anahtar/değer, tipli): stat_points_per_level, max_level,
-- yang kuralı, drop seviye cezası, drop/exp çarpanları, ölüm cezası...
CREATE TABLE game_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, type TEXT NOT NULL, description TEXT);
```

Oyun bugün EXP ve stat formüllerini kodda tutuyor (`mob.gd::xp_reward`, `character_stats.gd`); bunlar
`exp_table` + `class_stats` + `game_config`'ten okunacak şekilde değişir.

> **Karakter kayıtları (hesap, karakter, envanter, seviye) bu panelin veritabanına girmemeli.** Onlar
> oyun sunucusunun canlı verisi; saniyede çok yazılır ve ayrı yedeklenmeli. Önerim: oyun sunucusunda ayrı
> bir veritabanı (aynı makinede ikinci bir SQLite ya da PostgreSQL). Panel buna ileride sadece okumak
> için (oyuncu arama, GM işlemleri) bağlanabilir. Bu raporun kapsamı dışında; ayrı bir iş olarak planlanmalı.

### 3.6 Itemler: küçük değişiklikler

- Oyunun item kodlarıyla eşleme: `items` tablosuna `code TEXT UNIQUE` (ör. `RUSTY_SWORD`). Oyun önce
  vnum'a geçene kadar iki anahtar da bundle'da olur.
- Oyunun item JSON'larında olup panelde olmayan alanlar: `size` (envanter kare sayısı), `sub_type`
  eşlemesi (`OneHandSword` ↔ `SWORD`), `icon` (panelde `icon_path` var). `size` sütunu eklenmeli.
- İçe aktarma: oyunun mevcut `modules/inventory/data/items/*.json` dosyaları panele bir kez aktarılır
  (tek seferlik betik), sonrasında kaynak panel olur.

### 3.7 Yayın (publish)

```sql
CREATE TABLE data_releases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  version     INTEGER NOT NULL UNIQUE,   -- artan sayı
  sha256      TEXT NOT NULL,
  bundle      TEXT NOT NULL,             -- tüm oyun verisinin JSON'u (değişmez)
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  is_active   INTEGER NOT NULL DEFAULT 0 -- oyunun çalıştırdığı sürüm (tek satır 1)
);
```

“Yayınla” → bütün tabloları okuyup bundle üretir, **doğrular** (aşağıda), kaydeder, `is_active` yapar ve
oyun sunucusuna haber verir. “Geri al” → önceki sürümü aktif yapar.

Yayın öncesi doğrulama (kırık veri oyuna gitmesin):

- drop'taki her `item_vnum` gerçekten var mı, oranlar 0–1.000.000 aralığında mı;
- spawn'daki her yaratığın modeli var mı, bölge harita sınırları içinde mi;
- `exp_table` 1…max_level arası eksiksiz mi;
- yaratık seviyesi bölgenin seviye aralığında mı (uyarı, engel değil).

---

## 4. API değişiklikleri

| Yöntem | Yol | Açıklama |
| --- | --- | --- |
| GET/POST/PUT/DELETE | `/api/monsters`, `/api/monsters/:id` | Yaratık CRUD (bugünkü item uç noktalarının kopyası) |
| GET/PUT | `/api/monsters/:id/drops` | Yaratığın drop listesi (tek seferde kaydedilir) |
| GET/POST/PUT/DELETE | `/api/drop-groups`, `/api/drop-groups/:id` | Drop grupları ve satırları |
| GET/PUT | `/api/level-drops` | Genel drop tablosu |
| POST | `/api/monsters/:id/simulate-drops` | `{kills: 10000, playerLevel}` → ortalama çıktı |
| GET/POST/PUT/DELETE | `/api/maps`, `/api/maps/:id/regions`, `/api/regions/:id/spawns` | Harita, bölge, spawn |
| POST | `/api/maps/:id/minimap` | Minimap yükleme (multipart, mevcut multer kurulumu) |
| GET/PUT | `/api/progression/exp`, `/api/progression/classes`, `/api/config` | Seviye/sınıf/ayar tabloları |
| POST | `/api/releases` | Yayınla (doğrula + bundle üret) |
| GET | `/api/releases`, `POST /api/releases/:id/activate` | Sürüm listesi, geri alma |
| **GET** | **`/api/game/bundle`** | **Oyun sunucusu için.** `Authorization: Bearer <GAME_API_TOKEN>`. `ETag` = sha256; `If-None-Match` ile değişmediyse `304`. `?version=N` belirli sürüm. |
| GET | `/api/game/version` | Sadece `{version, sha256}` (ucuz kontrol) |
| GET | `/api/public/monsters`, `/api/public/monsters/:vnum` | Wiki: yaratık sayfası, drop listesi (oranlar istenirse gizlenebilir), nerede çıktığı |

- `GAME_API_TOKEN` `.env`'e eklenir; oyun sunucusu aynı makinede olduğu için istek `127.0.0.1:3001`'e
  gider, dışarı açılmasına gerek yok (nginx'te `/api/game/` dışarıya kapatılabilir).
- Yayın bildirimi: panel yayından sonra oyun sunucusuna `POST http://127.0.0.1:<oyun-admin-portu>/reload`
  atabilir; daha basiti oyun sunucusunun `/api/game/version`'ı dakikada bir sorması. İlk aşama için
  sorgulama yeterli.

### Bundle biçimi (öneri)

```json
{
  "version": 12, "sha256": "…", "created_at": "2026-10-20T18:00:00Z",
  "config":   { "max_level": 99, "stat_points_per_level": 3, "drop_level_penalty": [...], "yang": {...} },
  "exp_table": [0, 300, 800, ...],
  "classes":  { "WARRIOR": { "base_str": 6, ... } },
  "items":    [ { "vnum": 10, "code": "RUSTY_SWORD", "name": "...", "type": "WEAPON", "subtype": "SWORD",
                  "stats": {...}, "bonuses": [...], "upgrades": [...], "size": 2,
                  "icon": { "url": "/uploads/icons/…png", "sha256": "…" } } ],
  "monsters": [ { "vnum": 102, "code": "wolf", "rank": "NORMAL", "level": 3, "hp": 162, "exp": 39,
                  "damage": [23, 28], "defense": 6, "aggressive": true, "aggro_range": 8,
                  "model": { "url": "/uploads/models/…glb", "sha256": "…", "scale": 1.0 },
                  "drops": [ { "item": 30028, "ppm": 50000, "count": [1,1] }, { "group": "wolf_common", "ppm": 200000 } ] } ],
  "drop_groups": { "wolf_common": { "mode": "ONE_OF", "rolls": 1, "entries": [...] } },
  "level_drops": [...],
  "maps": { "village1": { "regions": [ { "code": "kurt_ormani", "shape": "CIRCLE", "x": 40, "z": -60,
            "radius": 25, "spawns": [ { "monster": 102, "kind": "PACK", "max_alive": 4, "pack": [2,4],
            "respawn": [45, 75] } ] } ] } }
}
```

Bundle'da id yerine vnum/code kullanılır; panel veritabanının iç id'leri oyuna sızmaz.

---

## 5. Dosyalar (modeller, ikonlar)

- Bundle her dosyayı `url` + `sha256` ile verir. Oyun sunucusu ve istemciler dosyayı bir kez indirip
  `user://cache/<sha256>.glb` olarak saklar; hash değişmedikçe tekrar indirmez.
- Godot GLB'yi çalışma anında `GLTFDocument` ile yükleyebilir; derlemeye gömmek gerekmez.
- **Panel, modeli kendi kendine yeten GLB olarak saklamalı.** m2icondb'den gelen bazı GLB'ler dokusuz
  (malzeme adı doku yolu, doku yanında ayrı `.dds`; DDS'lerin mipmap zinciri de çoğu zaman eksik).
  Oyunda bunu şimdilik `Assets/metin2/tools/m2_texture_import.gd` editörde düzeltiyor, ama çalışma anında
  yüklenen modelde bu adım yok. Bu yüzden **model-downloader / `model-service.ts` yüklerken DDS'leri
  PNG'ye çevirip GLB'nin içine gömmeli** (skinSource→skinTarget doku değişimi dahil).
  Böylece panelin 3D önizlemesinde de doğru görünür.
- Model normalizasyonu panelde: ölçek (Metin2 GLB'leri cm, oyun m: ×0.01), yön, animasyon adları
  (`wait`, `run`, `attack`, `die` gibi oyunun beklediği adlarla eşleme tablosu: `monster_animations`).
  Hangi animasyonların eksik olduğu panelde uyarı olarak görünmeli (ör. kurt GLB'sinde sadece `wait` var).
- Minimap'ler `uploads/maps/` altında.

---

## 6. Panel arayüzü (client)

Yeni sayfalar, mevcut `ItemList` / `ItemEditor` desenini izleyerek:

1. **Canavarlar** — liste (rütbe, seviye, harita filtresi), düzenleyici (statlar, AI, model önizleme,
   animasyon eşlemesi), **Drop** sekmesi (item arama + oran yüzde girişi + adet + yükseltme aralığı,
   drop grubu ekleme, simülatör).
2. **Drop grupları** — grup düzenleyici, “bu grubu kullanan yaratıklar” listesi.
3. **Genel drop** — seviye aralığı tablosu.
4. **Haritalar** — minimap üstünde bölge çizimi, bölgeye spawn ekleme, Metin taşı/boss/olay yerleri,
   bölge başına “saatte yaklaşık kaç yaratık, ne kadar EXP” özeti.
5. **Gelişim** — EXP tablosu (grafik + otomatik eğri üretici), sınıf statları, oyun ayarları.
6. **Yayınla** — son yayından bu yana değişenlerin listesi (fark), doğrulama sonuçları, yayınla / geri al.
7. **Wiki** — yaratık sayfaları (`/wiki/mob/:vnum`): model, statlar, drop listesi, nerede çıktığı.
   Item sayfasına “hangi yaratıktan düşer” bölümü.

---

## 7. İçe aktarıcı (importer) değişiklikleri

- `server/importers/monsters.ts`: çıktısı `items` yerine `monsters` taslağı olmalı; `stat:*` ham
  hücrelerinden direnç/element alanları ayrıştırılmalı.
- metin2alerts yaratık sayfasındaki **Drops** bölümü okunmalı (`/store/items/<vnum>.png` ikonundan vnum
  çıkar): bu itemler drop listesine **oranı boş taslak** olarak gelir; panelde tanımlı değilse
  “eksik item” olarak gösterilir (bugünkü `missingMaterials` deseni). Oranı yönetici girer.
- “Spawn locations” okunup `village1` önerisinde kullanılabilir, koordinatlar kullanılmaz.
- `data/village1-import/*` deki toplu içe aktarma betiği `monsters` tablosuna yazacak şekilde güncellenir.

---

## 8. Oyun tarafında yapılacaklar (bilgi için)

Panel işi bitince oyunda:

1. `GameData` autoload: açılışta bundle'ı alır (sunucu: panelden; istemci: oyun sunucusundan, bağlanınca),
   `user://data/bundle_<version>.json` olarak saklar, panele ulaşılamazsa son sürümle açılır.
2. `DataRegistry` ve `ItemCatalog` JSON dosyaları yerine bundle'dan beslenir (API'leri aynı kalır).
3. `mob.gd`: statları seviye ölçeklemesi yerine doğrudan yaratık kaydından alır; `_die` drop zarını
   `monster.drops` + `level_drops` + seviye cezasıyla atar.
4. Yeni `RegionSpawner`: köy haritasında bölge tabanlı spawn (PACK / STONE / BOSS / EVENT, respawn
   zamanlayıcıları, duyurular). MOBA haritası bugünkü `zones` sistemiyle devam eder.
5. Metin taşı: `GuardianStone kind="metin"` yerine `rank=STONE` yaratık + `stone_settings` yandaş dalgaları.
6. Seviye / EXP / stat: `exp_table`, `class_stats`, `game_config`'ten.
7. Model yükleyici: bundle'daki GLB'yi indir, önbellekle, çalışma anında yükle.

---

## 9. Önerilen sıra

| Adım | Panel | Oyun | Sonuç |
| --- | --- | --- | --- |
| 1 | `monsters` tablosu + taşıma + Canavarlar sayfası | — | Yaratıklar ayrı ve sorgulanabilir |
| 2 | Drop tabloları + Drop sekmesi + simülatör | — | Oranlar panelde |
| 3 | `data_releases` + `/api/game/bundle` + token | `GameData` bundle alır; mob statları ve droplar bundle'dan | Panelde değişen oran oyunda görünür |
| 4 | `maps` / `spawn_*` + harita editörü | `RegionSpawner` köyde | Köyde konumlu yaratıklar |
| 5 | Metin taşı ayarları, EVENT zamanlaması | Metin taşı + bosslar + mistik olaylar | Yaşayan köy |
| 6 | Gelişim tabloları | Seviye/stat bundle'dan | Metin2 gibi gelişim |
| 7 | Model GLB'leri dokulu saklama, animasyon eşlemesi | Çalışma anında model yükleme | Yeni yaratık = sadece panel işi |
| (ayrı) | — | Karakter kalıcılığı (hesap, envanter) | Oyuncu çıkınca karakter kalır |

Her adım tek başına çalışır durumda bırakılabilir; 3. adımdan sonra panelde yapılan her değişiklik
oyunda doğrudan görülebilir.
