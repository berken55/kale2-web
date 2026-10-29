import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerAccount } from '../server/accounts.ts';
import { openDatabase } from '../server/db.ts';
import { importMatchLogs } from '../server/match-logs.ts';

// Gerçek sunucu çıktısı: 2 oyuncu bağlandı, maç başladı, ikisi de çıktı (yarıda kalan maç)
const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixtures/match-logs');

const line = (o: object) => JSON.stringify(o) + '\n';

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kale2-matchlog-'));
  for (const f of fs.readdirSync(FIXTURES)) fs.copyFileSync(path.join(FIXTURES, f), path.join(dir, f));
  return dir;
}

/** Biten bir maç: Mavi kazanır, bir öldürme, bir asist, bir yapı */
function finishedMatch(dir: string, key = '20261029-090000-0001', close = true) {
  const m = { match: key };
  const rows = [
    { ...m, t: 0, ev: 'match_start', version: '0.9.0-beta', protocol: 10, ts: '2026-10-29T09:00:00' },
    { ...m, t: 0, ev: 'join', name: 'Ayse', peer: 1, team: 'light', class: 'warrior', spec: 'warrior_body', level: 1 },
    { ...m, t: 0, ev: 'join', name: 'Burak', peer: 2, team: 'dark', class: 'ninja', spec: 'ninja_dagger', level: 1 },
    { ...m, t: 60, ev: 'snapshot', players: [
      { name: 'Ayse', team: 'light', level: 3, xp: 400, yang: 900, kills: 0, deaths: 0, assists: 0, dmg_hero: 0, dmg_mob: 3000, dmg_structure: 0 },
      { name: 'Burak', team: 'dark', level: 2, xp: 200, yang: 500, kills: 0, deaths: 0, assists: 0, dmg_hero: 0, dmg_mob: 1500, dmg_structure: 0 },
    ] },
    { ...m, t: 75.5, ev: 'kill', victim: 'Burak', victim_level: 2, killer: 'Ayse', killer_level: 3, assists: [], gains: { Ayse: [90, 300] }, pos: [10, 20] },
    { ...m, t: 80, ev: 'level', name: 'Ayse', level: 4 },
    { ...m, t: 300, ev: 'structure_down', kind: 'tower', team: 'dark', structure: 'Kızıl Orta Kule 1', by: 'Ayse' },
    { ...m, t: 900, ev: 'snapshot', players: [] },
    ...(close
      ? [
          { ...m, t: 900, ev: 'match_end', winner: 'light', duration: 900, titles: { mvp: 'Ayse' }, players: [
            { name: 'Ayse', team: 'light', class: 'warrior', spec: 'warrior_body', level_start: 1, level: 9, kills: 1, deaths: 0, assists: 0, xp: 5000, yang: 9000, dmg_hero: 800, dmg_mob: 20000, dmg_structure: 4000, by_kind: { mob: [4000, 6000] }, won: true },
            { name: 'Burak', team: 'dark', class: 'ninja', spec: 'ninja_dagger', level_start: 1, level: 7, kills: 0, deaths: 1, assists: 0, xp: 3000, yang: 6000, dmg_hero: 300, dmg_mob: 15000, dmg_structure: 0, won: false },
          ] },
          { ...m, t: 900.2, ev: 'match_close', ts: '2026-10-29T09:15:00' },
        ]
      : []),
  ];
  fs.writeFileSync(path.join(dir, `match-${key}.jsonl`), rows.map(line).join(''));
}

describe('maç günlüğü aktarımı', () => {
  it('gerçek sunucu çıktısını aktarır: oturumlar ve yarıda kalan maç', () => {
    const db = openDatabase(':memory:');
    const r = importMatchLogs(db, tempDir());
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ matches: 1, sessions: 4 });
    const sessions = db.prepare('SELECT * FROM game_sessions ORDER BY player_name').all() as Array<Record<string, unknown>>;
    expect(sessions.map((s) => s.player_name)).toEqual(['Ayse', 'Burak']);
    expect(sessions[0]).toMatchObject({ class: 'warrior', level_start: 1, level_end: 1, matches: 1, game_version: '0.9.0-beta', protocol: 10, joined_at: '2026-10-29 07:56:40', left_at: '2026-10-29 07:58:10' });
    const match = db.prepare('SELECT * FROM matches').get() as Record<string, unknown>;
    expect(match).toMatchObject({ status: 'aborted', winner: null, player_count: 2, started_at: '2026-10-29 07:56:45', ended_at: '2026-10-29 07:58:10' });
    const players = db.prepare('SELECT player_name, team, won FROM match_players ORDER BY player_name').all();
    expect(players).toEqual([{ player_name: 'Ayse', team: 'light', won: null }, { player_name: 'Burak', team: 'dark', won: null }]);
  });

  it('biten maç: oyuncu satırları, anlık durumlar, olaylar, hesap eşleşmesi', () => {
    const db = openDatabase(':memory:');
    const account = registerAccount(db, { username: 'ayse', email: 'ayse@example.com', password: 'gizli123' });
    const dir = tempDir();
    finishedMatch(dir);
    expect(importMatchLogs(db, dir).matches).toBe(2);
    const m = db.prepare("SELECT * FROM matches WHERE status = 'finished'").get() as Record<string, unknown>;
    expect(m).toMatchObject({ winner: 'light', duration_s: 900, light_kills: 1, dark_kills: 0, ended_at: '2026-10-29 09:15:00' });
    expect(JSON.parse(m.titles as string)).toEqual({ mvp: 'Ayse' });
    const ayse = db.prepare('SELECT * FROM match_players WHERE match_id = ? AND player_name = ?').get(m.id, 'Ayse') as Record<string, unknown>;
    expect(ayse).toMatchObject({ account_id: account.id, won: 1, level_start: 1, level_end: 9, kills: 1, xp: 5000, dmg_structure: 4000 });
    expect(JSON.parse(ayse.rewards as string)).toEqual({ mob: [4000, 6000] });
    const burak = db.prepare('SELECT won, account_id FROM match_players WHERE match_id = ? AND player_name = ?').get(m.id, 'Burak');
    expect(burak).toEqual({ won: 0, account_id: null });
    expect(db.prepare('SELECT COUNT(*) AS n FROM match_snapshots WHERE match_id = ?').get(m.id)).toEqual({ n: 2 });
    const events = db.prepare('SELECT ev, data FROM match_events WHERE match_id = ? ORDER BY id').all(m.id) as Array<{ ev: string; data: string }>;
    expect(events.map((e) => e.ev)).toEqual(['join', 'join', 'kill', 'level', 'structure_down']);
    expect(JSON.parse(events[2].data)).toMatchObject({ killer: 'Ayse', victim: 'Burak', gains: { Ayse: [90, 300] } });
  });

  it('yeniden çalıştırmak çift kayıt yapmaz; yeni oturum satırları kaldığı yerden okunur', () => {
    const db = openDatabase(':memory:');
    const dir = tempDir();
    finishedMatch(dir);
    importMatchLogs(db, dir);
    expect(importMatchLogs(db, dir)).toMatchObject({ matches: 0, sessions: 0 });
    const sessionFile = path.join(dir, 'sessions-2026-10-29.jsonl');
    fs.appendFileSync(sessionFile, line({ ev: 'session_join', session: 'x-9', peer: 9, name: 'Cem', class: 'ninja', spec: '', level: 5, protocol: 10, version: '0.9.0-beta', ts: '2026-10-29T10:00:00' }));
    // Yarım satır (sunucu hâlâ yazıyor): okunmaz
    fs.appendFileSync(sessionFile, '{"ev":"session_leave","session":"x-9"');
    expect(importMatchLogs(db, dir).sessions).toBe(1);
    fs.appendFileSync(sessionFile, ',"name":"Cem","duration":30,"level":6,"level_start":5,"matches":0,"ts":"2026-10-29T10:00:30"}\n');
    expect(importMatchLogs(db, dir).sessions).toBe(1);
    expect(db.prepare("SELECT left_at, level_end, duration_s FROM game_sessions WHERE session_key = 'x-9'").get())
      .toEqual({ left_at: '2026-10-29 10:00:30', level_end: 6, duration_s: 30 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM matches').get()).toEqual({ n: 2 });
  });

  it('süren maç beklenir; uzun süre kapanmayan maç çökmüş sayılır', () => {
    const db = openDatabase(':memory:');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kale2-matchlog-'));
    finishedMatch(dir, '20261029-110000-0002', false);
    expect(importMatchLogs(db, dir)).toMatchObject({ matches: 0, pending: 1 });
    const r = importMatchLogs(db, dir, { now: Date.now() + 7 * 60 * 60 * 1000 });
    expect(r.matches).toBe(1);
    const m = db.prepare('SELECT id, status, winner, duration_s FROM matches').get() as Record<string, unknown>;
    expect(m).toMatchObject({ status: 'crashed', winner: null, duration_s: 900 });
    // Özet son anlık durumdan: Ayse Sv3, 400 EXP
    expect(db.prepare("SELECT level_end, xp, team, class FROM match_players WHERE player_name = 'Ayse'").get())
      .toEqual({ level_end: 3, xp: 400, team: 'light', class: 'warrior' });
  });

  it('klasör yoksa hata döner', () => {
    const r = importMatchLogs(openDatabase(':memory:'), path.join(os.tmpdir(), 'yok-boyle-klasor-xyz'));
    expect(r.errors[0]).toContain('yok');
  });
});
