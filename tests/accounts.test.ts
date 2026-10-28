import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { openDatabase } from '../server/db.ts';
import { verifyPassword } from '../server/accounts.ts';

const auth = { username: 'admin', password: 'secret', secret: 'test-secret', secureCookie: false };

describe('oyuncu üyelik ve kayıt sistemi', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kale2-account-test-'));
    const db = openDatabase(':memory:');
    app = createApp({ db, uploadDir, auth });
  });

  it('geçerli bilgilerle yeni oyuncu kaydı oluşturur', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'AlpArslan',
        email: 'alp@kale2.com',
        password: 'superPassword123',
        specialty: 'bedensel',
      })
      .expect(201);

    expect(res.body.ok).toBe(true);
    expect(res.body.account).toMatchObject({
      username: 'AlpArslan',
      email: 'alp@kale2.com',
      specialty: 'bedensel',
    });
    expect(res.body.account.id).toBeGreaterThan(0);
    expect(res.body.account.password_hash).toBeUndefined(); // Şifre hash'i dışarı sızmamalı
    expect(res.body.account.salt).toBeUndefined();
  });

  it('aynı kullanıcı adıyla ikinci kaydı engeller (case-insensitive)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'SavasciKurt',
        email: 'kurt1@kale2.com',
        password: 'password123',
      })
      .expect(201);

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'savascikurt', // küçük harf
        email: 'kurt2@kale2.com',
        password: 'password123',
      })
      .expect(409);

    expect(res.body.error).toContain('zaten kullanımda');
  });

  it('aynı e-posta adresiyle ikinci kaydı engeller (case-insensitive)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'Ninja1',
        email: 'ninja@kale2.com',
        password: 'password123',
      })
      .expect(201);

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'Ninja2',
        email: 'NINJA@KALE2.COM', // büyük harf
        password: 'password123',
      })
      .expect(409);

    expect(res.body.error).toContain('Bu e-posta adresiyle kayıtlı bir hesap zaten var');
  });

  it('geçersiz veya kısa şifreyi reddeder', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'GecerliUser',
        email: 'test@kale2.com',
        password: '123', // < 6 karakter
      })
      .expect(400);

    expect(res.body.error).toContain('en az 6 karakter');
  });

  it('geçersiz kullanıcı adını reddeder', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'a!', // özel karakter ve çok kısa
        email: 'test@kale2.com',
        password: 'password123',
      })
      .expect(400);

    expect(res.body.error).toContain('Oyuncu adı 3-24 karakter');
  });

  it('geçersiz e-postayı reddeder', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'DogruNick',
        email: 'gecersiz-eposta',
        password: 'password123',
      })
      .expect(400);

    expect(res.body.error).toContain('Geçerli bir e-posta');
  });

  it('toplam kayıtlı oyuncu sayısını döner', async () => {
    const resBefore = await request(app).get('/api/public/accounts/stats').expect(200);
    expect(resBefore.body.totalPlayers).toBe(0);

    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'Oyuncu1',
        email: 'oyuncu1@kale2.com',
        password: 'password123',
      })
      .expect(201);

    const resAfter = await request(app).get('/api/public/accounts/stats').expect(200);
    expect(resAfter.body.totalPlayers).toBe(1);
  });
});
