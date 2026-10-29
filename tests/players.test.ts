import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.ts';
import { openDatabase, type DB } from '../server/db.ts';
import { PRESENCE_WINDOW_MS } from '../shared/players.ts';
import { registerAccount } from '../server/accounts.ts';

const auth = { username: 'admin', password: 'admin-secret', secret: 'test-secret', secureCookie: false };
const databases: DB[] = [];
afterEach(() => { vi.restoreAllMocks(); databases.splice(0).forEach(db => db.close()); });
function setup() {
  const db = openDatabase(':memory:'); databases.push(db);
  const app = createApp({ db, uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'k2-players-')), auth });
  return { db, app };
}
async function register(app: ReturnType<typeof createApp>, username: string) {
  const agent = request.agent(app);
  const response = await agent.post('/api/players/register').send({ username, email: `${username}@example.com`, password: 'secret-12345' }).expect(201);
  return { agent, player: response.body.player, response };
}

describe('oyuncu lobisi ve hesaplar', () => {
  it('kayıtta otomatik giriş yapar; şifre ve oturum tokenlarını açık saklamaz', async () => {
    const { app, db } = setup();
    const { agent, player, response } = await register(app, 'Savasci');
    expect((await agent.get('/api/players/me').expect(200)).body.player.id).toBe(player.id);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(response.headers['cache-control']).toBe('no-store');
    const stored = db.prepare('SELECT password_hash FROM accounts').get() as { password_hash: string };
    expect(stored.password_hash).not.toContain('secret-12345');
    expect(stored.password_hash).toHaveLength(128);
    const tokenHash = (db.prepare('SELECT token_hash FROM player_sessions').get() as { token_hash: string }).token_hash;
    expect(response.headers['set-cookie'][0]).not.toContain(tokenHash);
    expect(response.body.player.password_hash).toBeUndefined();
    await agent.get('/api/items').expect(401);
    await agent.post('/api/players/logout').send({}).expect(200);
    await agent.get('/api/players/me').expect(401);
  });

  it('isimleri büyük/küçük harften bağımsız korur; giriş ve çıkış sonrası oturumu doğrular', async () => {
    const { app } = setup();
    const { agent } = await register(app, 'Ninja');
    await request(app).post('/api/players/register').send({ username: 'NINJA', email: 'other@example.com', password: 'secret-12345' }).expect(409);
    await agent.post('/api/players/logout').send({}).expect(200);
    await agent.post('/api/players/login').send({ username: 'ninja', password: 'wrong-pass' }).expect(401);
    await agent.post('/api/players/login').send({ username: 'ninja', password: 'secret-12345' }).expect(200);
    await agent.get('/api/players/me').expect(200);
    await request(app).post('/api/players/register').send({ username: 'a', password: 'short' }).expect(400);
  });

  it('oturum yoksa liste, mesaj ve karakter erişimini reddeder; yönetici çerezi oyuncu hesabı değildir', async () => {
    const { app } = setup();
    await request(app).get('/api/players/members').expect(401);
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'admin-secret' }).expect(200);
    await admin.get('/api/players/members').expect(401);
    await admin.get('/api/items').expect(200);
  });

  it('son görülmeyi kalıcı tutar; çevrimiçi durumunu etkin oturumlardan hesaplar', async () => {
    const { app } = setup(); let now = 1_800_000_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const a = await register(app, 'OyuncuA'); const b = await register(app, 'OyuncuB');
    let rows = (await a.agent.get('/api/players/members').expect(200)).body.members;
    expect(rows[0]).toMatchObject({ id: b.player.id, online: true, lastSeenAt: now });
    expect(Object.keys(rows[0]).sort()).toEqual(['id', 'lastSeenAt', 'online', 'unread', 'username'].sort());
    now += PRESENCE_WINDOW_MS + 1;
    rows = (await a.agent.get('/api/players/members')).body.members;
    expect(rows[0].online).toBe(false);
    expect(rows[0].lastSeenAt).toBeLessThan(now);
    await b.agent.post('/api/players/heartbeat').send({}).expect(200);
    expect((await a.agent.get('/api/players/members')).body.members[0]).toMatchObject({ online: true, lastSeenAt: now });
    await b.agent.post('/api/players/logout').send({}).expect(200);
    expect((await a.agent.get('/api/players/members')).body.members[0]).toMatchObject({ online: false, lastSeenAt: now });
  });

  it('diğer cihazdaki etkin oturumu çıkışla çevrimdışı yapmaz; süresi dolmuş oturumu reddeder', async () => {
    const { app, db } = setup(); const a = await register(app, 'Avci'); const b = await register(app, 'Dost');
    const second = request.agent(app);
    await second.post('/api/players/login').send({ username: 'Dost', password: 'secret-12345' }).expect(200);
    await b.agent.post('/api/players/logout').send({});
    expect((await a.agent.get('/api/players/members')).body.members[0].online).toBe(true);
    db.prepare('UPDATE player_sessions SET expires_at=0 WHERE player_id=?').run(b.player.id);
    await second.get('/api/players/me').expect(401);
  });

  it('mesajları yalnız taraflara açar; okunmamış ve okundu kaydını doğru kişide günceller', async () => {
    const { app } = setup(); const a = await register(app, 'Ali'); const b = await register(app, 'Berk'); const c = await register(app, 'Cem');
    const text = '<img src=x onerror=alert(1)> Bu akşam 21.00?';
    const sent = (await a.agent.post(`/api/players/messages/${b.player.id}`).send({ body: text }).expect(201)).body.message;
    expect(sent.body).toBe(text);
    expect((await b.agent.get('/api/players/members')).body.members.find((p: { id: number }) => p.id === a.player.id).unread).toBe(1);
    expect((await c.agent.get(`/api/players/messages/${a.player.id}`).expect(200)).body.messages).toEqual([]);
    await c.agent.post(`/api/players/messages/${a.player.id}/read`).send({ throughId: sent.id }).expect(200);
    expect((await a.agent.get(`/api/players/messages/${b.player.id}`)).body.messages[0].readAt).toBeNull();
    await b.agent.post(`/api/players/messages/${a.player.id}/read`).send({ throughId: sent.id }).expect(200);
    expect((await a.agent.get(`/api/players/messages/${b.player.id}`)).body.messages[0].readAt).toBeTypeOf('number');
    expect((await b.agent.get('/api/players/members')).body.members.find((p: { id: number }) => p.id === a.player.id).unread).toBe(0);
    await a.agent.post(`/api/players/messages/${a.player.id}`).send({ body: 'kendime' }).expect(404);
    await a.agent.post('/api/players/messages/9999').send({ body: 'yok' }).expect(404);
    await a.agent.post(`/api/players/messages/${b.player.id}`).send({ body: '  ' }).expect(400);
    await a.agent.post(`/api/players/messages/${b.player.id}`).send({ body: 'x'.repeat(2001) }).expect(400);
  });

  it('mesaj geçmişini sayfalar; başka konuşmaların mesajlarını dahil etmez', async () => {
    const { app, db } = setup(); const a = await register(app, 'SayfaA'); const b = await register(app, 'SayfaB'); const c = await register(app, 'SayfaC');
    const insert = db.prepare('INSERT INTO player_messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)');
    for (let i = 0; i < 65; i++) insert.run(a.player.id, b.player.id, `mesaj-${i}`, Date.now());
    insert.run(a.player.id, c.player.id, 'gizli', Date.now());
    const latest = (await b.agent.get(`/api/players/messages/${a.player.id}`)).body;
    expect(latest.messages).toHaveLength(50); expect(latest.hasMore).toBe(true); expect(latest.messages[0].body).toBe('mesaj-15');
    const older = (await b.agent.get(`/api/players/messages/${a.player.id}?before=${latest.messages[0].id}`)).body;
    expect(older.messages).toHaveLength(15); expect(older.hasMore).toBe(false);
    const fresh = (await b.agent.get(`/api/players/messages/${a.player.id}?after=${latest.messages[48].id}`)).body;
    expect(fresh.messages).toHaveLength(1); expect(fresh.messages[0].body).toBe('mesaj-64');
    await b.agent.get(`/api/players/messages/${a.player.id}?after=0&before=9`).expect(400);
  });

  it('karakterleri hesapla sınırlar; uzmanlık, isim tekrarı ve yuva limitini doğrular', async () => {
    const { app } = setup(); const a = await register(app, 'KarakterA'); const b = await register(app, 'KarakterB');
    await a.agent.post('/api/players/characters').send({ name: 'Gölge', class: 'ninja', specialty: 'melee' }).expect(201);
    await a.agent.post('/api/players/characters').send({ name: 'Gölge', class: 'ninja', specialty: 'melee' }).expect(409);
    await a.agent.post('/api/players/characters').send({ name: 'Hata', class: 'warrior', specialty: 'ranged' }).expect(400);
    expect((await b.agent.get('/api/players/characters')).body.characters).toEqual([]);
    for (let i = 0; i < 5; i++) await a.agent.post('/api/players/characters').send({ name: `Asker${i}`, class: 'warrior', specialty: 'mental' }).expect(201);
    await a.agent.post('/api/players/characters').send({ name: 'Yedinci', class: 'warrior', specialty: 'body' }).expect(409);
  });

  it('çapraz kaynak ve aşırı mesaj gönderimini reddeder', async () => {
    const { app } = setup(); const a = await register(app, 'LimitA'); const b = await register(app, 'LimitB');
    await a.agent.post('/api/players/heartbeat').set('Origin', 'https://unrelated.example').send({}).expect(403);
    await a.agent.post('/api/players/heartbeat').set('Sec-Fetch-Site', 'cross-site').send({}).expect(403);
    for (let i = 0; i < 30; i++) await a.agent.post(`/api/players/messages/${b.player.id}`).send({ body: `${i}` }).expect(201);
    await a.agent.post(`/api/players/messages/${b.player.id}`).send({ body: 'limit' }).expect(429);
  });

  it('mevcut accounts hesabıyla yeni lobiye girer; e-posta girişi ve eski kayıt adresi aynı oturumu kullanır', async () => {
    const { app, db } = setup();
    const existing = registerAccount(db, { username: 'EskiOyuncu', email: 'eski@example.com', password: 'old123' });
    const agent = request.agent(app);
    const logged = await agent.post('/api/players/login').send({ username: 'eski@example.com', password: 'old123' }).expect(200);
    expect(logged.body.player.id).toBe(existing.id);
    expect((await agent.get('/api/players/me')).body.player.id).toBe(existing.id);
    const registered = await agent.post('/api/auth/register').send({ username: 'YeniOyuncu', email: 'yeni@example.com', password: 'secret-12345' }).expect(201);
    expect((await agent.get('/api/players/me')).body.player.id).toBe(registered.body.account.id);
    expect((await agent.get('/api/public/accounts/stats')).body.totalPlayers).toBe(2);
    await agent.get(`/api/player/profile/${existing.id}`).expect(403);
    await agent.patch('/api/player/specialty').send({ accountId: existing.id, specialty: 'uzak' }).expect(403);
    await agent.get(`/api/player/profile/${registered.body.account.id}`).expect(200);
  });
});
