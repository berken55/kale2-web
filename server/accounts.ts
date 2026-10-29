import crypto from 'node:crypto';
import type { DB } from './db.ts';
import { HttpError } from './http-error.ts';
import { logActivity } from './db.ts';

export interface AccountRecord {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  salt: string;
  specialty: string;
  created_at: string;
  last_login_at: string | null;
}

export interface AccountPublic {
  id: number;
  username: string;
  email: string;
  specialty: string;
  createdAt: string;
}

export interface RegisterInput {
  username?: unknown;
  email?: unknown;
  password?: unknown;
  specialty?: unknown;
}

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_SPECIALTIES = new Set(['bedensel', 'zihinsel', 'yakin', 'uzak', 'kararsiz']);

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): { hash: string; salt: string } {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(hash, 'hex');
    return keyBuffer.length === derivedKey.length && crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

export function registerAccount(db: DB, raw: RegisterInput): AccountPublic {
  const username = typeof raw.username === 'string' ? raw.username.trim() : '';
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  const password = typeof raw.password === 'string' ? raw.password : '';
  const specialty = typeof raw.specialty === 'string' && ALLOWED_SPECIALTIES.has(raw.specialty)
    ? raw.specialty
    : 'kararsiz';

  if (!username) {
    throw new HttpError(400, 'Oyuncu adı gereklidir.');
  }
  if (!USERNAME_REGEX.test(username)) {
    throw new HttpError(400, 'Oyuncu adı 3-24 karakter uzunluğunda olmalı ve yalnızca harf, rakam veya alt çizgi içerebilir.');
  }

  if (!email) {
    throw new HttpError(400, 'E-posta adresi gereklidir.');
  }
  if (!EMAIL_REGEX.test(email) || email.length > 254) {
    throw new HttpError(400, 'Geçerli bir e-posta adresi giriniz.');
  }

  if (!password) {
    throw new HttpError(400, 'Şifre gereklidir.');
  }
  if (password.length < 6) {
    throw new HttpError(400, 'Şifre en az 6 karakter uzunluğunda olmalıdır.');
  }
  if (password.length > 128) {
    throw new HttpError(400, 'Şifre en fazla 128 karakter olabilir.');
  }

  // Kullanıcı adı kontrolü (NOCASE)
  const existingUser = db.prepare('SELECT id FROM accounts WHERE username = ? COLLATE NOCASE').get(username);
  if (existingUser) {
    throw new HttpError(409, `"${username}" oyuncu adı zaten kullanımda. Lütfen başka bir isim seçin.`);
  }

  // E-posta kontrolü (NOCASE)
  const existingEmail = db.prepare('SELECT id FROM accounts WHERE email = ? COLLATE NOCASE').get(email);
  if (existingEmail) {
    throw new HttpError(409, 'Bu e-posta adresiyle kayıtlı bir hesap zaten var.');
  }

  const { hash, salt } = hashPassword(password);

  const stmt = db.prepare(`
    INSERT INTO accounts (username, email, password_hash, salt, specialty)
    VALUES (?, ?, ?, ?, ?)
  `);

  const info = stmt.run(username, email, hash, salt, specialty);
  const id = Number(info.lastInsertRowid);

  const row = db.prepare('SELECT id, username, email, specialty, created_at FROM accounts WHERE id = ?').get(id) as {
    id: number;
    username: string;
    email: string;
    specialty: string;
    created_at: string;
  };

  logActivity(db, 'create', 'account', id, `Yeni oyuncu kaydı: ${username} (${email})`);

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    specialty: row.specialty,
    createdAt: row.created_at,
  };
}

export function getAccountCount(db: DB): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number };
  return row?.count ?? 0;
}

export function listAccounts(db: DB, limit = 50, offset = 0): { items: AccountPublic[]; total: number } {
  const total = getAccountCount(db);
  const rows = db.prepare(`
    SELECT id, username, email, specialty, created_at
    FROM accounts
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as Array<{
    id: number;
    username: string;
    email: string;
    specialty: string;
    created_at: string;
  }>;

  return {
    items: rows.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      specialty: r.specialty,
      createdAt: r.created_at,
    })),
    total,
  };
}

import type { PlayerProfile, PlayerStats } from '../shared/types.ts';

export function loginPlayer(
  db: DB,
  raw: { identifier?: unknown; password?: unknown },
): PlayerProfile {
  const identifier = typeof raw.identifier === 'string' ? raw.identifier.trim() : '';
  const password = typeof raw.password === 'string' ? raw.password : '';

  if (!identifier) {
    throw new HttpError(400, 'Kullanıcı adı veya e-posta adresi gereklidir.');
  }
  if (!password) {
    throw new HttpError(400, 'Şifre gereklidir.');
  }

  const row = db
    .prepare(
      'SELECT id, username, email, password_hash, salt, specialty, created_at, last_login_at FROM accounts WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE',
    )
    .get(identifier, identifier) as AccountRecord | undefined;

  if (!row) {
    throw new HttpError(401, 'Kullanıcı adı/e-posta veya şifre hatalı.');
  }

  const valid = verifyPassword(password, row.password_hash, row.salt);
  if (!valid) {
    throw new HttpError(401, 'Kullanıcı adı/e-posta veya şifre hatalı.');
  }

  // Son giriş zamanını güncelle
  db.prepare("UPDATE accounts SET last_login_at = datetime('now') WHERE id = ?").run(row.id);

  logActivity(db, 'login', 'account', row.id, 'Oyuncu girisi yapildi: ' + row.username);

  return getPlayerProfile(db, row.id)!;
}

export function getPlayerProfile(db: DB, accountId: number): PlayerProfile | null {
  const row = db
    .prepare(
      'SELECT id, username, email, specialty, created_at as createdAt, last_login_at as lastLoginAt FROM accounts WHERE id = ?',
    )
    .get(accountId) as (AccountPublic & { lastLoginAt: string | null }) | undefined;

  if (!row) return null;

  // Oyuncunun maç istatistiklerini çek (player_name veya account_id eşleşmesi)
  const statsRow = db
    .prepare(
      'SELECT ' +
        'COUNT(DISTINCT mp.match_id) as matchesPlayed, ' +
        'SUM(COALESCE(mp.kills, 0)) as kills, ' +
        'SUM(COALESCE(mp.deaths, 0)) as deaths, ' +
        'SUM(COALESCE(mp.assists, 0)) as assists, ' +
        'SUM(CASE WHEN mp.won = 1 THEN 1 ELSE 0 END) as wins, ' +
        'ROUND(SUM(COALESCE(mp.dmg_hero, 0)), 0) as totalHeroDamage, ' +
        'MAX(COALESCE(mp.level_end, 1)) as maxLevel ' +
      'FROM match_players mp ' +
      'WHERE mp.account_id = ? OR mp.player_name = ? COLLATE NOCASE',
    )
    .get(row.id, row.username) as Record<string, unknown> | undefined;

  const matchesPlayed = Number(statsRow?.matchesPlayed || 0);
  const wins = Number(statsRow?.wins || 0);
  const kills = Number(statsRow?.kills || 0);
  const deaths = Number(statsRow?.deaths || 0);
  const assists = Number(statsRow?.assists || 0);
  const totalHeroDamage = Number(statsRow?.totalHeroDamage || 0);
  const maxLevel = Number(statsRow?.maxLevel || 1);

  const winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;
  const kda = deaths > 0 ? ((kills + assists) / deaths).toFixed(2) : String(kills + assists);

  const stats: PlayerStats = {
    matchesPlayed,
    wins,
    winRate,
    kills,
    deaths,
    assists,
    kda,
    totalHeroDamage,
    maxLevel,
  };

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    specialty: row.specialty,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt,
    stats,
  };
}

export function updatePlayerSpecialty(db: DB, accountId: number, rawSpecialty: string): PlayerProfile {
  if (!ALLOWED_SPECIALTIES.has(rawSpecialty)) {
    throw new HttpError(400, 'Geçersiz uzmanlık sınıfı.');
  }

  db.prepare('UPDATE accounts SET specialty = ? WHERE id = ?').run(rawSpecialty, accountId);
  logActivity(db, 'update', 'account', accountId, 'Uzmanlik sinifi guncellendi: ' + rawSpecialty);

  return getPlayerProfile(db, accountId)!;
}
