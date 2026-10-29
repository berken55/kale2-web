import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db.ts';

/**
 * Oyun sunucusunun maç ve oturum günlüklerini (MatchRecorder, JSONL) veritabanına aktarır.
 * - sessions-<tarih>.jsonl: sona eklenen dosya; kaldığı bayttan devam eder, yalnız tamamlanmış satırları okur.
 * - match-<kimlik>.jsonl: maç bitince (match_close) bir kez aktarılır. Kapanışı hiç yazılmamış (sunucu çöktü)
 *   dosya staleMs boyunca değişmezse "crashed" olarak aktarılır.
 * Yeniden çalıştırmak güvenlidir: aynı maç silinip yeniden yazılır, oturum satırları kimliğe göre eşlenir.
 */

export interface MatchLogImportResult {
  sessions: number;
  matches: number;
  pending: number;
  errors: string[];
}

export interface MatchLogImportOptions {
  /** Kapanışı olmayan maç dosyası bu kadar değişmezse çökmüş sayılır (ms) */
  staleMs?: number;
  now?: number;
}

type Row = Record<string, unknown>;

const DEFAULT_STALE_MS = 6 * 60 * 60 * 1000;

const num = (v: unknown, def = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const str = (v: unknown, def = '') => (typeof v === 'string' ? v : def);
/** Godot'nun UTC zamanı (2026-10-29T07:56:45) → SQLite biçimi (2026-10-29 07:56:45) */
const sqlTime = (v: unknown) => (typeof v === 'string' && v ? v.replace('T', ' ').slice(0, 19) : null);

export function importMatchLogs(db: DB, dir: string, opts: MatchLogImportOptions = {}): MatchLogImportResult {
  const result: MatchLogImportResult = { sessions: 0, matches: 0, pending: 0, errors: [] };
  if (!fs.existsSync(dir)) {
    result.errors.push(`Günlük klasörü yok: ${dir}`);
    return result;
  }
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;
  const now = opts.now ?? Date.now();
  const state = db.prepare('SELECT offset, done FROM match_log_files WHERE file = ?');
  const saveState = db.prepare(
    `INSERT INTO match_log_files (file, offset, done, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(file) DO UPDATE SET offset = excluded.offset, done = excluded.done, updated_at = excluded.updated_at`,
  );
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  for (const file of files) {
    const full = path.join(dir, file);
    const prev = state.get(file) as { offset: number; done: number } | undefined;
    try {
      if (file.startsWith('sessions-')) {
        const { rows, offset } = readFrom(full, prev?.offset ?? 0);
        if (!rows.length) continue;
        db.transaction(() => {
          for (const r of rows) result.sessions += importSession(db, r);
          saveState.run(file, offset, 0);
        })();
      } else if (file.startsWith('match-')) {
        if (prev?.done) continue;
        const { rows } = readFrom(full, 0);
        const closed = rows.some((r) => r.ev === 'match_close');
        const stale = now - fs.statSync(full).mtimeMs > staleMs;
        if (!rows.length || (!closed && !stale)) {
          result.pending++;
          continue;
        }
        db.transaction(() => {
          importMatch(db, rows, closed);
          saveState.run(file, 0, 1);
        })();
        result.matches++;
      }
    } catch (err) {
      result.errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}

/** Dosyayı verilen bayttan okur; yarım kalan son satırı bırakır (sunucu hâlâ yazıyor olabilir) */
function readFrom(file: string, offset: number): { rows: Row[]; offset: number } {
  const buf = fs.readFileSync(file);
  if (offset > buf.length) offset = 0; // dosya yeniden yazılmış
  const end = buf.lastIndexOf(0x0a) + 1;
  if (end <= offset) return { rows: [], offset };
  const rows: Row[] = [];
  for (const line of buf.subarray(offset, end).toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line);
      if (v && typeof v === 'object' && !Array.isArray(v)) rows.push(v as Row);
    } catch {
      // bozuk satır atlanır
    }
  }
  return { rows, offset: end };
}

function accountId(db: DB, name: string): number | null {
  const row = db.prepare('SELECT id FROM accounts WHERE username = ? COLLATE NOCASE').get(name) as { id: number } | undefined;
  return row?.id ?? null;
}

function importSession(db: DB, r: Row): number {
  const key = str(r.session);
  const name = str(r.name);
  if (!key || !name) return 0;
  if (r.ev === 'session_join') {
    const info = db
      .prepare(
        `INSERT OR IGNORE INTO game_sessions
         (session_key, player_name, account_id, class, spec, level_start, game_version, protocol, joined_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(key, name, accountId(db, name), str(r.class), str(r.spec), num(r.level, 1), str(r.version),
        num(r.protocol, -1), sqlTime(r.ts) ?? '');
    return info.changes;
  }
  if (r.ev === 'session_leave') {
    const leftAt = sqlTime(r.ts);
    const duration = num(r.duration);
    const exists = db.prepare('SELECT 1 FROM game_sessions WHERE session_key = ?').get(key);
    if (!exists) {
      // Bağlanma satırı kayıp (dosya silinmiş ya da gün dönümü): ayrılmadan geriye hesaplanır
      const joined = leftAt ? new Date(Date.parse(leftAt.replace(' ', 'T') + 'Z') - duration * 1000).toISOString() : '';
      db.prepare(
        `INSERT INTO game_sessions (session_key, player_name, account_id, level_start, joined_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(key, name, accountId(db, name), num(r.level_start, 1), sqlTime(joined) ?? '');
    }
    db.prepare(
      'UPDATE game_sessions SET left_at = ?, duration_s = ?, level_end = ?, matches = ? WHERE session_key = ?',
    ).run(leftAt, duration, num(r.level, 1), num(r.matches), key);
    return 1;
  }
  return 0;
}

function importMatch(db: DB, rows: Row[], closed: boolean) {
  const start = rows.find((r) => r.ev === 'match_start') ?? rows[0];
  const key = str(start.match);
  if (!key) throw new Error('maç kimliği yok');
  const end = rows.find((r) => r.ev === 'match_end');
  const abort = rows.find((r) => r.ev === 'match_abort');
  const close = rows.find((r) => r.ev === 'match_close');
  const last = rows[rows.length - 1];
  const status = end ? 'finished' : closed ? 'aborted' : 'crashed';
  const winner = end ? str(end.winner) || null : null;
  const players = summaryPlayers(rows, (end ?? abort)?.players);

  const teamOf = new Map(players.map((p) => [p.name, p.team]));
  const kills = { light: 0, dark: 0 };
  for (const r of rows) {
    if (r.ev !== 'kill' || !r.killer) continue;
    const team = teamOf.get(str(r.killer));
    if (team === 'light' || team === 'dark') kills[team]++;
  }

  db.prepare('DELETE FROM matches WHERE match_key = ?').run(key);
  const startedAt = sqlTime(start.ts) ?? '';
  const duration = num((end ?? abort)?.duration, num(last.t));
  const matchId = Number(
    db
      .prepare(
        `INSERT INTO matches (match_key, started_at, ended_at, duration_s, status, winner, game_version, protocol,
           player_count, light_kills, dark_kills, titles)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(key, startedAt, sqlTime(close?.ts) ?? addSeconds(startedAt, duration), duration, status, winner,
        str(start.version), num(start.protocol, -1), players.length, kills.light, kills.dark,
        JSON.stringify(end?.titles ?? {}))
      .lastInsertRowid,
  );

  const insPlayer = db.prepare(
    `INSERT INTO match_players (match_id, player_name, account_id, team, class, spec, level_start, level_end, kills,
       deaths, assists, xp, yang, dmg_hero, dmg_mob, dmg_structure, rewards, won)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const p of players) {
    insPlayer.run(matchId, p.name, accountId(db, p.name), p.team, str(p.row.class), str(p.row.spec),
      num(p.row.level_start, 1), num(p.row.level, 1), num(p.row.kills), num(p.row.deaths), num(p.row.assists),
      num(p.row.xp), num(p.row.yang), num(p.row.dmg_hero), num(p.row.dmg_mob), num(p.row.dmg_structure),
      JSON.stringify(p.row.by_kind ?? {}), winner ? (p.team === winner ? 1 : 0) : null);
  }

  const insSnap = db.prepare(
    `INSERT OR REPLACE INTO match_snapshots (match_id, t, player_name, team, level, xp, yang, kills, deaths, assists,
       dmg_hero, dmg_mob, dmg_structure)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insEvent = db.prepare('INSERT INTO match_events (match_id, t, ev, data) VALUES (?, ?, ?, ?)');
  for (const r of rows) {
    if (r.ev === 'snapshot') {
      for (const s of Array.isArray(r.players) ? (r.players as Row[]) : []) {
        insSnap.run(matchId, num(r.t), str(s.name), str(s.team), num(s.level, 1), num(s.xp), num(s.yang),
          num(s.kills), num(s.deaths), num(s.assists), num(s.dmg_hero), num(s.dmg_mob), num(s.dmg_structure));
      }
    } else if (['join', 'leave', 'level', 'kill', 'structure_down'].includes(str(r.ev))) {
      const { t, ev, match: _m, ...data } = r;
      insEvent.run(matchId, num(t), str(ev), JSON.stringify(data));
    }
  }
}

/** Oyuncu özetleri: maç sonu satırı varsa o, yoksa (çökme) katılmalar + son anlık durum */
function summaryPlayers(rows: Row[], fromEnd: unknown): Array<{ name: string; team: string; row: Row }> {
  if (Array.isArray(fromEnd) && fromEnd.length) {
    return (fromEnd as Row[]).filter((p) => str(p.name)).map((p) => ({ name: str(p.name), team: str(p.team), row: p }));
  }
  const byName = new Map<string, Row>();
  for (const r of rows) {
    if (r.ev === 'join' && str(r.name)) {
      const prev = byName.get(str(r.name));
      byName.set(str(r.name), { ...r, ...(prev ?? {}), team: r.team, level_start: prev?.level_start ?? r.level });
    } else if (r.ev === 'snapshot' && Array.isArray(r.players)) {
      for (const s of r.players as Row[]) {
        const prev = byName.get(str(s.name)) ?? {};
        byName.set(str(s.name), { ...prev, ...s });
      }
    }
  }
  return [...byName.entries()].map(([name, row]) => ({ name, team: str(row.team), row }));
}

function addSeconds(sqlStart: string, secs: number): string | null {
  const t = Date.parse(sqlStart.replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? sqlTime(new Date(t + secs * 1000).toISOString()) : null;
}
