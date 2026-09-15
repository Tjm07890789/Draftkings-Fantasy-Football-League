import { neon } from "@neondatabase/serverless";
import { fetchAliasToNameMap, resolveOwnerName } from "./roster-crosswalk";

export type WeeklyResultsListItem = {
  season: number;
  week: number;
  participantCount: number;
  totalPrizes: number | null;
  importedAt: string;
};

export type WeeklyResultEntry = {
  rank: number | null;
  entryName: string;
  ownerName: string;
  points: number | null;
  prize: number | null;
};

export type WeeklyResultTile = { playerName: string; value: number } | null;

export type WeeklyPrizeWinner = { winnerName: string; amount: number | null };

export type WeeklyResultsSummary = {
  season: number;
  week: number;
  entryFee: number | null;
  grossPool: number | null;
  totalPrizes: number | null;
  participantCount: number;
  entries: WeeklyResultEntry[];
  mostRostered: WeeklyResultTile;
  highestFieldScore: WeeklyResultTile;
  winningLineupEdge: WeeklyResultTile;
  chalk: WeeklyResultTile;
  differentiator: WeeklyResultTile;
  prizes: WeeklyPrizeWinner[];
  narrativeOverride: string | null;
  hasDkResults: boolean;
};

export type WeeklyResultLineupPlayer = {
  rosterPosition: string | null;
  playerName: string;
  fieldPoints: number | null;
  draftedPct: number | null;
  fpProjection: number | null;
  fpEcrRank: number | null;
  injuryStatus: string | null;
  probabilityOfPlaying: number | null;
};

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  return neon(databaseUrl);
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** football_weekly_prizes/football_weekly_narratives (admin-dashboard) are populated
 *  before any DK results CSV import exists (Phase 1, 10 Sep 2026 plan) -- a week with only
 *  a posted prize/recap and no DK import yet still needs to show up in the week list. */
async function listPrizeOnlyWeeks(season?: number): Promise<WeeklyResultsListItem[]> {
  const sql = getSql();
  try {
    const rows = season
      ? await sql`
          SELECT p.season, p.week, MAX(p.posted_at) AS posted_at
          FROM football_weekly_prizes p
          WHERE p.season = ${season}
            AND NOT EXISTS (SELECT 1 FROM football_result_weeks w WHERE w.season = p.season AND w.week = p.week)
          GROUP BY p.season, p.week
        `
      : await sql`
          SELECT p.season, p.week, MAX(p.posted_at) AS posted_at
          FROM football_weekly_prizes p
          WHERE NOT EXISTS (SELECT 1 FROM football_result_weeks w WHERE w.season = p.season AND w.week = p.week)
          GROUP BY p.season, p.week
        `;
    return (rows as any[]).map((row) => ({
      season: Number(row.season),
      week: Number(row.week),
      participantCount: 0,
      totalPrizes: null,
      importedAt: row.posted_at,
    }));
  } catch {
    return [];
  }
}

export async function listFootballResultWeeks(season?: number): Promise<WeeklyResultsListItem[]> {
  const sql = getSql();
  const [dkRows, prizeOnlyWeeks] = await Promise.all([
    season
      ? sql`
          SELECT season, week, participant_count, total_prizes, imported_at
          FROM football_result_weeks
          WHERE season = ${season}
          ORDER BY week DESC
        `
      : sql`
          SELECT season, week, participant_count, total_prizes, imported_at
          FROM football_result_weeks
          ORDER BY season DESC, week DESC
        `,
    listPrizeOnlyWeeks(season),
  ]);
  const dkWeeks = (dkRows as any[]).map((row) => ({
    season: Number(row.season),
    week: Number(row.week),
    participantCount: Number(row.participant_count ?? 0),
    totalPrizes: row.total_prizes == null ? null : Number(row.total_prizes),
    importedAt: row.imported_at,
  }));
  return [...dkWeeks, ...prizeOnlyWeeks].sort((a, b) => (b.season - a.season) || (b.week - a.week));
}

async function fetchWeeklyPrizes(season: number, week: number): Promise<WeeklyPrizeWinner[]> {
  const sql = getSql();
  try {
    const rows = await sql`SELECT winner_name, amount FROM football_weekly_prizes WHERE season = ${season} AND week = ${week} ORDER BY id ASC`;
    return (rows as any[]).map((row) => ({ winnerName: row.winner_name, amount: row.amount == null ? null : Number(row.amount) }));
  } catch {
    return [];
  }
}

async function fetchWeeklyNarrativeOverride(season: number, week: number): Promise<string | null> {
  const sql = getSql();
  try {
    const rows = await sql`SELECT narrative_text FROM football_weekly_narratives WHERE season = ${season} AND week = ${week} LIMIT 1`;
    return (rows as any[])[0]?.narrative_text ?? null;
  } catch {
    return null;
  }
}

export async function fetchWeeklyResultsSummary(season: number, week: number): Promise<WeeklyResultsSummary | null> {
  const sql = getSql();
  const [weekRows, prizes, narrativeOverride] = await Promise.all([
    sql`
      SELECT id, entry_fee, gross_pool, total_prizes, participant_count
      FROM football_result_weeks
      WHERE season = ${season} AND week = ${week}
      LIMIT 1
    `,
    fetchWeeklyPrizes(season, week),
    fetchWeeklyNarrativeOverride(season, week),
  ]);
  const weekRow = (weekRows as any[])[0];

  if (!weekRow) {
    // Phase 1: winners/recap can be posted before any DK results CSV is imported for this
    // week -- surface a partial summary (no entries/tiles yet) instead of null so the week
    // still shows up with its prize badges and owner-side narrative.
    if (!prizes.length && !narrativeOverride) return null;
    return {
      season, week, entryFee: null, grossPool: null, totalPrizes: null, participantCount: 0,
      entries: [], mostRostered: null, highestFieldScore: null, winningLineupEdge: null, chalk: null, differentiator: null,
      prizes, narrativeOverride, hasDkResults: false,
    };
  }
  const weekId = weekRow.id;

  const entryRows = await sql`
    SELECT rank, entry_name, points, prize
    FROM football_result_entries
    WHERE week_id = ${weekId}
    ORDER BY rank ASC NULLS LAST
  `;
  const aliasMap = await fetchAliasToNameMap();
  const entries: WeeklyResultEntry[] = (entryRows as any[]).map((row) => ({
    rank: row.rank == null ? null : Number(row.rank),
    entryName: row.entry_name,
    ownerName: resolveOwnerName(aliasMap, row.entry_name),
    points: row.points == null ? null : Number(row.points),
    prize: row.prize == null ? null : Number(row.prize),
  }));

  const fieldStatRows = await sql`
    SELECT player_name, drafted_pct, fantasy_points
    FROM football_result_player_field_stats
    WHERE week_id = ${weekId}
  `;
  // Postgres DECIMAL columns come back from neon as strings, not numbers — coerce here so
  // downstream numeric comparisons (reduce/sort) don't silently fall back to lexicographic
  // string comparison (e.g. "9.00" > "35.00").
  const fieldStats = (fieldStatRows as Array<{ player_name: string; drafted_pct: string | number | null; fantasy_points: string | number | null }>).map(
    (row) => ({
      player_name: row.player_name,
      drafted_pct: row.drafted_pct == null ? null : Number(row.drafted_pct),
      fantasy_points: row.fantasy_points == null ? null : Number(row.fantasy_points),
    }),
  );

  const mostRosteredRow = fieldStats.reduce<typeof fieldStats[number] | null>((best, row) => {
    if (row.drafted_pct == null) return best;
    if (!best || (best.drafted_pct ?? -1) < row.drafted_pct) return row;
    return best;
  }, null);
  const highestScoreRow = fieldStats.reduce<typeof fieldStats[number] | null>((best, row) => {
    if (row.fantasy_points == null) return best;
    if (!best || (best.fantasy_points ?? -1) < row.fantasy_points) return row;
    return best;
  }, null);

  let winningLineupEdge: WeeklyResultTile = null;
  const winner = entries.find((entry) => entry.rank === 1);
  if (winner) {
    const winnerPlayerRows = await sql`
      SELECT ep.normalized_player_name, ep.player_name
      FROM football_result_entry_players ep
      JOIN football_result_entries e ON e.id = ep.result_entry_id
      WHERE e.week_id = ${weekId} AND e.normalized_entry_name = ${normalizeName(winner.entryName)}
    `;
    const statsByName = new Map(fieldStats.map((row) => [normalizeName(row.player_name), row.fantasy_points]));
    let best: { playerName: string; value: number } | null = null;
    for (const row of winnerPlayerRows as Array<{ normalized_player_name: string; player_name: string }>) {
      const points = statsByName.get(row.normalized_player_name);
      if (points == null) continue;
      if (!best || points > best.value) best = { playerName: row.player_name, value: points };
    }
    winningLineupEdge = best;
  }

  // "Differentiator" -- the lowest-owned player among those who still put up a genuinely
  // strong game (>= half the week's top score) -- the classic "who won it for someone"
  // storyline, distinct from mostRostered/chalk (highest-owned) and highestFieldScore
  // (which could just be a popular, high-owned stud).
  const scoreThreshold = (highestScoreRow?.fantasy_points ?? 0) * 0.5;
  const differentiatorRow = fieldStats.reduce<typeof fieldStats[number] | null>((best, row) => {
    if (row.fantasy_points == null || row.drafted_pct == null) return best;
    if (row.fantasy_points < scoreThreshold) return best;
    if (!best || (best.drafted_pct ?? Infinity) > row.drafted_pct) return row;
    return best;
  }, null);

  return {
    season,
    week,
    entryFee: weekRow.entry_fee == null ? null : Number(weekRow.entry_fee),
    grossPool: weekRow.gross_pool == null ? null : Number(weekRow.gross_pool),
    totalPrizes: weekRow.total_prizes == null ? null : Number(weekRow.total_prizes),
    participantCount: Number(weekRow.participant_count ?? entries.length),
    entries,
    mostRostered: mostRosteredRow ? { playerName: mostRosteredRow.player_name, value: mostRosteredRow.drafted_pct ?? 0 } : null,
    highestFieldScore: highestScoreRow ? { playerName: highestScoreRow.player_name, value: highestScoreRow.fantasy_points ?? 0 } : null,
    winningLineupEdge,
    chalk: mostRosteredRow ? { playerName: mostRosteredRow.player_name, value: mostRosteredRow.drafted_pct ?? 0 } : null,
    differentiator: differentiatorRow ? { playerName: differentiatorRow.player_name, value: differentiatorRow.fantasy_points ?? 0 } : null,
    prizes,
    narrativeOverride,
    hasDkResults: true,
  };
}

/** A specific entrant's roster for the week, cross-referenced against whatever FantasyPros
 *  signal data the admin optimizer already captured for that slate (projection, injury
 *  status, consensus rank) — the piece golf's page doesn't have. Falls back gracefully to
 *  just field-stat points when no matching signal row exists (e.g. a player never in the
 *  salary pool, or signals weren't refreshed that week). */
export async function fetchEntryLineup(season: number, week: number, entryName: string): Promise<WeeklyResultLineupPlayer[]> {
  const sql = getSql();
  const slateKey = `${season}-w${week}`;
  const normalizedEntryName = normalizeName(entryName);

  const playerRows = await sql`
    SELECT ep.sort_order, ep.player_name, ep.normalized_player_name, ep.roster_position
    FROM football_result_entry_players ep
    JOIN football_result_entries e ON e.id = ep.result_entry_id
    JOIN football_result_weeks w ON w.id = e.week_id
    WHERE w.season = ${season} AND w.week = ${week} AND e.normalized_entry_name = ${normalizedEntryName}
    ORDER BY ep.sort_order ASC
  `;

  const fieldStatRows = await sql`
    SELECT fs.normalized_player_name, fs.drafted_pct, fs.fantasy_points
    FROM football_result_player_field_stats fs
    JOIN football_result_weeks w ON w.id = fs.week_id
    WHERE w.season = ${season} AND w.week = ${week}
  `;
  const fieldStatsByName = new Map(
    (fieldStatRows as Array<{ normalized_player_name: string; drafted_pct: string | number | null; fantasy_points: string | number | null }>).map(
      (row) => [
        row.normalized_player_name,
        {
          drafted_pct: row.drafted_pct == null ? null : Number(row.drafted_pct),
          fantasy_points: row.fantasy_points == null ? null : Number(row.fantasy_points),
        },
      ],
    ),
  );

  let signalsByName = new Map<string, { fp_projection: number | null; fp_ecr_rank: number | null; injury_status: string | null; probability_of_playing: number | null }>();
  try {
    const signalRows = await sql`
      SELECT normalized_player_name, fp_projection, fp_ecr_rank, injury_status, probability_of_playing
      FROM football_weekly_player_signals
      WHERE slate_key = ${slateKey}
    `;
    signalsByName = new Map(
      (signalRows as any[]).map((row) => [
        row.normalized_player_name,
        {
          fp_projection: row.fp_projection == null ? null : Number(row.fp_projection),
          fp_ecr_rank: row.fp_ecr_rank == null ? null : Number(row.fp_ecr_rank),
          injury_status: row.injury_status ?? null,
          probability_of_playing: row.probability_of_playing == null ? null : Number(row.probability_of_playing),
        },
      ]),
    );
  } catch {
    // football_weekly_player_signals may not exist yet in some environments -- degrade gracefully.
  }

  return (playerRows as Array<{ sort_order: number; player_name: string; normalized_player_name: string; roster_position: string | null }>).map((row) => {
    const fieldStat = fieldStatsByName.get(row.normalized_player_name);
    const signal = signalsByName.get(row.normalized_player_name);
    return {
      rosterPosition: row.roster_position,
      playerName: row.player_name,
      fieldPoints: fieldStat?.fantasy_points ?? null,
      draftedPct: fieldStat?.drafted_pct ?? null,
      fpProjection: signal?.fp_projection ?? null,
      fpEcrRank: signal?.fp_ecr_rank ?? null,
      injuryStatus: signal?.injury_status ?? null,
      probabilityOfPlaying: signal?.probability_of_playing ?? null,
    };
  });
}
