import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { openDatabase } from '../server/db.ts';

const auth = { username: 'admin', password: 'secret', secret: 'test-secret', secureCookie: false };
const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kale2-mob-'));
  cleanup.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function setup(dbFile = ':memory:') {
  const db = openDatabase(dbFile);
  cleanup.unshift(() => db.close());
  const app = createApp({ db, uploadDir: path.join(tempDir(), 'uploads'), auth });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret' }).expect(200);
  return { db, app, agent };
}

const wolf = {
  vnum: 102,
  code: 'wolf',
  name: 'Kurt',
  rank: 'NORMAL',
  level: 3,
  race: 'ANIMAL',
  hp: 162,
  exp: 39,
  damageMin: 23,
  damageMax: 28,
  defense: 6,
  aggressive: true,
  resists: { SWORD: 10, WIND: -30 },
  abilities: { CRITICAL: 5 },
  flags: ['SUMMONER'],
};

describe('canavarlar', () => {
  it('oluşturur, listeler, günceller, kopyalar ve siler', async () => {
    const { agent } = await setup();
    const created = (await agent.post('/api/monsters').send(wolf).expect(201)).body;
    expect(created).toMatchObject({ vnum: 102, code: 'wolf', hp: 162, resists: { SWORD: 10, WIND: -30 }, attackSpeed: 100, aggroRange: 8, sourceUrl: null });

    const list = (await agent.get('/api/monsters?rank=NORMAL&levelMax=5').expect(200)).body;
    expect(list.total).toBe(1);
    expect(list.monsters[0]).toMatchObject({ name: 'Kurt', aggressive: true });
    expect((await agent.get('/api/monsters?search=wol').expect(200)).body.total).toBe(1);
    expect((await agent.get('/api/monsters?rank=BOSS').expect(200)).body.total).toBe(0);

    const updated = (await agent.put(`/api/monsters/${created.id}`).send({ ...wolf, hp: 200, resists: {} }).expect(200)).body;
    expect(updated).toMatchObject({ hp: 200, resists: {} });

    const copy = (await agent.post(`/api/monsters/${created.id}/clone`).expect(201)).body;
    expect(copy).toMatchObject({ vnum: 103, code: 'wolf_kopya', name: 'Kurt (kopya)', hp: 200 });

    await agent.del(`/api/monsters/${copy.id}`).expect(204);
    await agent.get(`/api/monsters/${copy.id}`).expect(404);
    expect((await agent.get('/api/dashboard').expect(200)).body.totalMonsters).toBe(1);
  });

  it('geçersiz ve çakışan kayıtları reddeder', async () => {
    const { agent } = await setup();
    await agent.post('/api/monsters').send(wolf).expect(201);
    expect((await agent.post('/api/monsters').send({ ...wolf, code: 'wolf2' }).expect(409)).body.error).toMatch(/vnum/);
    expect((await agent.post('/api/monsters').send({ ...wolf, vnum: 999 }).expect(409)).body.error).toMatch(/kod/);
    await agent.post('/api/monsters').send({ ...wolf, vnum: 998, code: 'Büyük Kurt' }).expect(400);
    await agent.post('/api/monsters').send({ ...wolf, vnum: 997, code: 'w3', damageMin: 50 }).expect(400);
    await agent.post('/api/monsters').send({ ...wolf, vnum: 996, code: 'w4', resists: { LASER: 5 } }).expect(400);
    await agent.post('/api/monsters').send({ ...wolf, vnum: 995, code: 'w5', rank: 'DRAGON' }).expect(400);
  });

  it('wiki yaratık sayfası oyun kodunu ve kaynağı göstermez', async () => {
    const { app, agent } = await setup();
    await agent.post('/api/monsters').send({ ...wolf, sourceUrl: 'https://metin2alerts.com/en/wiki/mob/102-wolf' }).expect(201);
    const pub = (await request(app).get('/api/public/monsters/102').expect(200)).body;
    expect(pub).toMatchObject({ name: 'Kurt', hp: 162 });
    expect(pub.code).toBeUndefined();
    expect(pub.sourceUrl).toBeUndefined();
    expect((await request(app).get('/api/public/monsters').expect(200)).body.total).toBe(1);
    await request(app).get('/api/public/monsters/1').expect(404);
  });

  it('items tablosundaki eski canavar kayıtlarını monsters tablosuna taşır', async () => {
    const file = path.join(tempDir(), 'old.db');
    const old = openDatabase(file);
    const insert = old.prepare(
      `INSERT INTO items (vnum, name, type, subtype, level_required, min_attack, max_attack, defense, icon_path, model_path, model_file_name, monster_stats, source_url)
       VALUES (?, ?, 'MONSTER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run(101, 'Yabani Köpek', 'MOB', 1, 20, 24, 4, 'icons/dog.webp', 'models/dog.glb', 'dog.glb',
      JSON.stringify({ hp: 126, exp: 15, strength: 3, dexterity: 6, vitality: 5, intelligence: 2, attackSpeed: 100, movementSpeed: 100,
        rank: '1.Seviye', 'stat:Tür': 'Hayvanlara karşı güçlü', hpRegenPercent: 7, hpRegenSeconds: 6 }),
      'https://metin2alerts.com/wiki/mob/101-wild-dog');
    insert.run(1901, 'Dokuz Kuyruk', 'BOSS', 72, 109, 203, 81, null, null, null,
      JSON.stringify({ hp: 166120, exp: 69360, rank: 'Patron', element: 'Buz', 'stat:Buz direnci': '-30%', 'stat:Buz': '+1%',
        'stat:Kritik Vuruş Şansı': '+10%', 'stat:Kılıç Savunması': '+15%', 'behavior:1': 'Saldırgan Yaklaşınca kendisi saldırır',
        'behavior:2': 'Çağırıcı Buz Golemi' }),
      'https://metin2alerts.com/wiki/mob/1901-dokuz-kuyruk');
    insert.run(5113, 'Maymun Savaşçı', 'MOB', 39, 1, 2, 0, null, null, null, JSON.stringify({ hp: 10, rank: '3.Seviye' }), 'https://metin2alerts.com/wiki/mob/5113-maymun-savasci');
    old.prepare(`INSERT INTO items (vnum, name, type, subtype) VALUES (10, 'Kılıç', 'WEAPON', 'SWORD')`).run();
    old.close();

    const { db, agent } = await setup(file);
    expect((db.prepare("SELECT COUNT(*) AS c FROM items WHERE type = 'MONSTER'").get() as { c: number }).c).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS c FROM items').get() as { c: number }).c).toBe(1);

    const list = (await agent.get('/api/monsters?sort=vnum').expect(200)).body;
    expect(list.total).toBe(3);
    const dog = (await agent.get(`/api/monsters/${list.monsters[0].id}`).expect(200)).body;
    expect(dog).toMatchObject({
      vnum: 101, code: 'wild_dog', rank: 'NORMAL', race: 'ANIMAL', level: 1, hp: 126, exp: 15, damageMin: 20, damageMax: 24, defense: 4,
      str: 3, dex: 6, vit: 5, int: 2, hpRegenPct: 7, hpRegenSec: 6, aggressive: false,
      iconUrl: '/uploads/icons/dog.webp', modelUrl: '/uploads/models/dog.glb', modelFileName: 'dog.glb',
    });
    const fox = (await agent.get(`/api/monsters/${list.monsters[1].id}`).expect(200)).body;
    expect(fox).toMatchObject({
      code: 'nine_tails', rank: 'BOSS', element: 'ICE', aggressive: true,
      resists: { ICE: -30, SWORD: 15 }, abilities: { CRITICAL: 10 }, flags: ['SUMMONER'],
    });
    expect(fox.description).toContain('Buz Golemi');
    expect(list.monsters[2]).toMatchObject({ code: 'maymun_savasci', rank: 'ELITE' });

    // Taşıma bir kez çalışır; yeniden açınca kayıtlar çoğalmaz
    db.close();
    cleanup.shift();
    const again = openDatabase(file);
    expect((again.prepare('SELECT COUNT(*) AS c FROM monsters').get() as { c: number }).c).toBe(3);
    again.close();
  });

  it('canavar içe aktarma geçersiz linki reddeder', async () => {
    const { agent } = await setup();
    await agent.post('/api/monsters/import').send({ url: 'bozuk' }).expect(400);
  });
});
