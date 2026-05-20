// The sanctioned data path. All dashboard and API queries go through here.
//
// Backed by a local SQLite file (`data.db` at the project root). The seed
// script creates it; `pnpm dev` reads it. Both use the same `getDb()` handle
// below.
//
// Uses Node's built-in `node:sqlite` (stable in Node 22.5+) so there is no
// native compile step on `pnpm install`. Schema is documented in /schema.sql.
//
// Design note: the README asks for one data module and thin routes, so every
// number the dashboard or the API shows is computed by a function in THIS file.
// Routes just call one of these and serialize the result.

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { buildMeta, connectRate, csvField, dayKeys, isoDate, windowStartIso } from "./metrics";

// Re-export the pure helpers so existing import sites (and tests) can reach
// them through either module.
export { buildMeta, connectRate, csvField, dayKeys, isoDate, windowStartIso };

const DB_PATH = path.join(process.cwd(), "data.db");

let _db: DatabaseSync | null = null;

/**
 * Returns a singleton SQLite handle. Lazy so that `import`-time side effects
 * don't open a file before the seed has had a chance to create it.
 *
 * Configured with WAL journaling and foreign-key enforcement, both of which
 * are off by default in SQLite and surprise people.
 */
export function getDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA foreign_keys = ON");
  }
  return _db;
}

// ----- Row types -------------------------------------------------------------

export type AgentRow = {
  id: string;
  name: string;
  team: string;
  hire_date: string;
  created_at: string;
};

export type CallOutcome = "connected" | "voicemail" | "no_answer" | "busy" | "failed";

export type CallRow = {
  id: string;
  agent_id: string;
  customer_phone: string;
  started_at: string; // ISO 8601
  ended_at: string | null; // ISO 8601, null only for failed
  duration_seconds: number;
  outcome: CallOutcome;
  created_at: string;
};

// ----- Internal queries ------------------------------------------------------
//
// Windows are half-open [since, until): `until` is exclusive so adjacent
// windows (last-7 vs prior-7) never double-count a boundary call. The "now"
// upper bound means future-dated rows are never counted — a call can't have
// happened "in the last 7 days" if it hasn't happened yet.

type WindowCount = { connected: number; total: number };

/** Connected + total calls for one agent within [since, until). */
function agentWindowCount(agentId: string, since: string, until: string): WindowCount {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE outcome = 'connected') AS connected
         FROM calls
        WHERE agent_id = ? AND started_at >= ? AND started_at < ?`,
    )
    .get(agentId, since, until) as { total: number; connected: number };
  return { connected: row.connected, total: row.total };
}

/** Per-day connected/total totals across everyone, keyed by YYYY-MM-DD. */
function dailyTotals(firstDay: string, lastDay: string): Map<string, WindowCount> {
  const rows = getDb()
    .prepare(
      `SELECT substr(started_at, 1, 10) AS day,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE outcome = 'connected') AS connected
         FROM calls
        WHERE substr(started_at, 1, 10) >= ? AND substr(started_at, 1, 10) <= ?
        GROUP BY day`,
    )
    .all(firstDay, lastDay) as { day: string; total: number; connected: number }[];
  return new Map(rows.map((r) => [r.day, { connected: r.connected, total: r.total }]));
}

/** Per-day, per-team connected counts: Map<day, Map<team, connectedCount>>. */
function dailyConnectedByTeam(firstDay: string, lastDay: string): Map<string, Record<string, number>> {
  const rows = getDb()
    .prepare(
      `SELECT substr(c.started_at, 1, 10) AS day, a.team AS team, COUNT(*) AS connected
         FROM calls c
         JOIN agents a ON a.id = c.agent_id
        WHERE c.outcome = 'connected'
          AND substr(c.started_at, 1, 10) >= ? AND substr(c.started_at, 1, 10) <= ?
        GROUP BY day, team`,
    )
    .all(firstDay, lastDay) as { day: string; team: string; connected: number }[];

  const byDay = new Map<string, Record<string, number>>();
  for (const { day, team, connected } of rows) {
    const teams = byDay.get(day) ?? {};
    teams[team] = connected;
    byDay.set(day, teams);
  }
  return byDay;
}

// ----- Dashboard ------------------------------------------------------------

export type AgentTrend = {
  id: string;
  name: string;
  team: string;
  connectedLast7: number;
  totalLast7: number;
  connectRateLast7: number;
  connectRatePrior7: number;
  /** Change in connect rate vs the prior week. Negative = getting worse. */
  rateDelta: number;
};

export type DashboardData = {
  /** THE Monday number: connected calls in the rolling last 7 days. */
  connectedLast7: number;
  totalLast7: number;
  connectRateLast7: number;
  windowStart: string;
  windowEnd: string;
  /** One row per agent, week-over-week, worst trend first ("talk to Monday"). */
  agents: AgentTrend[];
};

/** Everything the `/` dashboard renders, from a single live read. */
export function getDashboardData(now: Date = new Date()): DashboardData {
  const nowIso = now.toISOString();
  const start7 = windowStartIso(now, 7);
  const start14 = windowStartIso(now, 14);

  const agents = getDb()
    .prepare(`SELECT id, name, team FROM agents`)
    .all() as Pick<AgentRow, "id" | "name" | "team">[];

  const trends: AgentTrend[] = agents.map((agent) => {
    const last7 = agentWindowCount(agent.id, start7, nowIso);
    const prior7 = agentWindowCount(agent.id, start14, start7);
    const connectRateLast7 = connectRate(last7.connected, last7.total);
    const connectRatePrior7 = connectRate(prior7.connected, prior7.total);
    return {
      id: agent.id,
      name: agent.name,
      team: agent.team,
      connectedLast7: last7.connected,
      totalLast7: last7.total,
      connectRateLast7,
      connectRatePrior7,
      rateDelta: connectRateLast7 - connectRatePrior7,
    };
  });

  // Worst week-over-week movement first — that's who Dana calls on Monday.
  trends.sort((a, b) => a.rateDelta - b.rateDelta);

  const connectedLast7 = trends.reduce((sum, t) => sum + t.connectedLast7, 0);
  const totalLast7 = trends.reduce((sum, t) => sum + t.totalLast7, 0);

  return {
    connectedLast7,
    totalLast7,
    connectRateLast7: connectRate(connectedLast7, totalLast7),
    windowStart: start7.slice(0, 10),
    windowEnd: isoDate(now),
    agents: trends,
  };
}

// ----- API: /api/weekly-digest (+ .csv) -------------------------------------

export type DigestDay = {
  date: string;
  connected_count: number;
  total_count: number;
  by_team: Record<string, number>;
};

export type TopAgent = { name: string; team: string; connected_count: number };

export type WeeklyDigest = {
  data: DigestDay[];
  top_agents: TopAgent[];
  meta: ReturnType<typeof buildMeta>;
};

const DIGEST_DAYS = 28;
const TOP_AGENT_COUNT = 3;

export function getWeeklyDigest(now: Date = new Date()): WeeklyDigest {
  const keys = dayKeys(now, DIGEST_DAYS);
  const totals = dailyTotals(keys[0], keys[keys.length - 1]);
  const byTeam = dailyConnectedByTeam(keys[0], keys[keys.length - 1]);

  const data: DigestDay[] = keys.map((date) => ({
    date,
    connected_count: totals.get(date)?.connected ?? 0,
    total_count: totals.get(date)?.total ?? 0,
    by_team: byTeam.get(date) ?? {},
  }));

  const start7 = windowStartIso(now, 7);
  const topRows = getDb()
    .prepare(
      `SELECT a.name AS name, a.team AS team,
              COUNT(*) FILTER (WHERE c.outcome = 'connected') AS connected_count
         FROM agents a
         JOIN calls c ON c.agent_id = a.id
        WHERE c.started_at >= ? AND c.started_at < ?
        GROUP BY a.id
        ORDER BY connected_count DESC, a.name ASC
        LIMIT ?`,
    )
    .all(start7, now.toISOString(), TOP_AGENT_COUNT) as TopAgent[];

  return { data, top_agents: topRows, meta: buildMeta(now, DIGEST_DAYS) };
}

/** The team with the most connects on a given day (blank if no connects). */
function topTeamForDay(byTeam: Record<string, number>): { team: string; connects: number } {
  let best = { team: "", connects: 0 };
  for (const [team, connects] of Object.entries(byTeam)) {
    if (connects > best.connects) best = { team, connects };
  }
  return best;
}

/** Same daily data as the digest, rendered as CSV for Google Sheets. */
export function getWeeklyDigestCsv(now: Date = new Date()): string {
  const { data } = getWeeklyDigest(now);
  const header = ["date", "connected_count", "total_count", "top_team", "top_team_connects"];
  const rows = data.map((day) => {
    const top = topTeamForDay(day.by_team);
    return [day.date, day.connected_count, day.total_count, top.team, top.connects]
      .map(csvField)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n") + "\n";
}

// ----- API: /api/agents/[id]/scorecard --------------------------------------

export type Scorecard = {
  agent: Pick<AgentRow, "id" | "name" | "team" | "hire_date">;
  last_14_days: { date: string; connected_count: number; total_count: number }[];
  totals: {
    connected_last_7: number;
    connected_prior_7: number;
    connect_rate_last_7: number;
  };
  meta: ReturnType<typeof buildMeta>;
};

const SCORECARD_DAYS = 14;

function getAgent(id: string): AgentRow | undefined {
  return getDb().prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as AgentRow | undefined;
}

/** One agent's last 14 days, or null if the id is unknown (route → 404). */
export function getAgentScorecard(id: string, now: Date = new Date()): Scorecard | null {
  const agent = getAgent(id);
  if (!agent) return null;

  const keys = dayKeys(now, SCORECARD_DAYS);
  const rows = getDb()
    .prepare(
      `SELECT substr(started_at, 1, 10) AS day,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE outcome = 'connected') AS connected
         FROM calls
        WHERE agent_id = ?
          AND substr(started_at, 1, 10) >= ? AND substr(started_at, 1, 10) <= ?
        GROUP BY day`,
    )
    .all(agent.id, keys[0], keys[keys.length - 1]) as {
    day: string;
    total: number;
    connected: number;
  }[];
  const byDay = new Map(rows.map((r) => [r.day, r]));

  const last_14_days = keys.map((date) => ({
    date,
    connected_count: byDay.get(date)?.connected ?? 0,
    total_count: byDay.get(date)?.total ?? 0,
  }));

  const nowIso = now.toISOString();
  const last7 = agentWindowCount(agent.id, windowStartIso(now, 7), nowIso);
  const prior7 = agentWindowCount(agent.id, windowStartIso(now, 14), windowStartIso(now, 7));

  return {
    agent: { id: agent.id, name: agent.name, team: agent.team, hire_date: agent.hire_date },
    last_14_days,
    totals: {
      connected_last_7: last7.connected,
      connected_prior_7: prior7.connected,
      connect_rate_last_7: connectRate(last7.connected, last7.total),
    },
    meta: buildMeta(now, SCORECARD_DAYS),
  };
}

// ----- API: /api/teams/[name]/summary ---------------------------------------

export type TeamSummary = {
  team: { name: string; agent_count: number };
  last_7_days: { connected_count: number; total_count: number; connect_rate: number };
  agents: { id: string; name: string; connected_count: number; total_count: number }[];
  meta: ReturnType<typeof buildMeta>;
};

const TEAM_SUMMARY_DAYS = 7;

/** One team's last-7-day roll-up, or null if the team has no agents (→ 404). */
export function getTeamSummary(name: string, now: Date = new Date()): TeamSummary | null {
  const start7 = windowStartIso(now, 7);
  const nowIso = now.toISOString();

  // LEFT JOIN so agents with zero calls in the window still appear (as zeros).
  const rows = getDb()
    .prepare(
      `SELECT a.id AS id, a.name AS name,
              COUNT(c.id) AS total_count,
              COALESCE(SUM(CASE WHEN c.outcome = 'connected' THEN 1 ELSE 0 END), 0) AS connected_count
         FROM agents a
         LEFT JOIN calls c
           ON c.agent_id = a.id AND c.started_at >= ? AND c.started_at < ?
        WHERE a.team = ?
        GROUP BY a.id
        ORDER BY connected_count DESC, a.name ASC`,
    )
    .all(start7, nowIso, name) as {
    id: string;
    name: string;
    total_count: number;
    connected_count: number;
  }[];

  if (rows.length === 0) return null; // unknown team → route returns 404

  const connected = rows.reduce((sum, r) => sum + r.connected_count, 0);
  const total = rows.reduce((sum, r) => sum + r.total_count, 0);

  return {
    team: { name, agent_count: rows.length },
    last_7_days: {
      connected_count: connected,
      total_count: total,
      connect_rate: connectRate(connected, total),
    },
    agents: rows,
    meta: buildMeta(now, TEAM_SUMMARY_DAYS),
  };
}
