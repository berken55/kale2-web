import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { openDatabase } from '../server/db.ts';

const auth = { username: 'admin', password: 'secret', secret: 'test-secret', secureCookie: false };

async function setup() {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kale2-test-'));
  const app = createApp({ db: openDatabase(':memory:'), uploadDir, auth });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret' }).expect(200);
  return { app, agent, uploadDir };
}

const sword = {
  vnum: 10,
  name: 'Kılıç',
  type: 'WEAPON',
  subtype: 'SWORD',
  rarity: 'COMMON',
  levelRequired: 0,
  classes: ['WARRIOR', 'NINJA', 'SURA'],
  stats: { minAttack: 15, maxAttack: 19, attackSpeed: 22 },
  bonuses: [] as Array<{ bonusTypeId: number; value: number }>,
  upgrades: [
    { level: 0, attackBonus: 0, successRate: 100, cost: 0 },
    { level: 1, attackBonus: 3, successRate: 90, cost: 1000, materials: [{ vnum: 27001, count: 1 }] },
  ],
};

describe('kimlik doğrulama', () => {
  it('oturum olmadan API erişimini engeller', async () => {
    const app = createApp({ db: openDatabase(':memory:'), uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'k2-')), auth });
    await request(app).get('/api/items').expect(401);
    await request(app).post('/api/auth/login').send({ username: 'admin', password: 'yanlis' }).expect(401);
  });
});

describe('itemler', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('item oluşturur, okur, günceller ve siler', async () => {
    const { agent } = ctx;
    const bonuses = (await agent.get('/api/bonus-types').expect(200)).body;
    const maxHp = bonuses.find((b: { code: string }) => b.code === 'MAX_HP');

    const created = await agent
      .post('/api/items')
      .send({ ...sword, bonuses: [{ bonusTypeId: maxHp.id, value: 500 }] })
      .expect(201);
    expect(created.body.stats.maxAttack).toBe(19);
    expect(created.body.upgrades).toHaveLength(2);
    expect(created.body.upgrades[1].materials).toEqual([{ vnum: 27001, count: 1 }]);
    expect(created.body.bonuses).toEqual([{ bonusTypeId: maxHp.id, value: 500 }]);

    const list = await agent.get('/api/items?type=WEAPON&search=Kılı').expect(200);
    expect(list.body.total).toBe(1);

    const updated = await agent
      .put(`/api/items/${created.body.id}`)
      .send({ ...sword, name: 'Uzun Kılıç', upgrades: [] })
      .expect(200);
    expect(updated.body.name).toBe('Uzun Kılıç');
    expect(updated.body.upgrades).toEqual([]);
    expect(updated.body.bonuses).toEqual([]);

    await agent.delete(`/api/items/${created.body.id}`).expect(204);
    await agent.get(`/api/items/${created.body.id}`).expect(404);
  });

  it('geçersiz verileri reddeder', async () => {
    const { agent } = ctx;
    await agent.post('/api/items').send({ ...sword, subtype: 'BODY' }).expect(400);
    await agent.post('/api/items').send({ ...sword, stats: { minAttack: 30, maxAttack: 10 } }).expect(400);
    await agent.post('/api/items').send(sword).expect(201);
    const dupe = await agent.post('/api/items').send(sword).expect(409);
    expect(dupe.body.error).toContain('vnum');

    const bonuses = (await agent.get('/api/bonus-types')).body;
    const crit = bonuses.find((b: { code: string }) => b.code === 'CRITICAL_PCT');
    const over = await agent
      .post('/api/items')
      .send({ ...sword, vnum: 20, bonuses: [{ bonusTypeId: crit.id, value: 50 }] })
      .expect(400);
    expect(over.body.error).toContain('en fazla');
  });

  it('sınıf filtresi kısıtsız itemleri de döndürür', async () => {
    const { agent } = ctx;
    await agent.post('/api/items').send(sword).expect(201);
    await agent.post('/api/items').send({ ...sword, vnum: 20, name: 'Çan', subtype: 'BELL', classes: ['SHAMAN'] }).expect(201);
    await agent
      .post('/api/items')
      .send({ ...sword, vnum: 30, name: 'Kolye', type: 'ARMOR', subtype: 'NECK', classes: [] })
      .expect(201);
    const res = await agent.get('/api/items?class=SHAMAN&sort=vnum').expect(200);
    expect(res.body.items.map((i: { vnum: number }) => i.vnum)).toEqual([20, 30]);
  });

  it('kopyalar ve sonraki vnum önerir', async () => {
    const { agent } = ctx;
    const created = await agent.post('/api/items').send({ ...sword, vnum: 19 }).expect(201);
    expect((await agent.get('/api/items/next-vnum')).body.vnum).toBe(20);
    const clone = await agent.post(`/api/items/${created.body.id}/clone`).expect(201);
    expect(clone.body.vnum).toBe(20);
    expect(clone.body.upgrades).toHaveLength(2);
  });

  it('3D model ve ikon yükler, değiştirir ve siler', async () => {
    const { agent, uploadDir } = ctx;
    const item = (await agent.post('/api/items').send(sword).expect(201)).body;

    await agent
      .post(`/api/items/${item.id}/model`)
      .attach('file', Buffer.from('not a model'), 'kilic.exe')
      .expect(400);

    const up = await agent
      .post(`/api/items/${item.id}/model`)
      .attach('file', Buffer.from('glTF fake'), 'kilic.glb')
      .expect(200);
    expect(up.body.modelUrl).toMatch(/^\/uploads\/models\/.+\.glb$/);
    expect(up.body.modelFileName).toBe('kilic.glb');
    const firstFile = path.join(uploadDir, up.body.modelUrl.replace('/uploads/', ''));
    expect(fs.existsSync(firstFile)).toBe(true);
    await agent.get(up.body.modelUrl).expect(200);

    const replaced = await agent
      .post(`/api/items/${item.id}/model`)
      .attach('file', Buffer.from('glTF fake 2'), 'kilic2.glb')
      .expect(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(firstFile)).toBe(false);

    const icon = await agent
      .post(`/api/items/${item.id}/icon`)
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'ikon.png')
      .expect(200);
    expect(icon.body.iconUrl).toMatch(/\.png$/);

    const removed = await agent.delete(`/api/items/${item.id}/model`).expect(200);
    expect(removed.body.modelUrl).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(path.join(uploadDir, replaced.body.modelUrl.replace('/uploads/', '')))).toBe(false);
  });
});

describe('bonus tipleri', () => {
  it('kullanımdaki bonusun silinmesini engeller', async () => {
    const { agent } = await setup();
    const bt = (await agent.post('/api/bonus-types').send({ code: 'TEST_BONUS', name: 'Test', unit: '%', maxValue: 5 }).expect(201))
      .body;
    await agent.post('/api/bonus-types').send({ code: 'TEST_BONUS', name: 'Tekrar' }).expect(409);
    await agent.post('/api/bonus-types').send({ code: 'kucuk harf', name: 'X' }).expect(400);
    await agent.post('/api/items').send({ ...sword, bonuses: [{ bonusTypeId: bt.id, value: 5 }] }).expect(201);
    await agent.delete(`/api/bonus-types/${bt.id}`).expect(409);
  });
});

describe('dışa / içe aktarma', () => {
  it('JSON ile dışa aktarılan veriyi başka bir veritabanına aktarır', async () => {
    const a = await setup();
    const bonuses = (await a.agent.get('/api/bonus-types')).body;
    const str = bonuses.find((b: { code: string }) => b.code === 'STR');
    await a.agent.post('/api/bonus-types').send({ code: 'CUSTOM_X', name: 'Özel', maxValue: 3 }).expect(201);
    await a.agent.post('/api/items').send({ ...sword, bonuses: [{ bonusTypeId: str.id, value: 5 }] }).expect(201);
    const exported = (await a.agent.get('/api/export/json').expect(200)).body;
    expect(exported.items[0].bonuses).toEqual([{ code: 'STR', value: 5 }]);

    const proto = await a.agent.get('/api/export/item_proto.txt').expect(200);
    expect(proto.text).toContain('ITEM_WEAPON\tWEAPON_SWORD');
    expect(proto.text).toContain('ANTI_SHAMAN');
    expect(proto.text).toContain('APPLY_STR\t5');

    const b = await setup();
    const res = await b.agent.post('/api/import/json').send(exported).expect(200);
    expect(res.body).toEqual({ bonusTypesCreated: 1, itemsCreated: 1, itemsUpdated: 0 });
    const again = await b.agent.post('/api/import/json').send(exported).expect(200);
    expect(again.body.itemsUpdated).toBe(1);
    const list = (await b.agent.get('/api/items')).body;
    expect(list.total).toBe(1);
  });
});
