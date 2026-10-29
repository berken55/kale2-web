import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { openDatabase } from '../server/db.ts';

const auth = { username: 'admin', password: 'secret', secret: 'test-secret', secureCookie: false };

async function setup() {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kale2-fb-test-'));
  const db = openDatabase(':memory:');
  const app = createApp({ db, uploadDir, auth });
  return { app, db };
}

describe('oyuncu girisi, profil ve beta geri bildirim (feedback) testleri', () => {
  it('oyuncu kayit olur, giris yapar ve profilini gorur', async () => {
    const { app } = await setup();

    // 1. Kayıt
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'SavasciAlp',
        email: 'alp@kale2.com',
        password: 'password123',
        specialty: 'bedensel',
      })
      .expect(201);

    expect(regRes.body.account.username).toBe('SavasciAlp');
    const accountId = regRes.body.account.id;

    // 2. Yanlış şifre ile giriş denemesi (401)
    await request(app)
      .post('/api/player/login')
      .send({
        identifier: 'SavasciAlp',
        password: 'wrongpassword',
      })
      .expect(401);

    // 3. Başarılı Giriş (Kullanıcı adı ile)
    const loginRes = await request(app)
      .post('/api/player/login')
      .send({
        identifier: 'SavasciAlp',
        password: 'password123',
      })
      .expect(200);

    expect(loginRes.body.ok).toBe(true);
    expect(loginRes.body.profile.id).toBe(accountId);
    expect(loginRes.body.profile.specialty).toBe('bedensel');
    expect(loginRes.body.profile.stats).toBeDefined();

    // 4. E-posta ile giriş
    const emailLoginRes = await request(app)
      .post('/api/player/login')
      .send({
        identifier: 'alp@kale2.com',
        password: 'password123',
      })
      .expect(200);

    expect(emailLoginRes.body.profile.username).toBe('SavasciAlp');

    // 5. Profil detayı
    const profRes = await request(app).get(`/api/player/profile/${accountId}`).expect(200);
    expect(profRes.body.profile.username).toBe('SavasciAlp');

    // 6. Uzmanlık sınıfını güncelleme (bedensel -> zihinsel)
    const updateRes = await request(app)
      .patch('/api/player/specialty')
      .send({
        accountId,
        specialty: 'zihinsel',
      })
      .expect(200);

    expect(updateRes.body.profile.specialty).toBe('zihinsel');
  });

  it('beta geri bildirimi olusturur ve listeler', async () => {
    const { app } = await setup();

    // Feedback gönder
    const fbRes = await request(app)
      .post('/api/player/feedback')
      .send({
        playerName: 'GokTurk',
        category: 'bug',
        rating: 4,
        subject: 'Vahsi Uzman yetenek animasyonu takilmasi',
        message: 'Kameraya yaklasip kilic vurduktan sonra donus hareketi 1 saniye gecikiyor.',
      })
      .expect(201);

    expect(fbRes.body.ok).toBe(true);
    expect(fbRes.body.item.subject).toBe('Vahsi Uzman yetenek animasyonu takilmasi');
    expect(fbRes.body.item.rating).toBe(4);
    expect(fbRes.body.item.category).toBe('bug');

    // Listeleme
    const listRes = await request(app).get('/api/player/feedback').expect(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].playerName).toBe('GokTurk');
  });
});
