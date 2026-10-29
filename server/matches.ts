import type { DB } from './db.ts';

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
