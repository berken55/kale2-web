import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { openDatabase } from '../server/db.ts';
import { importMatchLogs } from '../server/match-logs.ts';

const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixtures/match-logs');
const auth = { username: 'admin', password: 'secret', secret: 'test-secret', secureCookie: false };

async function setup() {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kale2-match-test-'));
  const db = openDatabase(':memory:');
  importMatchLogs(db, FIXTURES);

  const app = createApp({ db, uploadDir, auth });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret' }).expect(200);

  return { app, agent, db };
}

describe('maç ve oturum API uç noktaları', () => {
  it('maç listesi ve istatistiklerini getirir', async () => {
    const { agent } = await setup();

    const statsRes = await agent.get('/api/matches/stats').expect(200);
    expect(statsRes.body).toMatchObject({
      totalMatches: 1,
      abortedMatches: 1,
      finishedMatches: 0,
      totalSessions: 2,
    });

    const listRes = await agent.get('/api/matches').expect(200);
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.matches).toHaveLength(1);
    expect(listRes.body.matches[0]).toMatchObject({
      status: 'aborted',
      playerCount: 2,
    });
  });

  it('maç detayını, oyuncularını ve olay akışını getirir', async () => {
    const { agent } = await setup();

    const listRes = await agent.get('/api/matches').expect(200);
    const matchId = listRes.body.matches[0].id;

    const detailRes = await agent.get(`/api/matches/${matchId}`).expect(200);
    expect(detailRes.body.id).toBe(matchId);
    expect(detailRes.body.players).toHaveLength(2);
    expect(detailRes.body.players.map((p: any) => p.playerName).sort()).toEqual(['Ayse', 'Burak']);

    // Olay akışı
    expect(detailRes.body.events.length).toBeGreaterThan(0);
    const eventTypes = detailRes.body.events.map((e: any) => e.ev);
    expect(eventTypes).toContain('join');
    expect(eventTypes).toContain('leave');

    // 404 testi
    await agent.get('/api/matches/99999').expect(404);
  });

  it('oyuncu oturum listesini filtrelerle getirir', async () => {
    const { agent } = await setup();

    const allSessions = await agent.get('/api/sessions').expect(200);
    expect(allSessions.body.total).toBe(2);

    const filtered = await agent.get('/api/sessions?search=Ayse').expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.sessions[0].playerName).toBe('Ayse');
    expect(filtered.body.sessions[0].class).toBe('warrior');
  });
});
