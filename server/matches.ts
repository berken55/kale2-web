import type { DB } from './db.ts';
import type { LeaderboardEntry } from '../shared/types.ts';

export interface MatchFilterOptions {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface SessionFilterOptions {
  search?: string;
  class?: string;
  page?: number;
  pageSize?: number;
}

const safeJsonParse = (str: unknown, fallback: any = {}) => {
  if (typeof str !== 'string' || !str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

export function listMatches(db: DB, opts: MatchFilterOptions = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.status && ['finished', 'aborted', 'crashed'].includes(opts.status)) {
    conditions.push('m.status = ?');
    params.push(opts.status);
  }

  if (opts.search && opts.search.trim()) {
    const s = `%${opts.search.trim()}%`;
    conditions.push(
      '(m.match_key LIKE ? OR m.id IN (SELECT match_id FROM match_players WHERE player_name LIKE ?))',
    );
    params.push(s, s);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM matches m ${whereClause}`)
    .get(...params) as { count: number };

  const total = countRow?.count ?? 0;

  const rows = db
    .prepare(
      `SELECT 
        m.id,
        m.match_key as matchKey,
        m.started_at as startedAt,
        m.ended_at as endedAt,
        m.duration_s as durationSeconds,
        m.status,
        m.winner,
        m.game_version as gameVersion,
        m.protocol,
        m.player_count as playerCount,
        m.light_kills as lightKills,
        m.dark_kills as darkKills,
        m.titles
      FROM matches m
      ${whereClause}
      ORDER BY m.started_at DESC, m.id DESC
      LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset) as Array<Record<string, unknown>>;

  const matches = rows.map((r) => ({
    ...r,
    titles: safeJsonParse(r.titles, {}),
  }));

  return {
    matches,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

export function getMatchDetail(db: DB, id: number) {
  const match = db
    .prepare(
      `SELECT 
        id,
        match_key as matchKey,
        started_at as startedAt,
        ended_at as endedAt,
        duration_s as durationSeconds,
        status,
        winner,
        game_version as gameVersion,
        protocol,
        player_count as playerCount,
        light_kills as lightKills,
        dark_kills as darkKills,
        titles
      FROM matches
      WHERE id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!match) return null;

  const playerRows = db
    .prepare(
      `SELECT 
        mp.match_id as matchId,
        mp.player_name as playerName,
        mp.account_id as accountId,
        mp.team,
        mp.class,
        mp.spec,
        mp.level_start as levelStart,
        mp.level_end as levelEnd,
        mp.kills,
        mp.deaths,
        mp.assists,
        mp.xp,
        mp.yang,
        mp.dmg_hero as dmgHero,
        mp.dmg_mob as dmgMob,
        mp.dmg_structure as dmgStructure,
        mp.rewards,
        mp.won,
        a.email as accountEmail
      FROM match_players mp
      LEFT JOIN accounts a ON mp.account_id = a.id
      WHERE mp.match_id = ?
      ORDER BY 
        CASE WHEN mp.team = 'light' THEN 1 ELSE 2 END,
        mp.kills DESC,
        mp.dmg_hero DESC`,
    )
    .all(id) as Array<Record<string, unknown>>;

  const players = playerRows.map((p) => ({
    ...p,
    won: p.won === 1 ? true : p.won === 0 ? false : null,
    rewards: safeJsonParse(p.rewards, {}),
  }));

  const eventRows = db
    .prepare(
      `SELECT id, match_id as matchId, t, ev, data
      FROM match_events
      WHERE match_id = ?
      ORDER BY t ASC, id ASC`,
    )
    .all(id) as Array<Record<string, unknown>>;

  const events = eventRows.map((e) => ({
    ...e,
    data: safeJsonParse(e.data, {}),
  }));

  const snapshots = db
    .prepare(
      `SELECT 
        match_id as matchId,
        t,
        player_name as playerName,
        team,
        level,
        xp,
        yang,
        kills,
        deaths,
        assists,
        dmg_hero as dmgHero,
        dmg_mob as dmgMob,
        dmg_structure as dmgStructure
      FROM match_snapshots
      WHERE match_id = ?
      ORDER BY t ASC, player_name ASC`,
    )
    .all(id);

  return {
    ...match,
    titles: safeJsonParse(match.titles, {}),
    players,
    events,
    snapshots,
  };
}

export function listSessions(db: DB, opts: SessionFilterOptions = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 25));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.search && opts.search.trim()) {
    const s = `%${opts.search.trim()}%`;
    conditions.push('(gs.player_name LIKE ? OR gs.session_key LIKE ?)');
    params.push(s, s);
  }

  if (opts.class && opts.class.trim()) {
    conditions.push('gs.class = ?');
    params.push(opts.class.trim());
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM game_sessions gs ${whereClause}`)
    .get(...params) as { count: number };

  const total = countRow?.count ?? 0;

  const rows = db
    .prepare(
      `SELECT 
        gs.id,
        gs.session_key as sessionKey,
        gs.player_name as playerName,
        gs.account_id as accountId,
        gs.class,
        gs.spec,
        gs.level_start as levelStart,
        gs.level_end as levelEnd,
        gs.matches,
        gs.game_version as gameVersion,
        gs.protocol,
        gs.joined_at as joinedAt,
        gs.left_at as leftAt,
        gs.duration_s as durationSeconds,
        a.email as accountEmail
      FROM game_sessions gs
      LEFT JOIN accounts a ON gs.account_id = a.id
      ${whereClause}
      ORDER BY gs.joined_at DESC, gs.id DESC
      LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset) as Array<Record<string, unknown>>;

  return {
    sessions: rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

export function getMatchStats(db: DB) {
  const matchStats = db
    .prepare(
      `SELECT
        COUNT(*) as totalMatches,
        SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as finishedMatches,
        SUM(CASE WHEN status = 'aborted' THEN 1 ELSE 0 END) as abortedMatches,
        SUM(CASE WHEN status = 'crashed' THEN 1 ELSE 0 END) as crashedMatches,
        ROUND(AVG(CASE WHEN status = 'finished' AND duration_s > 0 THEN duration_s ELSE NULL END), 1) as avgDurationSeconds,
        SUM(CASE WHEN winner = 'light' THEN 1 ELSE 0 END) as lightWins,
        SUM(CASE WHEN winner = 'dark' THEN 1 ELSE 0 END) as darkWins
      FROM matches`,
    )
    .get() as Record<string, unknown>;

  const sessionStats = db
    .prepare(
      `SELECT
        COUNT(*) as totalSessions,
        COUNT(DISTINCT player_name) as uniquePlayers,
        SUM(CASE WHEN left_at IS NULL THEN 1 ELSE 0 END) as activeSessions
      FROM game_sessions`,
    )
    .get() as Record<string, unknown>;

  return {
    totalMatches: Number(matchStats?.totalMatches ?? 0),
    finishedMatches: Number(matchStats?.finishedMatches ?? 0),
    abortedMatches: Number(matchStats?.abortedMatches ?? 0),
    crashedMatches: Number(matchStats?.crashedMatches ?? 0),
    avgDurationSeconds: Number(matchStats?.avgDurationSeconds ?? 0),
    lightWins: Number(matchStats?.lightWins ?? 0),
    darkWins: Number(matchStats?.darkWins ?? 0),
    totalSessions: Number(sessionStats?.totalSessions ?? 0),
    uniquePlayers: Number(sessionStats?.uniquePlayers ?? 0),
    activeSessions: Number(sessionStats?.activeSessions ?? 0),
  };
}

const DEMO_LEADERBOARD = [
  { playerName: 'AlpArslan', class: 'warrior', spec: 'warrior_body', matchesPlayed: 32, wins: 26, kills: 164, deaths: 31, assists: 98, totalHeroDamage: 96400, maxLevel: 15 },
  { playerName: 'GeceAvcisi', class: 'ninja', spec: 'ninja_dagger', matchesPlayed: 29, wins: 22, kills: 182, deaths: 39, assists: 52, totalHeroDamage: 104200, maxLevel: 15 },
  { playerName: 'GokBoru', class: 'warrior', spec: 'warrior_mental', matchesPlayed: 26, wins: 20, kills: 112, deaths: 21, assists: 134, totalHeroDamage: 88100, maxLevel: 14 },
  { playerName: 'AyKiz', class: 'ninja', spec: 'ninja_bow', matchesPlayed: 24, wins: 18, kills: 145, deaths: 26, assists: 76, totalHeroDamage: 92300, maxLevel: 14 },
  { playerName: 'KaraSancak', class: 'warrior', spec: 'warrior_body', matchesPlayed: 21, wins: 15, kills: 104, deaths: 28, assists: 83, totalHeroDamage: 77500, maxLevel: 13 },
  { playerName: 'SonSamuray', class: 'ninja', spec: 'ninja_dagger', matchesPlayed: 19, wins: 13, kills: 98, deaths: 33, assists: 56, totalHeroDamage: 74200, maxLevel: 13 },
  { playerName: 'DemirYurek', class: 'warrior', spec: 'warrior_mental', matchesPlayed: 17, wins: 12, kills: 73, deaths: 22, assists: 95, totalHeroDamage: 64800, maxLevel: 12 },
  { playerName: 'Pusat', class: 'warrior', spec: 'warrior_body', matchesPlayed: 15, wins: 10, kills: 78, deaths: 29, assists: 58, totalHeroDamage: 66100, maxLevel: 11 },
  { playerName: 'RuzgarBicagi', class: 'ninja', spec: 'ninja_bow', matchesPlayed: 14, wins: 9, kills: 69, deaths: 28, assists: 44, totalHeroDamage: 59300, maxLevel: 11 },
  { playerName: 'GolgeHukumdar', class: 'warrior', spec: 'warrior_mental', matchesPlayed: 12, wins: 8, kills: 56, deaths: 21, assists: 71, totalHeroDamage: 53200, maxLevel: 10 },
];

export function getLeaderboard(db: DB, limit: number = 10): LeaderboardEntry[] {
  const rows = db
    .prepare(
      `SELECT 
        mp.player_name as playerName,
        MAX(mp.class) as class,
        MAX(mp.spec) as spec,
        COUNT(DISTINCT mp.match_id) as matchesPlayed,
        SUM(COALESCE(mp.kills, 0)) as kills,
        SUM(COALESCE(mp.deaths, 0)) as deaths,
        SUM(COALESCE(mp.assists, 0)) as assists,
        SUM(CASE WHEN mp.won = 1 THEN 1 ELSE 0 END) as wins,
        ROUND(SUM(COALESCE(mp.dmg_hero, 0)), 0) as totalHeroDamage,
        MAX(COALESCE(mp.level_end, 1)) as maxLevel
      FROM match_players mp
      GROUP BY mp.player_name
      ORDER BY wins DESC, kills DESC, totalHeroDamage DESC
      LIMIT ?`,
    )
    .all(limit) as Array<Record<string, unknown>>;

  const combinedMap = new Map<string, any>();

  for (const r of rows) {
    const pName = String(r.playerName);
    combinedMap.set(pName.toLowerCase(), {
      playerName: pName,
      class: String(r.class || 'warrior'),
      spec: String(r.spec || 'warrior_body'),
      matchesPlayed: Number(r.matchesPlayed || 0),
      wins: Number(r.wins || 0),
      kills: Number(r.kills || 0),
      deaths: Number(r.deaths || 0),
      assists: Number(r.assists || 0),
      totalHeroDamage: Number(r.totalHeroDamage || 0),
      maxLevel: Number(r.maxLevel || 1),
    });
  }

  // Eğer veritabanında henüz az oyuncu varsa listeyi demo liderlerle tamamla
  if (combinedMap.size < limit) {
    for (const demo of DEMO_LEADERBOARD) {
      if (!combinedMap.has(demo.playerName.toLowerCase())) {
        combinedMap.set(demo.playerName.toLowerCase(), { ...demo });
        if (combinedMap.size >= limit) break;
      }
    }
  }

  const sorted = Array.from(combinedMap.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.kills !== a.kills) return b.kills - a.kills;
    return b.totalHeroDamage - a.totalHeroDamage;
  });

  return sorted.slice(0, limit).map((p, idx) => {
    const rank = idx + 1;
    const matches = Math.max(1, p.matchesPlayed);
    const winRate = Math.round((p.wins / matches) * 100);
    const deaths = p.deaths || 0;
    const kda =
      deaths > 0
        ? ((p.kills + p.assists) / deaths).toFixed(2)
        : String((p.kills + p.assists) || 0);

    let tier: LeaderboardEntry['tier'] = 'silver';
    if (rank <= 3) tier = 'champion';
    else if (rank <= 6) tier = 'master';
    else if (rank <= 8) tier = 'diamond';
    else if (rank <= 10) tier = 'gold';

    return {
      rank,
      playerName: p.playerName,
      class: p.class,
      spec: p.spec,
      matchesPlayed: p.matchesPlayed,
      wins: p.wins,
      winRate,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      kda,
      totalHeroDamage: p.totalHeroDamage,
      maxLevel: p.maxLevel,
      tier,
    };
  });
}
