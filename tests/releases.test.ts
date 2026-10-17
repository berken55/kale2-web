import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { openDatabase } from '../server/db.ts';

const auth = { username: 'admin', password: 'secret', secret: 'test-secret', secureCookie: false };
const TOKEN = 'oyun-anahtari-123';

async function setup(gameToken: string | undefined = TOKEN) {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kale2-rel-'));
  const db = openDatabase(':memory:');
  const app = createApp({ db, uploadDir, auth, gameToken });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret' }).expect(200);
  return { app, agent, db, uploadDir };
}

const game = (app: Parameters<typeof request>[0], url: string, token = TOKEN) => request(app).get(url).set('Authorization', `Bearer ${token}`);

describe('yayın ve oyun API', () => {
  it('yayınlar, oyuna verir, değişmeyeni reddeder ve geri alır', async () => {
    const { app, agent } = await setup();
    await game(app, '/api/game/bundle').expect(404);

    await agent.post('/api/items').send({ vnum: 30028, code: 'WOLF_CLAW', name: 'Kurt Pençesi', type: 'MATERIAL', subtype: 'REFINE' }).expect(201);
    await agent.post('/api/items').send({ vnum: 27001, name: 'İksir', type: 'USE', subtype: 'POTION' }).expect(201);
    const wolf = (await agent.post('/api/monsters').send({ vnum: 102, code: 'wolf', name: 'Kurt', level: 3, hp: 162, damageMin: 20, damageMax: 24 }).expect(201)).body;
    await agent
      .put(`/api/monsters/${wolf.id}/drops`)
      .send({ drops: [{ itemVnum: 30028, chancePpm: 100_000 }, { itemVnum: 27001, chancePpm: 5_000 }] })
      .expect(200);

    const preview = (await agent.get('/api/releases/preview').expect(200)).body;
    expect(preview.errors).toEqual([]);
    expect(preview.activeVersion).toBeNull();
    expect(preview.counts).toEqual({ items: 2, monsters: 1, dropGroups: 0, levelDrops: 0 });
    expect(preview.warnings.some((w: string) => w.includes('İksir'))).toBe(true);
    expect(preview.changes).toContainEqual({ kind: 'monster', key: '102', name: 'Kurt', change: 'added' });

    const v1 = (await agent.post('/api/releases').send({ notes: 'ilk' }).expect(201)).body;
    expect(v1).toMatchObject({ version: 1, isActive: true, notes: 'ilk' });
    await agent.post('/api/releases').send({}).expect(409);

    const bundle = await game(app, '/api/game/bundle').expect(200);
    expect(bundle.body).toMatchObject({ format: 'kale2-bundle', format_version: 1, version: 1 });
    expect(bundle.body.monsters[0]).toMatchObject({ code: 'wolf', hp: 162, damage: [20, 24], drops: [{ item: 30028, code: 'WOLF_CLAW', ppm: 100_000 }, { item: 27001, code: null }] });
    await game(app, '/api/game/bundle').set('If-None-Match', bundle.headers.etag).expect(304);
    expect((await game(app, '/api/game/version').expect(200)).body).toEqual({ version: 1, sha256: v1.sha256 });

    await agent.put(`/api/monsters/${wolf.id}`).send({ ...wolf, hp: 200 }).expect(200);
    const changes = (await agent.get('/api/releases/preview').expect(200)).body.changes;
    expect(changes).toEqual([{ kind: 'monster', key: '102', name: 'Kurt', change: 'changed' }]);
    await agent.post('/api/releases').send({}).expect(201);
    expect((await game(app, '/api/game/bundle').expect(200)).body.monsters[0].hp).toBe(200);
    expect((await game(app, '/api/game/bundle?version=1').expect(200)).body.monsters[0].hp).toBe(162);

    // Geri alma: v1 aktif
    await agent.post(`/api/releases/${v1.id}/activate`).expect(200);
    expect((await game(app, '/api/game/version').expect(200)).body.version).toBe(1);
    expect((await agent.get('/api/releases').expect(200)).body.map((r: { version: number; isActive: boolean }) => [r.version, r.isActive])).toEqual([
      [2, false],
      [1, true],
    ]);
  });

  it('oyun API anahtarsız ya da yanlış anahtarla kapalı', async () => {
    const { app } = await setup();
    await request(app).get('/api/game/version').expect(401);
    await game(app, '/api/game/version', 'yanlis').expect(401);
    const closed = await setup('');
    await game(closed.app, '/api/game/version').expect(503);
  });

  it('diskte olmayan model dosyası yayını engeller', async () => {
    const { agent, db } = await setup();
    await agent.post('/api/monsters').send({ vnum: 102, code: 'wolf', name: 'Kurt', level: 3, hp: 162 }).expect(201);
    db.prepare("UPDATE monsters SET model_path = 'models/yok.glb'").run();
    const preview = (await agent.get('/api/releases/preview').expect(200)).body;
    expect(preview.errors[0]).toContain('models/yok.glb');
    await agent.post('/api/releases').send({}).expect(400);
  });

  it('item oyun kodu benzersiz ve büyük harf', async () => {
    const { agent } = await setup();
    await agent.post('/api/items').send({ vnum: 10, code: 'RUSTY_SWORD', name: 'Kılıç', type: 'WEAPON', subtype: 'SWORD' }).expect(201);
    await agent.post('/api/items').send({ vnum: 20, code: 'RUSTY_SWORD', name: 'Kılıç 2', type: 'WEAPON', subtype: 'SWORD' }).expect(409);
    await agent.post('/api/items').send({ vnum: 30, code: 'kucuk', name: 'x', type: 'WEAPON', subtype: 'SWORD' }).expect(400);
    const blank = (await agent.post('/api/items').send({ vnum: 40, code: '', name: 'y', type: 'WEAPON', subtype: 'SWORD' }).expect(201)).body;
    expect(blank.code).toBeNull();
    await agent.post('/api/items').send({ vnum: 50, name: 'z', type: 'WEAPON', subtype: 'SWORD' }).expect(201);
  });
});
