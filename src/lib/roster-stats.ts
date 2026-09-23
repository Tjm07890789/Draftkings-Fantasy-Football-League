import { neon } from "@neondatabase/serverless";
import { fetchAliasToNameMap, resolveOwnerName } from "./roster-crosswalk";

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  return neon(databaseUrl);
}

export type RosterTendencyRow = {
  ownerName: string;
  avgFieldOwnership: number | null;
  uniquePlayersUsed: number;
  mostUsedPlayer: { name: string; count: number } | null;
  bestWinningStreak: number;
  avgValueFound: number | null;
};

export type PlayerExposureRow = {
  playerName: string;
  appearances: number;
  avgPoints: number | null;
  bestWeek: number | null;
  avgFieldRostered: number | null;
  avgValue: number | null;
  bestValueWeek: number | null;
  usedBy: Array<{ ownerName: string; count: number }>;
};

function longestConsecutiveStreak(weeks: number[]): number {
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  let best = 0;
  let current = 0;
  let prev = -Infinity;
  for (const week of sorted) {
    current = week === prev + 1 ? current + 1 : 1;
    best = Math.max(best, current);
    prev = week;
  }
  return best;
}

/** Per-owner roster-construction tendencies for one season -- needs a real DK results CSV
 *  import (football_result_entry_players / football_result_player_field_stats), the
 *  Phase 2 piece of the 10 Sep 2026 Statistics-page plan. Owner names are resolved via the
 *  League Player Roster Sheet's DraftKings-Alias crosswalk so this reads real names, not
 *  raw DK usernames. Gracefully returns [] if no results have been imported yet. */
export async function fetchRosterTendencies(season: number): Promise<RosterTendencyRow[]> {
  const sql = getSql();
  try {
    const rosterRows = await sql`
      SELECT w.week, e.entry_name, ep.normalized_player_name, ep.player_name
      FROM football_result_weeks w
      JOIN football_result_entries e ON e.week_id = w.id
      JOIN football_result_entry_players ep ON ep.result_entry_id = e.id
      WHERE w.season = ${season}
    `;
    if (!(rosterRows as unknown[]).length) return [];

    const fieldRows = await sql`
      SELECT w.week, fs.normalized_player_name, fs.drafted_pct, fs.fantasy_points, pp.salary
      FROM football_result_weeks w
      JOIN football_result_player_field_stats fs ON fs.week_id = w.id
      LEFT JOIN football_player_pools pool ON pool.slate_key = w.slate_key
      LEFT JOIN football_player_pool_players pp ON pp.pool_id = pool.id AND pp.normalized_player_name = fs.normalized_player_name
      WHERE w.season = ${season}
    `;
    const winRows = await sql`SELECT winner_name, week FROM football_weekly_prizes WHERE season = ${season}`.catch(() => [] as unknown[]);

    const aliasMap = await fetchAliasToNameMap();

    const draftedByWeekPlayer = new Map<string, number>();
    const valueByWeekPlayer = new Map<string, number>();
    for (const row of fieldRows as Array<{ week: number; normalized_player_name: string; drafted_pct: string | number | null; fantasy_points: string | number | null; salary: number | null }>) {
      if (row.drafted_pct != null) draftedByWeekPlayer.set(`${row.week}|${row.normalized_player_name}`, Number(row.drafted_pct));
      if (row.fantasy_points != null && row.salary != null && row.salary > 0) {
        valueByWeekPlayer.set(`${row.week}|${row.normalized_player_name}`, (Number(row.fantasy_points) / row.salary) * 1000);
      }
    }

    const winWeeksByOwner = new Map<string, number[]>();
    for (const row of winRows as Array<{ winner_name: string; week: number | string }>) {
      const list = winWeeksByOwner.get(row.winner_name) ?? [];
      list.push(Number(row.week));
      winWeeksByOwner.set(row.winner_name, list);
    }

    type Acc = { ownershipPcts: number[]; values: number[]; players: Map<string, { name: string; count: number }> };
    const byOwner = new Map<string, Acc>();
    for (const row of rosterRows as Array<{ week: number; entry_name: string; normalized_player_name: string; player_name: string }>) {
      const owner = resolveOwnerName(aliasMap, row.entry_name);
      const acc: Acc = byOwner.get(owner) ?? { ownershipPcts: [], values: [], players: new Map<string, { name: string; count: number }>() };
      const pct = draftedByWeekPlayer.get(`${row.week}|${row.normalized_player_name}`);
      if (pct != null) acc.ownershipPcts.push(pct);
      const value = valueByWeekPlayer.get(`${row.week}|${row.normalized_player_name}`);
      if (value != null) acc.values.push(value);
      const player = acc.players.get(row.normalized_player_name) ?? { name: row.player_name, count: 0 };
      player.count += 1;
      acc.players.set(row.normalized_player_name, player);
      byOwner.set(owner, acc);
    }

    const results: RosterTendencyRow[] = [];
    for (const [owner, acc] of byOwner.entries()) {
      const mostUsed = [...acc.players.values()].sort((a, b) => b.count - a.count)[0] ?? null;
      results.push({
        ownerName: owner,
        avgFieldOwnership: acc.ownershipPcts.length
          ? Number((acc.ownershipPcts.reduce((a, b) => a + b, 0) / acc.ownershipPcts.length).toFixed(1))
          : null,
        uniquePlayersUsed: acc.players.size,
        mostUsedPlayer: mostUsed ? { name: mostUsed.name, count: mostUsed.count } : null,
        bestWinningStreak: longestConsecutiveStreak(winWeeksByOwner.get(owner) ?? []),
        avgValueFound: acc.values.length ? Number((acc.values.reduce((a, b) => a + b, 0) / acc.values.length).toFixed(2)) : null,
      });
    }
    return results.sort((a, b) => (b.avgValueFound ?? 0) - (a.avgValueFound ?? 0));
  } catch {
    return [];
  }
}

/** League-wide per-NFL-player exposure for one season -- appearances (roster-slot count
 *  across all entries/weeks), average and best field score, average field-rostered %, and
 *  the top owners (real names) who used them most. Same Phase 2 DK-results dependency as
 *  fetchRosterTendencies. */
export async function fetchPlayerExposure(season: number): Promise<PlayerExposureRow[]> {
  const sql = getSql();
  try {
    const fieldRows = await sql`
      SELECT fs.player_name, fs.normalized_player_name, fs.drafted_pct, fs.fantasy_points, pp.salary
      FROM football_result_weeks w
      JOIN football_result_player_field_stats fs ON fs.week_id = w.id
      LEFT JOIN football_player_pools pool ON pool.slate_key = w.slate_key
      LEFT JOIN football_player_pool_players pp ON pp.pool_id = pool.id AND pp.normalized_player_name = fs.normalized_player_name
      WHERE w.season = ${season}
    `;
    if (!(fieldRows as unknown[]).length) return [];

    const rosterRows = await sql`
      SELECT e.entry_name, ep.normalized_player_name, ep.player_name
      FROM football_result_weeks w
      JOIN football_result_entries e ON e.week_id = w.id
      JOIN football_result_entry_players ep ON ep.result_entry_id = e.id
      WHERE w.season = ${season}
    `;
    const aliasMap = await fetchAliasToNameMap();

    const statsByPlayer = new Map<string, { playerName: string; points: number[]; drafted: number[]; values: number[] }>();
    for (const row of fieldRows as Array<{ player_name: string; normalized_player_name: string; drafted_pct: string | number | null; fantasy_points: string | number | null; salary: number | null }>) {
      const key = row.normalized_player_name;
      const entry = statsByPlayer.get(key) ?? { playerName: row.player_name, points: [], drafted: [], values: [] };
      if (row.fantasy_points != null) entry.points.push(Number(row.fantasy_points));
      if (row.drafted_pct != null) entry.drafted.push(Number(row.drafted_pct));
      if (row.fantasy_points != null && row.salary != null && row.salary > 0) {
        entry.values.push((Number(row.fantasy_points) / row.salary) * 1000);
      }
      statsByPlayer.set(key, entry);
    }

    const usageByPlayer = new Map<string, { playerName: string; count: number; ownerCounts: Map<string, number> }>();
    for (const row of rosterRows as Array<{ entry_name: string; normalized_player_name: string; player_name: string }>) {
      const key = row.normalized_player_name;
      const entry = usageByPlayer.get(key) ?? { playerName: row.player_name, count: 0, ownerCounts: new Map() };
      entry.count += 1;
      const owner = resolveOwnerName(aliasMap, row.entry_name);
      entry.ownerCounts.set(owner, (entry.ownerCounts.get(owner) ?? 0) + 1);
      usageByPlayer.set(key, entry);
    }

    const results: PlayerExposureRow[] = [];
    for (const [key, usage] of usageByPlayer.entries()) {
      const stats = statsByPlayer.get(key);
      const usedBy = [...usage.ownerCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([ownerName, count]) => ({ ownerName, count }));
      results.push({
        playerName: usage.playerName,
        appearances: usage.count,
        avgPoints: stats?.points.length ? Number((stats.points.reduce((a, b) => a + b, 0) / stats.points.length).toFixed(1)) : null,
        bestWeek: stats?.points.length ? Math.max(...stats.points) : null,
        avgFieldRostered: stats?.drafted.length ? Number((stats.drafted.reduce((a, b) => a + b, 0) / stats.drafted.length).toFixed(1)) : null,
        avgValue: stats?.values.length ? Number((stats.values.reduce((a, b) => a + b, 0) / stats.values.length).toFixed(2)) : null,
        bestValueWeek: stats?.values.length ? Number(Math.max(...stats.values).toFixed(2)) : null,
        usedBy,
      });
    }
    return results.sort((a, b) => b.appearances - a.appearances);
  } catch {
    return [];
  }
}
