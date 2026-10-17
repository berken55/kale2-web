import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { openDatabase } from '../server/db.ts';

const auth = { username: 'admin', password: 'secret', secret: 'test-secret', secureCookie: false };

async function setup() {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kale2-map-'));
  const app = createApp({ db: openDatabase(':memory:'), uploadDir, auth, gameToken: 't' });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret' }).expect(200);
  const wolf = (await agent.post('/api/monsters').send({ vnum: 102, code: 'wolf', name: 'Kurt', level: 3, hp: 162 }).expect(201)).body;
  const boss = (await agent.post('/api/monsters').send({ vnum: 691, code: 'orc_lord', name: 'Ork Reisi', rank: 'BOSS', level: 50, hp: 24618 }).expect(201)).body;
  const map = (await agent.post('/api/maps').send({ code: 'village1', name: '1. Köy', worldMinX: -200, worldMinZ: -200, worldMaxX: 200, worldMaxZ: 200 }).expect(201)).body;
  return { app, agent, wolf, boss, map, uploadDir };
}

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

describe('haritalar ve spawn', () => {
  it('bölgeleri kaydeder, okur ve bundle a koyar', async () => {
    const { app, agent, wolf, boss, map } = await setup();
    const saved = (
      await agent
        .put(`/api/maps/${map.id}/regions`)
        .send({
          regions: [
            { code: 'kurt_ormani', name: 'Kurt Ormanı', x: 40, z: -60, radius: 25, levelMin: 1, levelMax: 10, spawns: [{ monsterId: wolf.id, maxAlive: 4, packMin: 2, packMax: 4, respawnMinS: 45, respawnMaxS: 75 }] },
            { code: 'ork_ini', name: 'Ork İni', shape: 'POLYGON', points: [[100, 100], [150, 100], [150, 250]], levelMin: 40, levelMax: 60, spawns: [{ monsterId: boss.id, kind: 'BOSS', announce: true, respawnMinS: 1800, respawnMaxS: 3600 }] },
          ],
        })
        .expect(200)
    ).body;
    expect(saved.regions).toHaveLength(2);
    expect(saved.monsters[wolf.id].code).toBe('wolf');
    expect((await agent.get('/api/maps').expect(200)).body[0]).toMatchObject({ code: 'village1', regionCount: 2, spawnCount: 2 });

    await agent.post(`/api/maps/${map.id}/minimap`).attach('file', PNG, { filename: 'm.png', contentType: 'image/png' }).expect(200);
    const preview = (await agent.get('/api/releases/preview').expect(200)).body;
    expect(preview.warnings.some((w: string) => w.includes('Ork İni') && w.includes('sınırlarının dışına'))).toBe(true);
    await agent.post('/api/releases').send({}).expect(201);
    const bundle = (await request(app).get('/api/game/bundle').set('Authorization', 'Bearer t').expect(200)).body;
    expect(bundle.maps.village1.rect).toEqual([-200, -200, 200, 200]);
    expect(bundle.maps.village1.regions[0]).toMatchObject({ code: 'kurt_ormani', shape: 'CIRCLE', radius: 25, level: [1, 10], spawns: [{ monster: 'wolf', kind: 'PACK', max_alive: 4, pack: [2, 4], respawn: [45, 75] }] });
    expect(bundle.maps.village1.regions[1]).toMatchObject({ shape: 'POLYGON', spawns: [{ monster: 'orc_lord', kind: 'BOSS', announce: true }] });

    // Spawnda kullanılan canavar silinemez
    await agent.del(`/api/monsters/${wolf.id}`).expect(409);
  });

  it('hatalı bölgeleri reddeder', async () => {
    const { agent, wolf, map } = await setup();
    const put = (regions: unknown[]) => agent.put(`/api/maps/${map.id}/regions`).send({ regions });
    await put([{ code: 'a', name: 'A', shape: 'POLYGON', points: [[0, 0], [1, 1]] }]).expect(400);
    await put([{ code: 'a', name: 'A' }, { code: 'a', name: 'B' }]).expect(400);
    await put([{ code: 'A B', name: 'A' }]).expect(400);
    await put([{ code: 'a', name: 'A', spawns: [{ monsterId: 9999 }] }]).expect(400);
    await put([{ code: 'a', name: 'A', spawns: [{ monsterId: wolf.id, packMin: 5, packMax: 2 }] }]).expect(400);
    await agent.post('/api/maps').send({ code: 'village1', name: 'x', worldMinX: 0, worldMinZ: 0, worldMaxX: 1, worldMaxZ: 1 }).expect(409);
    await agent.post('/api/maps').send({ code: 'v2', name: 'x', worldMinX: 5, worldMinZ: 0, worldMaxX: 1, worldMaxZ: 1 }).expect(400);
    await agent.post(`/api/maps/${map.id}/minimap`).attach('file', Buffer.from('x'), { filename: 'm.txt', contentType: 'text/plain' }).expect(400);
  });
});
