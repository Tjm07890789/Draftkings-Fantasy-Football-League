import { neon } from "@neondatabase/serverless";

export type OwnerPrizeSummary = { winnerName: string; weeklyWins: number; totalWon: number };
export type OwnerWeekPrize = { week: number; amount: number | null };
export type OwnerSeasonWeekPrize = { season: number; week: number; amount: number | null };

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  return neon(databaseUrl);
}

/** Per-owner weekly-win counts and $ totals for one season -- powers the Statistics
 *  page's Prize Tracker. Reads football_weekly_prizes directly (admin-dashboard writes it
 *  via the "Weekly Winners & Recap" panel); returns [] gracefully if the table doesn't
 *  exist yet or nothing's been posted for this season. */
export async function fetchSeasonPrizeSummary(season: number): Promise<OwnerPrizeSummary[]> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT winner_name, COUNT(*) AS weekly_wins, COALESCE(SUM(amount), 0) AS total_won
      FROM football_weekly_prizes
      WHERE season = ${season}
      GROUP BY winner_name
      ORDER BY total_won DESC, weekly_wins DESC
    `;
    return (rows as any[]).map((row) => ({
      winnerName: row.winner_name,
      weeklyWins: Number(row.weekly_wins),
      totalWon: Number(row.total_won),
    }));
  } catch {
    return [];
  }
}

/** One owner's per-week prize postings for a season -- powers the "Player Weekly Results"
 *  log panel (which week(s) they won and for how much). */
export async function fetchOwnerSeasonPrizes(season: number, ownerName: string): Promise<OwnerWeekPrize[]> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT week, amount FROM football_weekly_prizes
      WHERE season = ${season} AND winner_name = ${ownerName}
      ORDER BY week ASC
    `;
    return (rows as any[]).map((row) => ({ week: Number(row.week), amount: row.amount == null ? null : Number(row.amount) }));
  } catch {
    return [];
  }
}

/** Same, across every season -- powers the per-owner "detail stats" profile's all-time
 *  weekly-win history. */
export async function fetchOwnerAllTimePrizes(ownerName: string): Promise<OwnerSeasonWeekPrize[]> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT season, week, amount FROM football_weekly_prizes
      WHERE winner_name = ${ownerName}
      ORDER BY season ASC, week ASC
    `;
    return (rows as any[]).map((row) => ({ season: Number(row.season), week: Number(row.week), amount: row.amount == null ? null : Number(row.amount) }));
  } catch {
    return [];
  }
}

/** Same rollup across every season ever posted -- powers the per-owner "detail stats"
 *  profile panel's all-time Weekly Wins / $ Won figures. */
export async function fetchAllTimePrizeSummary(): Promise<OwnerPrizeSummary[]> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT winner_name, COUNT(*) AS weekly_wins, COALESCE(SUM(amount), 0) AS total_won
      FROM football_weekly_prizes
      GROUP BY winner_name
      ORDER BY total_won DESC, weekly_wins DESC
    `;
    return (rows as any[]).map((row) => ({
      winnerName: row.winner_name,
      weeklyWins: Number(row.weekly_wins),
      totalWon: Number(row.total_won),
    }));
  } catch {
    return [];
  }
}
