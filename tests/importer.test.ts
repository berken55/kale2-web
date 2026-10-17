import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.ts';
import { openDatabase } from '../server/db.ts';
import { isAllowedUrl } from '../server/importers/fetch.ts';
import { buildDraft, guessType } from '../server/importers/index.ts';
import { metin2alerts } from '../server/importers/metin2alerts.ts';

// Not: fixture gerçek bir sayfa değil, elle yazılmış yaklaşık bir örnektir (dosyanın başına bakın).
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures/metin2alerts-approx.html'), 'utf8');
const URL_ = 'https://metin2alerts.com/en/wiki/item/180-poison-sword';
const auth = { username: 'admin', password: 'secret', secret: 'test-secret', secureCookie: false };

afterEach(() => vi.unstubAllGlobals());

describe('adres güvenliği', () => {
  it('yalnızca izinli https alan adlarını kabul eder', () => {
    expect(isAllowedUrl(URL_)).toBe(true);
    expect(isAllowedUrl('https://cdn.metin2alerts.com/a.png')).toBe(true);
    expect(isAllowedUrl('http://metin2alerts.com/x')).toBe(false);
    expect(isAllowedUrl('https://metin2alerts.com.evil.com/x')).toBe(false);
    expect(isAllowedUrl('https://evilmetin2alerts.com/x')).toBe(false);
    expect(isAllowedUrl('https://user:pw@metin2alerts.com/x')).toBe(false);
    expect(isAllowedUrl('https://127.0.0.1/x')).toBe(false);
  });
});

describe('metin2alerts okuyucusu', () => {
  it('yaklaşık örnek sayfadan item alanlarını okur', () => {
    const raw = metin2alerts.parse(FIXTURE, URL_);
    expect(raw.vnum).toBe(180);
    expect(raw.name).toBe('Poison Sword');
    expect(raw.levelRequired).toBe(75);
    expect(raw.classes).toEqual(['WARRIOR', 'NINJA', 'SURA']);
    expect(raw.stats.attackSpeed).toBe(15);
    expect(raw.levels.map((l) => l.level)).toEqual([0, 1, 2, 9]);
    expect(raw.levels[1]).toMatchObject({ minAttack: 213, maxAttack: 253, successRate: 90, cost: 1_000_000 });
    expect(raw.levels[1].materials).toEqual([{ vnum: 27992, name: 'White Pearl', count: 1, url: 'https://metin2alerts.com/en/wiki/item/27992-white-pearl' }]);
    expect(raw.levels[2].materials.map((m) => [m.vnum, m.count])).toEqual([[27992, 2], [30010, 5]]);
    expect(raw.levels[2].cost).toBe(1_500_000);
    expect(raw.levels[3].materials.map((m) => [m.vnum, m.count])).toEqual([[27994, 3]]);
    expect(raw.iconUrl).toBe('https://metin2alerts.com/images/items/00180.png');
    expect(raw.modelUrl).toBe('https://metin2alerts.com/models/poison_sword.glb');
  });

  it('item tipini kategori metninden veya isimden tahmin eder', () => {
    expect(guessType('Poison Sword')).toEqual({ type: 'WEAPON', subtype: 'SWORD' });
    expect(guessType('Ebony Earrings')).toEqual({ type: 'ARMOR', subtype: 'EAR' });
    expect(guessType('Leather Shoes')).toEqual({ type: 'ARMOR', subtype: 'FOOTS' });
    expect(guessType('Monk Plate Armour')).toEqual({ type: 'ARMOR', subtype: 'BODY' });
    expect(guessType('Iron Helmet')).toEqual({ type: 'ARMOR', subtype: 'HEAD' });
    expect(guessType('Wooden Bracelet')).toEqual({ type: 'ARMOR', subtype: 'WRIST' });
    expect(guessType('Something', '/en/wiki/items/shaman-weapons Fans')).toEqual({ type: 'WEAPON', subtype: 'FAN' });
  });

  it('taslağı panel biçimine çevirir: taban değer, seviye artışı, bonus eşleşmesi', () => {
    const db = openDatabase(':memory:');
    const draft = buildDraft(db, metin2alerts.parse(FIXTURE, URL_), URL_, metin2alerts);
    expect(draft.item).toMatchObject({ vnum: 180, type: 'WEAPON', subtype: 'SWORD', levelRequired: 75, sourceUrl: URL_ });
    expect(draft.item.stats).toMatchObject({ minAttack: 210, maxAttack: 250, attackSpeed: 15 });
    expect(draft.item.upgrades.find((u) => u.level === 9)).toMatchObject({ attackBonus: 27, successRate: 10, cost: 5_000_000 });
    expect(draft.item.bonuses).toHaveLength(2);
    expect(draft.unresolvedBonuses.map((b) => b.label)).toEqual(['Strong against Mystics']);
    expect(draft.missingMaterials.map((m) => m.vnum)).toEqual([27992, 30010, 27994]);
    expect(draft.assets.modelUrl).toBe('https://metin2alerts.com/models/poison_sword.glb');
    expect(draft.existingItemId).toBeNull();
  });
});

describe('içe aktarma uç noktaları', () => {
  async function setup() {
    const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kale2-imp-'));
    const app = createApp({ db: openDatabase(':memory:'), uploadDir, auth });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret' }).expect(200);
    return { agent, uploadDir };
  }

  it('desteklenmeyen linkleri reddeder', async () => {
    const { agent } = await setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await agent.post('/api/import/url').send({ url: 'https://example.com/item/1' }).expect(400);
    await agent.post('/api/import/url').send({ url: 'bu bir link değil' }).expect(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('m2icondb item linkini eşya içe aktarmada reddeder', async () => {
    const { agent } = await setup();
    const res = await agent.post('/api/import/url').send({ url: 'https://m2icondb.com/item/11210' }).expect(400);
    expect(res.body.error).toContain('Metin2Alerts');
  });

  it('sayfayı okuyup taslak döndürür, izinsiz adrese yönlendirmeyi takip etmez', async () => {
    const { agent } = await setup();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(FIXTURE, { headers: { 'content-type': 'text/html' } })));
    const draft = (await agent.post('/api/import/url').send({ url: URL_ }).expect(200)).body;
    expect(draft.item.name).toBe('Poison Sword');

    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest' } })));
    const res = await agent.post('/api/import/url').send({ url: URL_ }).expect(400);
    expect(res.body.error).toContain('İzin verilmeyen');
  });

  it('kaydedilen iteme kaynaktaki ikonu ve 3D modeli indirir', async () => {
    const { agent, uploadDir } = await setup();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(FIXTURE, { headers: { 'content-type': 'text/html' } })));
    const draft = (await agent.post('/api/import/url').send({ url: URL_ }).expect(200)).body;
    expect(draft.assets.modelUrl).toBeNull();
    const item = (await agent.post('/api/items').send(draft.item).expect(201)).body;
    expect(item.sourceUrl).toBe(URL_);

    vi.stubGlobal('fetch', vi.fn(async (u: string) =>
      u.endsWith('.png')
        ? new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { headers: { 'content-type': 'image/png' } })
        : new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]), { headers: { 'content-type': 'application/octet-stream' } }),
    ));
    const withIcon = (await agent.post(`/api/items/${item.id}/remote-media`).send({ kind: 'icon', url: draft.assets.iconUrl }).expect(200)).body;
    expect(withIcon.iconUrl).toMatch(/^\/uploads\/icons\/.+\.png$/);
    const withModel = (await agent.post(`/api/items/${item.id}/remote-media`).send({ kind: 'model', url: 'https://metin2alerts.com/models/poison_sword.glb' }).expect(200)).body;
    expect(withModel.modelFileName).toBe('poison_sword.glb');
    expect(fs.existsSync(path.join(uploadDir, withModel.modelUrl.replace('/uploads/', '')))).toBe(true);

    await agent.post(`/api/items/${item.id}/remote-media`).send({ kind: 'icon', url: 'https://example.com/x.png' }).expect(400);
  });
});
