import crypto from 'node:crypto';
import { promisify } from 'node:util';
import express, { type RequestHandler } from 'express';
import { z } from 'zod';
import type { DB } from './db.ts';
import type { AuthConfig } from './auth.ts';
import { PRESENCE_WINDOW_MS, SPECIALTIES, type Player } from '../shared/players.ts';
import { registerAccount, getPlayerProfile } from './accounts.ts';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'kale2_player_session';
const TTL = 30 * 24 * 60 * 60 * 1000;
const digest = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
type Account = { id: number; username: string; password_hash: string; salt: string; last_seen_at: number };
const publicPlayer = (row: Account): Player => ({ id: row.id, username: row.username, lastSeenAt: row.last_seen_at });
const credentials = z.object({ username: z.string().trim().min(3).max(254), password: z.string().min(6).max(128) });
const positiveId = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** Additive schema; the player beta is separate from admin credentials and actual game saves. */
export function initializePlayers(db: DB) {
  const columns = db.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string }>;
  if (!columns.some(c => c.name === 'last_seen_at')) {
    db.exec(`ALTER TABLE accounts ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0;
      UPDATE accounts SET last_seen_at=COALESCE(CAST(strftime('%s', COALESCE(last_login_at, created_at)) AS INTEGER)*1000, 0);`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_sessions (
      token_hash TEXT PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_player_sessions_player ON player_sessions(player_id, last_seen_at);
    CREATE TABLE IF NOT EXISTS lobby_characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE,
      class TEXT NOT NULL CHECK(class IN ('warrior','ninja')),
      specialty TEXT NOT NULL CHECK(specialty IN ('body','mental','melee','ranged')),
      created_at INTEGER NOT NULL,
      UNIQUE(player_id, name)
    );
    CREATE TABLE IF NOT EXISTS player_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      recipient_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER,
      CHECK(sender_id <> recipient_id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_recipient ON player_messages(recipient_id, sender_id, id);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON player_messages(sender_id, recipient_id, id);
  `);
}

export function startPlayerSession(db: DB, config: AuthConfig, id: number, res: express.Response) {
  const now = Date.now();
  db.prepare('DELETE FROM player_sessions WHERE expires_at <= ?').run(now);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO player_sessions (token_hash, player_id, expires_at, last_seen_at) VALUES (?, ?, ?, ?)').run(digest(token), id, now + TTL, now);
  db.prepare("UPDATE accounts SET last_seen_at=?, last_login_at=datetime('now') WHERE id=?").run(now, id);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.secureCookie, path: '/', maxAge: TTL });
}

export function currentPlayer(db: DB, req: express.Request): Account | undefined {
  const token = req.cookies?.[COOKIE];
  if (typeof token !== 'string' || token.length !== 64) return undefined;
  return db.prepare('SELECT a.* FROM accounts a JOIN player_sessions s ON s.player_id=a.id WHERE s.token_hash=? AND s.expires_at>?').get(digest(token), Date.now()) as Account | undefined;
}

export function playersRouter(db: DB, config: AuthConfig) {
  initializePlayers(db);
  const router = express.Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  // Cookie-authenticated writes accept only same-origin browser requests.
  router.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Bu kaynaktan işlem yapılamaz.' });
      if (origin) {
        try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Bu kaynaktan işlem yapılamaz.' }); }
        catch { return res.status(403).json({ error: 'Geçersiz kaynak.' }); }
      }
      if (!req.is('application/json')) return res.status(415).json({ error: 'JSON içerik gerekli.' });
    }
    next();
  });
  const attempts = new Map<string, { count: number; until: number }>();
  const limited = (key: string, limit: number, window: number) => {
    const now = Date.now();
    if (attempts.size > 1000) for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
    const old = attempts.get(key);
    const next = old && old.until > now ? { ...old, count: old.count + 1 } : { count: 1, until: now + window };
    attempts.set(key, next);
    return next.count > limit;
  };
  const authLimit: RequestHandler = (req, res, next) => {
    if (limited(`auth:${req.ip}`, 20, 15 * 60 * 1000)) return res.status(429).json({ error: 'Çok fazla deneme. Biraz sonra tekrar deneyin.' });
    next();
  };
  router.post('/register', authLimit, (req, res, next) => {
    try {
      const account = db.transaction(() => {
        const created = registerAccount(db, req.body ?? {});
        startPlayerSession(db, config, created.id, res);
        return created;
      })();
      res.status(201).json({ player: { id: account.id, username: account.username, lastSeenAt: Date.now() }, account, ok: true });
    } catch (error) { next(error); }
  });
  router.post('/login', authLimit, (req, res, next) => {
    void (async () => {
      const input = credentials.parse({ username: req.body?.username ?? req.body?.identifier, password: req.body?.password });
      const account = db.prepare('SELECT * FROM accounts WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE').get(input.username, input.username) as Account | undefined;
      // Perform the same expensive operation even for an unknown username.
      const salt = account?.salt ?? '0'.repeat(32), expected = account?.password_hash ?? '0'.repeat(128);
      const actual = (await scrypt(input.password, salt, 64)) as Buffer;
      const correct = crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
      if (!account || !correct) return res.status(401).json({ error: 'Oyuncu adı veya şifre hatalı.' });
      const oldToken = req.cookies?.[COOKIE];
      if (typeof oldToken === 'string') db.prepare('DELETE FROM player_sessions WHERE token_hash = ?').run(digest(oldToken));
      startPlayerSession(db, config, account.id, res);
      res.json({ ok: true, player: { ...publicPlayer(account), lastSeenAt: Date.now() }, profile: getPlayerProfile(db, account.id) });
    })().catch(next);
  });

  router.use((req, res, next) => {
    const token = req.cookies?.[COOKIE];
    if (typeof token !== 'string' || token.length !== 64) return res.status(401).json({ error: 'Oyuncu hesabınızla giriş yapın.' });
    const account = currentPlayer(db, req);
    if (!account) return res.status(401).json({ error: 'Oyuncu oturumunuz sona erdi.' });
    res.locals.player = publicPlayer(account);
    res.locals.tokenHash = digest(token);
    next();
  });
  const playerOf = (res: express.Response) => res.locals.player as Player;
  const touch = (res: express.Response) => {
    const now = Date.now();
    db.transaction(() => {
      db.prepare('UPDATE player_sessions SET last_seen_at=? WHERE token_hash=?').run(now, res.locals.tokenHash);
      db.prepare('UPDATE accounts SET last_seen_at=? WHERE id=?').run(now, playerOf(res).id);
    })();
    return now;
  };
  router.get('/me', (_req, res) => { const now = touch(res); res.json({ player: { ...playerOf(res), lastSeenAt: now } }); });
  router.post('/heartbeat', (_req, res) => res.json({ lastSeenAt: touch(res) }));
  router.post('/logout', (_req, res) => {
    touch(res);
    db.prepare('DELETE FROM player_sessions WHERE token_hash=?').run(res.locals.tokenHash);
    res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.secureCookie });
    res.json({ ok: true });
  });
  router.get('/members', (req, res) => {
    const { search, offset } = z.object({ search: z.string().trim().max(24).default(''), offset: z.coerce.number().int().min(0).max(1_000_000).default(0) }).parse(req.query);
    const me = playerOf(res).id, now = Date.now();
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = db.prepare(`SELECT p.id, p.username, p.last_seen_at AS lastSeenAt,
      EXISTS(SELECT 1 FROM player_sessions s WHERE s.player_id=p.id AND s.expires_at>? AND s.last_seen_at>=?) AS online,
      (SELECT COUNT(*) FROM player_messages m WHERE m.sender_id=p.id AND m.recipient_id=? AND m.read_at IS NULL) AS unread
      FROM accounts p WHERE p.id<>? AND p.username LIKE ? ESCAPE '\\'
      ORDER BY unread DESC, online DESC, p.last_seen_at DESC, p.id ASC LIMIT 51 OFFSET ?`).all(now, now - PRESENCE_WINDOW_MS, me, me, pattern, offset) as Array<Record<string, unknown>>;
    res.json({ members: rows.slice(0, 50).map(r => ({ ...r, online: Boolean(r.online) })), hasMore: rows.length > 50 });
  });
  const contact = (value: unknown, res: express.Response) => {
    const id = positiveId.parse(value);
    if (id === playerOf(res).id) return null;
    return db.prepare('SELECT id FROM accounts WHERE id=?').get(id) ? id : null;
  };
  const messageFields = 'id, sender_id AS senderId, recipient_id AS recipientId, body, created_at AS createdAt, read_at AS readAt';
  router.get('/messages/:playerId', (req, res) => {
    const other = contact(req.params.playerId, res);
    if (!other) return res.status(404).json({ error: 'Oyuncu bulunamadı.' });
    const { before, after } = z.object({ before: positiveId.optional(), after: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional() }).refine(q => !(q.before !== undefined && q.after !== undefined)).parse(req.query);
    const me = playerOf(res).id;
    const clause = before !== undefined ? 'AND id < ?' : after !== undefined ? 'AND id > ?' : '';
    const rows = db.prepare(`SELECT ${messageFields} FROM player_messages WHERE ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) ${clause} ORDER BY id ${after !== undefined ? 'ASC' : 'DESC'} LIMIT 51`).all(me, other, other, me, ...((before ?? after) !== undefined ? [before ?? after] : []));
    const messages = rows.slice(0, 50);
    if (after === undefined) messages.reverse();
    res.json({ messages, hasMore: rows.length > 50 });
  });
  router.post('/messages/:playerId', (req, res) => {
    const other = contact(req.params.playerId, res);
    if (!other) return res.status(404).json({ error: 'Oyuncu bulunamadı.' });
    const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
    if (limited(`msg:${playerOf(res).id}`, 30, 60_000)) return res.status(429).json({ error: 'Çok hızlı mesaj gönderiyorsunuz. Biraz bekleyin.' });
    const id = db.prepare('INSERT INTO player_messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)').run(playerOf(res).id, other, body, Date.now()).lastInsertRowid;
    touch(res);
    res.status(201).json({ message: db.prepare(`SELECT ${messageFields} FROM player_messages WHERE id=?`).get(id) });
  });
  router.post('/messages/:playerId/read', (req, res) => {
    const other = contact(req.params.playerId, res);
    if (!other) return res.status(404).json({ error: 'Oyuncu bulunamadı.' });
    const { throughId } = z.object({ throughId: positiveId }).parse(req.body);
    db.prepare('UPDATE player_messages SET read_at=? WHERE sender_id=? AND recipient_id=? AND id<=? AND read_at IS NULL').run(Date.now(), other, playerOf(res).id, throughId);
    res.json({ ok: true });
  });
  router.get('/characters', (_req, res) => res.json({ characters: db.prepare('SELECT id, name, class, specialty FROM lobby_characters WHERE player_id=? ORDER BY id').all(playerOf(res).id) }));
  router.post('/characters', (req, res) => {
    const input = z.object({ name: z.string().trim().min(2).max(20).regex(/^[\p{L}\p{N}_]+$/u, 'İsim yalnızca harf, rakam ve alt çizgi içerebilir.'), class: z.enum(['warrior', 'ninja']), specialty: z.enum(['body', 'mental', 'melee', 'ranged']) }).parse(req.body);
    if (!(SPECIALTIES[input.class] as readonly string[]).includes(input.specialty)) return res.status(400).json({ error: 'Bu uzmanlık seçilen karaktere ait değil.' });
    const me = playerOf(res).id;
    if ((db.prepare('SELECT COUNT(*) AS count FROM lobby_characters WHERE player_id=?').get(me) as { count: number }).count >= 6) return res.status(409).json({ error: 'En fazla 6 önizleme karakteri oluşturabilirsiniz.' });
    if (db.prepare('SELECT id FROM lobby_characters WHERE player_id=? AND name=?').get(me, input.name)) return res.status(409).json({ error: 'Bu isimde bir karakteriniz var.' });
    const id = Number(db.prepare('INSERT INTO lobby_characters (player_id, name, class, specialty, created_at) VALUES (?, ?, ?, ?, ?)').run(me, input.name, input.class, input.specialty, Date.now()).lastInsertRowid);
    res.status(201).json({ character: { id, ...input } });
  });
  return router;
}
