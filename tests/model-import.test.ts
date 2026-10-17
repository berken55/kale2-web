import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.ts';
import { openDatabase } from '../server/db.ts';
import { metin2alerts } from '../server/importers/metin2alerts.ts';
import { monsters } from '../server/importers/monsters.ts';
import { applyCatalogRecord, m2icondb } from '../server/importers/m2icondb.ts';
import * as service from '../server/importers/model-service.ts';
import { FetchError } from '../server/importers/fetch.ts';
import { convertLegacyMonster } from '../server/monster-convert.ts';

const cleanup: Array<() => void> = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); cleanup.splice(0).forEach((fn) => fn()); });

const mobUrl = 'https://metin2alerts.com/en/wiki/mob/101-wild-dog';
const mobHtml = `<h1>Wild Dog</h1><meta property="og:image" content="https://metin2alerts.com/dog.webp">
<div>5 VIT</div><div>100 Attack speed</div><div>4 Defence</div><div>15 EXP</div>
<div>Level 1 Level 1</div><div>Race Strong against Animals</div><div>HP 126</div><div>Damage 20 – 24</div>
<script>"folder":"stray_dog"</script>`;

async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kale2-model-test-'));
  const db = openDatabase(':memory:');
  const uploadDir = path.join(root, 'uploads');
  const privateDir = path.join(root, 'private');
  const app = createApp({ db, uploadDir, importPrivateDir: privateDir,
    auth: { username: 'admin', password: 'secret', secret: 'test-secret', secureCookie: false } });
  cleanup.push(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret' }).expect(200);
  return { db, agent, app, uploadDir, privateDir };
}

describe('model import service', () => {
  it('reads Turkish statistics and preserves regeneration, resistances, rank and element', () => {
    const raw = monsters.parse(`<h1>Dokuz Kuyruk</h1><div>81 Savunma</div><div>69.360 EXP</div>
      <div class="mobstat-cell"><span class="mobstat-k">Seviye</span><span class="mobstat-row"><span class="mobstat-v mono">72</span><span class="mobstat-note">Boss</span><img alt="Buz" /></span></div>
      <div class="mobstat-cell"><span class="mobstat-k">HP</span><span class="mobstat-row"><span class="mobstat-v mono">166.120</span></span></div>
      <div class="mobstat-cell"><span class="mobstat-k">Hasar</span><span class="mobstat-row"><span class="mobstat-v mono">109 – 203</span></span></div>
      <div class="mobstat-cell"><span class="mobstat-k">HP yenilenmesi</span><span class="mobstat-row"><span class="mobstat-v mono">%32 / 24 sn</span></span></div>
      <div class="mobstat-cell"><span class="mobstat-k">Buz direnci</span><span class="mobstat-row"><span class="mobstat-v mono">-30%</span></span></div>`, 'https://metin2alerts.com/wiki/mob/1901-dokuz-kuyruk');
    expect(raw).toMatchObject({ subtype: 'BOSS', levelRequired: 72, stats: { minAttack: 109, maxAttack: 203, defense: 81 }, monsterStats: { hp: 166120, exp: 69360, hpRegenPercent: 32, hpRegenSeconds: 24, rank: 'Boss', element: 'Buz', 'stat:Buz direnci': '-30%' } });
  });
  it('reads current column-based upgrades and wearable classes', () => {
    const raw = metin2alerts.parse(`<h1>Sword</h1><div>[Wearable]</div><div>Warrior Ninja Sura</div>
      <table><tr><th></th><th>+ 0</th><th>+ 1</th></tr>
      <tr><td>Attack Value</td><td>13-15</td><td>20-22</td></tr>
      <tr><td>Magical Attack Value</td><td>15-19</td><td>22-26</td></tr>
      <tr><td>Chance</td><td>-</td><td>90%</td></tr>
      <tr><td>Required Yang</td><td>-</td><td>1.200</td></tr></table>`, 'https://metin2alerts.com/en/wiki/item/10');
    expect(raw.classes).toEqual(['WARRIOR', 'NINJA', 'SURA']);
    expect(raw.levels[0]).toMatchObject({ minAttack: 13, maxAttack: 15, minMagicAttack: 15 });
    expect(raw.levels[1]).toMatchObject({ minAttack: 20, maxAttack: 22, cost: 1200, successRate: 90 });
  });

  it('converts a parsed monster page into a monsters row and keeps edits', async () => {
    const { agent } = await setup();
    const raw = monsters.parse(mobHtml, mobUrl);
    const input = convertLegacyMonster({ vnum: raw.vnum!, name: raw.name!, subtype: raw.subtype!, level: raw.levelRequired!, damageMin: raw.stats.minAttack!, damageMax: raw.stats.maxAttack!, defense: raw.stats.defense!, stats: raw.monsterStats!, sourceUrl: mobUrl });
    expect(input).toMatchObject({ vnum: 101, code: 'wild_dog', rank: 'NORMAL', race: 'ANIMAL', hp: 126, exp: 15, attackSpeed: 100, damageMin: 20, damageMax: 24, defense: 4 });
    const monster = (await agent.post('/api/monsters').send(input).expect(201)).body;
    await agent.put(`/api/monsters/${monster.id}`).send({ ...input, hp: 150 }).expect(200);
    expect((await agent.get(`/api/monsters/${monster.id}`).expect(200)).body.hp).toBe(150);
  });

  it('keeps uploaded cookies private and supports replacement/removal', async () => {
    const { agent, app, privateDir } = await setup();
    const cookies = '# Netscape HTTP Cookie File\n.metin2alerts.com\tTRUE\t/\tTRUE\t2147483647\tcf_clearance\ttest-value\n';
    await request(app).post('/api/import/cookies').attach('file', Buffer.from(cookies), 'cookies.txt').expect(401);
    await agent.post('/api/import/cookies').attach('file', Buffer.from('not cookies'), 'cookies.txt').expect(400);
    await agent.post('/api/import/cookies').attach('file', Buffer.from(cookies), 'cookies.txt').expect(200);
    expect(fs.readFileSync(path.join(privateDir, 'metin2alerts-cookies.txt'), 'utf8')).toBe(cookies);
    const status = (await agent.get('/api/import/sources').expect(200)).body;
    expect(status.cookieConfigured).toBe(true);
    expect(JSON.stringify(status)).not.toContain('test-value');
    await request(app).get('/uploads/metin2alerts-cookies.txt').expect(404);
    await agent.del('/api/import/cookies').expect(204);
    expect((await agent.get('/api/import/sources')).body.cookieConfigured).toBe(false);
  });

  it('routes viewer URLs to the downloader and keeps the old model on failure', async () => {
    const { agent, uploadDir } = await setup();
    const raw = monsters.parse(mobHtml, mobUrl);
    const input = convertLegacyMonster({ vnum: raw.vnum!, name: raw.name!, subtype: raw.subtype!, level: raw.levelRequired!, damageMin: 20, damageMax: 24, defense: 4, stats: raw.monsterStats!, sourceUrl: mobUrl });
    const item = (await agent.post('/api/monsters').send(input).expect(201)).body;
    const data = Buffer.from('glTF-test-model');
    const downloader = vi.spyOn(service, 'downloadModel').mockResolvedValue({ data, filename: 'dog.glb', warnings: ['test warning'] });
    const saved = (await agent.post(`/api/monsters/${item.id}/remote-media`).send({ kind: 'model', url: mobUrl }).expect(200)).body;
    expect(saved.modelUrl).toMatch(/\/uploads\/models\/.+\.glb$/);
    expect(saved.importWarnings).toEqual(['test warning']);
    expect(fs.readFileSync(path.join(uploadDir, saved.modelUrl.replace('/uploads/', '')))).toEqual(data);
    downloader.mockRejectedValueOnce(new FetchError('unavailable', 502));
    await agent.post(`/api/monsters/${item.id}/remote-media`).send({ kind: 'model', url: mobUrl }).expect(502);
    expect((await agent.get(`/api/monsters/${item.id}`)).body.modelUrl).toBe(saved.modelUrl);
  });

  it('recognizes supported URLs and rejects unsafe model sources', () => {
    expect(m2icondb.parse('', 'https://m2icondb.com/3d?glb=weapons/10.glb&type=WEAPON&subtype=WEAPON_DAGGER&value3=10')).toMatchObject({ vnum: 10, type: 'WEAPON', subtype: 'DAGGER' });
    const armor = m2icondb.parse('', 'https://m2icondb.com/item/11210');
    applyCatalogRecord(armor, { name: 'Iron Plate Armour+0', type: 'ITEM_ARMOR', subtype: 'ARMOR_BODY', level: '9', warrior: true, assassin: false, bonuses: [{ t: 'Defence 21', k: 'def' }, { t: 'Movement Speed -2%', k: 'neg' }] });
    expect(armor).toMatchObject({ name: 'Iron Plate Armour+0', type: 'ARMOR', subtype: 'BODY', levelRequired: 9, classes: ['WARRIOR'], stats: { defense: 21 }, bonuses: [{ label: 'Movement Speed', value: -2, unit: '%' }] });
    expect(service.isModelSource('https://m2icondb.com/item/10')).toBe(true);
    expect(service.isModelSource(mobUrl)).toBe(true);
    expect(service.isModelSource('https://m2icondb.com.evil.test/item/10')).toBe(false);
    expect(service.isModelSource('https://user:pass@m2icondb.com/item/10')).toBe(false);
    expect(service.isModelSource('http://m2icondb.com/item/10')).toBe(false);
  });
});
