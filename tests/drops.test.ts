import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { openDatabase } from '../server/db.ts';
import { expectedDrops, formatPct, levelMultiplier, pctToPpm, seededRng, simulateDrops, type ResolvedDropTable } from '../shared/drops.ts';

const auth = { username: 'admin', password: 'secret', secret: 'test-secret', secureCookie: false };

async function setup() {
  const app = createApp({ db: openDatabase(':memory:'), uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'kale2-drop-')), auth });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret' }).expect(200);
  const item = (vnum: number, name: string, type = 'MATERIAL', subtype = 'REFINE') =>
    agent.post('/api/items').send({ vnum, name, type, subtype }).expect(201);
  await item(30028, 'Kurt Pençesi');
  await item(27001, 'Kırmızı İksir (K)', 'USE', 'POTION');
  await item(10, 'Kılıç', 'WEAPON', 'SWORD');
  const wolf = (await agent.post('/api/monsters').send({ vnum: 102, code: 'wolf', name: 'Kurt', level: 3, hp: 162 }).expect(201)).body;
  return { app, agent, wolf };
}

describe('drop hesapları', () => {
  it('yüzde ↔ ppm dönüşümü ve gösterimi', () => {
    expect(pctToPpm(5)).toBe(50_000);
    expect(pctToPpm(0.05)).toBe(500);
    expect(formatPct(500)).toBe('%0,05');
    expect(formatPct(50_000)).toBe('%5');
  });

  it('seviye farkı cezası', () => {
    expect(levelMultiplier(3, 3)).toBe(1);
    expect(levelMultiplier(8, 3)).toBe(0.8);
    expect(levelMultiplier(30, 3)).toBe(0.1);
    expect(levelMultiplier(1, 30)).toBe(1);
  });

  it('beklenen değer ile simülasyon uyuşur', () => {
    const table: ResolvedDropTable = {
      rows: [
        { itemVnum: 1, groupId: null, chancePpm: 200_000, countMin: 1, countMax: 3, upgradeMin: 0, upgradeMax: 0 },
        { itemVnum: null, groupId: 9, chancePpm: 500_000, countMin: 1, countMax: 1, upgradeMin: 0, upgradeMax: 0 },
      ],
      groups: {
        9: {
          rollMode: 'ONE_OF',
          rolls: 1,
          entries: [
            { itemVnum: 2, chancePpm: 3, countMin: 1, countMax: 1, upgradeMin: 0, upgradeMax: 2 },
            { itemVnum: 3, chancePpm: 1, countMin: 1, countMax: 1, upgradeMin: 0, upgradeMax: 0 },
          ],
        },
      },
    };
    const exp = expectedDrops(table, 1);
    expect(exp.get(1)).toBeCloseTo(0.4);
    expect(exp.get(2)).toBeCloseTo(0.375);
    expect(exp.get(3)).toBeCloseTo(0.125);
    const sim = simulateDrops(table, 1, 50_000, seededRng(7));
    for (const l of sim.lines) expect(l.total / 50_000).toBeCloseTo(l.expectedPerKill, 1);
    const sword = sim.lines.find((l) => l.itemVnum === 2)!;
    expect(Object.keys(sword.upgrades).sort()).toEqual(['0', '1', '2']);
    // Hiçbir şey düşmeme olasılığı: 0.8 * 0.5 = 0.4
    expect(sim.emptyKills / 50_000).toBeCloseTo(0.4, 1);
  });
});

describe('drop API', () => {
  it('yaratık droplarını kaydeder, okur ve simüle eder', async () => {
    const { agent, wolf } = await setup();
    const group = (
      await agent
        .post('/api/drop-groups')
        .send({ code: 'iksirler', name: 'İksirler', rollMode: 'ONE_OF', entries: [{ itemVnum: 27001, chancePpm: 1, countMin: 1, countMax: 2 }] })
        .expect(201)
    ).body;
    const saved = (
      await agent
        .put(`/api/monsters/${wolf.id}/drops`)
        .send({
          drops: [
            { itemVnum: 30028, chancePpm: 100_000 },
            { groupId: group.id, chancePpm: 1_000_000 },
          ],
        })
        .expect(200)
    ).body;
    expect(saved.drops).toHaveLength(2);
    expect(saved.items[30028].name).toBe('Kurt Pençesi');
    expect(saved.groups[group.id].code).toBe('iksirler');

    const sim = (await agent.post(`/api/monsters/${wolf.id}/simulate-drops`).send({ kills: 2000, seed: 1 }).expect(200)).body;
    expect(sim).toMatchObject({ kills: 2000, playerLevel: 3, multiplier: 1 });
    const potion = sim.lines.find((l: { item: { vnum: number } }) => l.item.vnum === 27001);
    expect(potion.expectedPerKill).toBeCloseTo(1.5);
    expect(potion.killsWithDrop).toBe(2000);

    const high = (await agent.post(`/api/monsters/${wolf.id}/simulate-drops`).send({ kills: 10, playerLevel: 50 }).expect(200)).body;
    expect(high.multiplier).toBe(0.1);

    // Kullanımdaki grup ve item silinemez; yaratık silinince dropları da gider
    await agent.del(`/api/drop-groups/${group.id}`).expect(409);
    const itemId = (await agent.get('/api/items?search=30028').expect(200)).body.items[0].id;
    await agent.del(`/api/items/${itemId}`).expect(409);
    await agent.del(`/api/monsters/${wolf.id}`).expect(204);
    await agent.del(`/api/drop-groups/${group.id}`).expect(204);
    await agent.del(`/api/items/${itemId}`).expect(204);
  });

  it('item vnum değişince droplar yeni vnum ile kalır', async () => {
    const { agent, wolf } = await setup();
    await agent.put(`/api/monsters/${wolf.id}/drops`).send({ drops: [{ itemVnum: 30028, chancePpm: 5 }] }).expect(200);
    const item = (await agent.get('/api/items?search=30028').expect(200)).body.items[0];
    const full = (await agent.get(`/api/items/${item.id}`).expect(200)).body;
    await agent.put(`/api/items/${item.id}`).send({ ...full, vnum: 30029 }).expect(200);
    expect((await agent.get(`/api/monsters/${wolf.id}/drops`).expect(200)).body.drops[0].itemVnum).toBe(30029);
  });

  it('hatalı drop satırlarını reddeder', async () => {
    const { agent, wolf } = await setup();
    const put = (drops: unknown[]) => agent.put(`/api/monsters/${wolf.id}/drops`).send({ drops });
    await put([{ itemVnum: 99999, chancePpm: 5 }]).expect(400);
    await put([{ chancePpm: 5 }]).expect(400);
    await put([{ itemVnum: 30028, groupId: 1, chancePpm: 5 }]).expect(400);
    await put([{ itemVnum: 30028, chancePpm: 2_000_000 }]).expect(400);
    await put([{ itemVnum: 30028, chancePpm: 5, countMin: 3, countMax: 1 }]).expect(400);
    await put([{ groupId: 42, chancePpm: 5 }]).expect(400);
    await agent.post('/api/drop-groups').send({ code: 'Bozuk Kod', name: 'x' }).expect(400);
    await agent.post('/api/drop-groups').send({ code: 'a', name: 'x' }).expect(201);
    await agent.post('/api/drop-groups').send({ code: 'a', name: 'y' }).expect(409);
  });

  it('genel droplar seviye ve rütbeye göre yaratığa uygulanır', async () => {
    const { agent, wolf } = await setup();
    await agent
      .put('/api/level-drops')
      .send({
        levelDrops: [
          { levelMin: 1, levelMax: 10, ranks: ['NORMAL'], itemVnum: 27001, chancePpm: 50_000 },
          { levelMin: 20, levelMax: 30, ranks: ['NORMAL'], itemVnum: 10, chancePpm: 50_000 },
          { levelMin: 1, levelMax: 10, ranks: ['BOSS'], itemVnum: 10, chancePpm: 50_000 },
        ],
      })
      .expect(200);
    await agent.put('/api/level-drops').send({ levelDrops: [{ levelMin: 9, levelMax: 2, ranks: ['NORMAL'], itemVnum: 10, chancePpm: 1 }] }).expect(400);
    expect((await agent.get('/api/level-drops').expect(200)).body.levelDrops).toHaveLength(3);
    const drops = (await agent.get(`/api/monsters/${wolf.id}/drops`).expect(200)).body;
    expect(drops.levelDrops.map((d: { itemVnum: number }) => d.itemVnum)).toEqual([27001]);
    const sim = (await agent.post(`/api/monsters/${wolf.id}/simulate-drops`).send({ kills: 100 }).expect(200)).body;
    expect(sim.lines.map((l: { item: { vnum: number } }) => l.item.vnum)).toEqual([27001]);
  });
});
