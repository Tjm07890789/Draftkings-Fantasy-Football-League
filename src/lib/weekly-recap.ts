import { neon } from "@neondatabase/serverless";
import { fetchLeagueDataFromSheet } from "./data";
import { fetchWeeklyResultsSummary, listFootballResultWeeks } from "./weekly-results";

/**
 * Auto-generated weekly recap for the News page. Every sentence is a fixed template filled
 * with numbers read straight from the league's own data (the Google Sheet scores, the DK
 * results import, posted prizes) -- nothing is estimated or written freehand, so it can't
 * say something the data doesn't support. Each highlight carries a "where to find it" link
 * into the part of the league site that holds the full story.
 */

export type RecapLink = { label: string; href: string };

export type RecapHighlight = {
  id: string;
  emoji: string;
  title: string;
  text: string;
  link: RecapLink | null;
};

export type WeeklyRecap = {
  season: number;
  week: number;
  entryCount: number;
  commissionerNote: string | null;
  highlights: RecapHighlight[];
  tip: RecapHighlight;
  availableWeeks: number[];
};

type SheetRow = { name: string; weeks: number[] };

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  return neon(databaseUrl);
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const fmt = (value: number, digits = 2) => value.toFixed(digits);
const money = (value: number) => `$${value.toFixed(2)}`;

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/** Where each part of the league site lives. The league page reads ?go= on arrival. */
const LINKS = {
  grid: { label: "Season Grid", href: "/league?go=grid" },
  resultsAll: { label: "Weekly Results", href: "/league?go=results" },
  results: (week: number) => ({ label: `Weekly Results → Week ${week}`, href: `/league?go=results&week=${week}` }),
  standingsMovement: { label: "Statistics → Insights → Standings Movement", href: "/league?go=stats-insights" },
  weeklyRanks: { label: "Statistics → Weekly Ranks", href: "/league?go=stats-weekly-ranks" },
  prizes: { label: "Statistics → Prize Tracker", href: "/league?go=stats-prizes" },
  tendencies: { label: "Statistics → Roster Tendencies", href: "/league?go=stats-roster-tendencies" },
  exposure: { label: "Statistics → Player Exposure", href: "/league?go=stats-player-exposure" },
  career: { label: "All-Time Stats", href: "/league?go=career" },
};

const TIPS: RecapHighlight[] = [
  { id: "tip-view-team", emoji: "🔎", title: "Did you know?", text: "Open Weekly Results and hit “View Team” on any entry to see that exact lineup — with each player's salary, points, points per $1K, field ownership %, and what FantasyPros projected.", link: LINKS.resultsAll },
  { id: "tip-tendencies", emoji: "🕵️", title: "Did you know?", text: "Roster Tendencies names the league's contrarian, its chalk-lover, and its best bargain hunter, based on every lineup entered this season.", link: LINKS.tendencies },
  { id: "tip-exposure", emoji: "📊", title: "Did you know?", text: "Player Exposure shows which players the league keeps leaning on, who used them, and which ones actually paid off per dollar of salary.", link: LINKS.exposure },
  { id: "tip-h2h", emoji: "⚔️", title: "Did you know?", text: "All-Time Stats has a head-to-head tool: pick any two owners and see who has won more weeks across every season they've both played.", link: LINKS.career },
  { id: "tip-owner", emoji: "👤", title: "Did you know?", text: "Click any owner's name on the Season Grid for their week-by-week log and prize history.", link: LINKS.grid },
  { id: "tip-prizes", emoji: "💰", title: "Did you know?", text: "The Prize Tracker adds up weekly cash finishes and winnings for the season so far.", link: LINKS.prizes },
  { id: "tip-ranks", emoji: "📈", title: "Did you know?", text: "Weekly Ranks lays out every owner's finish, week by week, with an average-rank column and a jump-to-week control.", link: LINKS.weeklyRanks },
  { id: "tip-myteam", emoji: "👋", title: "Did you know?", text: "Tell the league page “which team is yours” and it will track your rank, the gap to the spot above you, and your current streak.", link: { label: "League site", href: "/league" } },
];

type FieldStat = { name: string; position: string | null; drafted: number | null; points: number | null; salary: number | null };

async function fetchFieldStats(season: number, week: number): Promise<FieldStat[]> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT fs.player_name, fs.roster_position, fs.drafted_pct, fs.fantasy_points, pp.salary
      FROM football_result_player_field_stats fs
      JOIN football_result_weeks w ON w.id = fs.week_id
      LEFT JOIN football_player_pools pool ON pool.slate_key = w.slate_key
      LEFT JOIN football_player_pool_players pp ON pp.pool_id = pool.id AND pp.normalized_player_name = fs.normalized_player_name
      WHERE w.season = ${season} AND w.week = ${week}
    `;
    // DECIMAL columns arrive as strings from neon -- coerce before any comparison.
    return (rows as any[]).map((row) => ({
      name: row.player_name,
      position: row.roster_position ?? null,
      drafted: row.drafted_pct == null ? null : Number(row.drafted_pct),
      points: row.fantasy_points == null ? null : Number(row.fantasy_points),
      salary: row.salary == null ? null : Number(row.salary),
    }));
  } catch {
    return [];
  }
}

/** Cash finishes and winnings through a given week, from the posted weekly prizes. */
async function fetchMoneyList(season: number, throughWeek: number): Promise<Array<{ name: string; finishes: number; won: number }>> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT winner_name, COUNT(*) AS finishes, COALESCE(SUM(amount), 0) AS won
      FROM football_weekly_prizes
      WHERE season = ${season} AND week <= ${throughWeek}
      GROUP BY winner_name
      ORDER BY SUM(amount) DESC NULLS LAST
    `;
    return (rows as any[]).map((row) => ({ name: row.winner_name, finishes: Number(row.finishes), won: Number(row.won) }));
  } catch {
    return [];
  }
}

function top10Through(row: SheetRow, throughWeek: number): number | null {
  const played = row.weeks.slice(0, throughWeek).filter((score) => score > 0).sort((a, b) => b - a).slice(0, 10);
  return played.length ? mean(played) : null;
}

export async function fetchWeeklyRecap(requestedWeek?: number): Promise<WeeklyRecap | null> {
  const data = await fetchLeagueDataFromSheet();
  const season = Number(data.currentSeasonYear);
  if (!Number.isFinite(season)) return null;
  const rows: SheetRow[] = (data.seasons[String(season)] ?? []).map((row: any) => ({ name: row.name, weeks: row.weeks }));

  const listed = await listFootballResultWeeks(season).catch(() => []);
  const sheetWeeks = Array.from({ length: 18 }, (_, i) => i + 1).filter((w) => rows.some((row) => (row.weeks[w - 1] ?? 0) > 0));
  const availableWeeks = Array.from(new Set([...listed.map((item) => item.week), ...sheetWeeks])).sort((a, b) => b - a);
  if (!availableWeeks.length) return null;

  const week = requestedWeek && availableWeeks.includes(requestedWeek) ? requestedWeek : availableWeeks[0];
  const wi = week - 1;

  const [summary, fieldStats, moneyList] = await Promise.all([
    fetchWeeklyResultsSummary(season, week).catch(() => null),
    fetchFieldStats(season, week),
    fetchMoneyList(season, week),
  ]);

  const highlights: RecapHighlight[] = [];
  const weekScores = rows
    .map((row) => ({ name: row.name, score: row.weeks[wi] ?? 0 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  // 1. Winner + payouts
  const prizes = summary?.prizes ?? [];
  if (prizes.length) {
    const [first, second, third] = prizes;
    const podium = [second, third].filter(Boolean).map((p) => `${p!.winnerName}${p!.amount != null ? ` (${money(p!.amount)})` : ""}`);
    const firstScore = weekScores.find((entry) => entry.name === first.winnerName)?.score;
    highlights.push({
      id: "winner",
      emoji: "🏆",
      title: "Week winner",
      text: `${first.winnerName} took Week ${week}${firstScore != null ? ` with ${fmt(firstScore)} points` : ""}${first.amount != null ? ` and ${money(first.amount)}` : ""}.${podium.length ? ` Also in the money: ${podium.join(", ")}${prizes.length > 3 ? ` and ${prizes.length - 3} more` : ""}.` : ""}`,
      link: LINKS.results(week),
    });
  } else if (weekScores.length) {
    highlights.push({
      id: "winner",
      emoji: "🏆",
      title: "Week leader",
      text: `${weekScores[0].name} posted the top score of Week ${week}: ${fmt(weekScores[0].score)} points. Payouts haven't been posted yet.`,
      link: LINKS.results(week),
    });
  }

  // 2. The field
  if (weekScores.length >= 3) {
    const scores = weekScores.map((entry) => entry.score);
    const low = weekScores[weekScores.length - 1];
    highlights.push({
      id: "field",
      emoji: "📏",
      title: "The field",
      text: `${weekScores.length} entries averaged ${fmt(mean(scores), 1)} (median ${fmt(median(scores), 1)}). High ${fmt(weekScores[0].score)}, low ${fmt(low.score)} (${low.name}) — a ${fmt(weekScores[0].score - low.score, 1)}-point spread.`,
      link: LINKS.grid,
    });
  }

  // 3. Closest call
  if (weekScores.length >= 2) {
    let best = { index: 0, margin: Number.POSITIVE_INFINITY };
    for (let i = 0; i < weekScores.length - 1; i += 1) {
      const margin = weekScores[i].score - weekScores[i + 1].score;
      if (margin < best.margin) best = { index: i, margin };
    }
    const above = weekScores[best.index];
    const below = weekScores[best.index + 1];
    highlights.push({
      id: "closest",
      emoji: "🤏",
      title: "Closest call",
      text: `${above.name} (${ordinal(best.index + 1)}) edged ${below.name} (${ordinal(best.index + 2)}) by just ${fmt(best.margin)} points.`,
      link: LINKS.results(week),
    });
  }

  // 4. Biggest weekly climber (rank by that week's score, vs. the previous week)
  if (wi > 0) {
    const rankOf = (weekIndex: number) => {
      const ranked = rows
        .map((row) => ({ name: row.name, score: row.weeks[weekIndex] ?? 0 }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
      return new Map(ranked.map((entry, index) => [entry.name, index + 1]));
    };
    const now = rankOf(wi);
    const before = rankOf(wi - 1);
    let climber: { name: string; from: number; to: number } | null = null;
    for (const [name, to] of now) {
      const from = before.get(name);
      if (from == null) continue;
      if (!climber || from - to > climber.from - climber.to) climber = { name, from, to };
    }
    if (climber && climber.from - climber.to >= 3) {
      highlights.push({
        id: "climber",
        emoji: "🚀",
        title: "Biggest climber",
        text: `${climber.name} jumped ${climber.from - climber.to} spots in the weekly ranks — ${ordinal(climber.from)} in Week ${week - 1} to ${ordinal(climber.to)} in Week ${week}.`,
        link: LINKS.weeklyRanks,
      });
    }
  }

  // 5. Player of the week (DK field stats)
  const scored = fieldStats.filter((stat) => stat.points != null);
  if (scored.length) {
    const top = scored.reduce((best, stat) => ((stat.points ?? -1) > (best.points ?? -1) ? stat : best));
    highlights.push({
      id: "top-player",
      emoji: "⭐",
      title: "Player of the week",
      text: `${top.name} scored the most points of anyone in the player pool: ${fmt(top.points ?? 0, 1)}${top.drafted != null ? `, in ${fmt(top.drafted, 1)}% of lineups` : ""}${top.salary ? ` at a $${top.salary.toLocaleString()} salary` : ""}.`,
      link: LINKS.results(week),
    });
  }

  // 6. Chalk
  const owned = fieldStats.filter((stat) => stat.drafted != null);
  if (owned.length) {
    const chalk = owned.reduce((best, stat) => ((stat.drafted ?? -1) > (best.drafted ?? -1) ? stat : best));
    const verdict =
      chalk.points == null ? "" : ` and scored ${fmt(chalk.points, 1)}${chalk.salary ? ` (${fmt((chalk.points / chalk.salary) * 1000)} points per $1K)` : ""}`;
    highlights.push({
      id: "chalk",
      emoji: "🧊",
      title: "Chalk check",
      text: `${chalk.name} was the most-owned player, in ${fmt(chalk.drafted ?? 0, 1)}% of lineups${verdict}.`,
      link: LINKS.tendencies,
    });
  }

  // 7. Differentiator: the lowest-owned player who still had a big game
  if (summary?.differentiator && scored.length) {
    const topPoints = Math.max(...scored.map((stat) => stat.points ?? 0));
    const candidates = scored.filter((stat) => (stat.points ?? 0) >= topPoints * 0.5 && stat.drafted != null);
    if (candidates.length) {
      const diff = candidates.reduce((best, stat) => ((stat.drafted ?? 101) < (best.drafted ?? 101) ? stat : best));
      highlights.push({
        id: "differentiator",
        emoji: "🎯",
        title: "Differentiator",
        text: `${diff.name} was on only ${fmt(diff.drafted ?? 0, 1)}% of lineups but put up ${fmt(diff.points ?? 0, 1)} points — the kind of pick that separates a week.`,
        link: LINKS.exposure,
      });
    }
  }

  // 8. Best value find: points per $1K among players with a real game
  const valued = scored.filter((stat) => stat.salary && (stat.points ?? 0) >= 10);
  if (valued.length) {
    const best = valued.reduce((a, stat) => ((stat.points! / stat.salary!) > (a.points! / a.salary!) ? stat : a));
    highlights.push({
      id: "value",
      emoji: "💎",
      title: "Best value",
      text: `${best.name} returned ${fmt((best.points! / best.salary!) * 1000)} points per $1K — ${fmt(best.points!, 1)} points on a $${best.salary!.toLocaleString()} salary.`,
      link: LINKS.exposure,
    });
  }

  // 9. Winning lineup's best piece
  if (summary?.winningLineupEdge) {
    highlights.push({
      id: "winning-edge",
      emoji: "🧩",
      title: "What won it",
      text: `The winning lineup's biggest piece was ${summary.winningLineupEdge.playerName} with ${fmt(summary.winningLineupEdge.value, 1)} points.`,
      link: LINKS.results(week),
    });
  }

  // 10. Season race: the Top10-week-average standings, through this week
  const race = rows
    .map((row) => ({ name: row.name, avg: top10Through(row, week) }))
    .filter((entry): entry is { name: string; avg: number } => entry.avg != null)
    .sort((a, b) => b.avg - a.avg);
  if (race.length >= 2) {
    highlights.push({
      id: "race",
      emoji: "🏁",
      title: "Season race",
      text: `${race[0].name} leads the Top10 Avg race at ${fmt(race[0].avg)}, ${fmt(race[0].avg - race[1].avg)} ahead of ${race[1].name}${race[2] ? `, with ${race[2].name} third at ${fmt(race[2].avg)}` : ""}.`,
      link: LINKS.standingsMovement,
    });
  }

  // 11. Money list
  if (moneyList.length) {
    const lead = moneyList[0];
    highlights.push({
      id: "money",
      emoji: "💰",
      title: "Money list",
      text: `${lead.name} leads the season in weekly winnings with ${money(lead.won)} across ${lead.finishes} cash finish${lead.finishes === 1 ? "" : "es"}${moneyList[1] ? `; ${moneyList[1].name} is next at ${money(moneyList[1].won)}` : ""}.`,
      link: LINKS.prizes,
    });
  }

  // 12. Hot streak: consecutive weeks beating the field median, ending this week
  const medians = Array.from({ length: week }, (_, i) => {
    const scores = rows.map((row) => row.weeks[i] ?? 0).filter((score) => score > 0);
    return scores.length ? median(scores) : null;
  });
  let streakLeader: { name: string; streak: number } | null = null;
  for (const row of rows) {
    let streak = 0;
    for (let i = week - 1; i >= 0; i -= 1) {
      const score = row.weeks[i] ?? 0;
      const med = medians[i];
      if (score > 0 && med != null && score > med) streak += 1;
      else break;
    }
    if (streak >= 3 && (!streakLeader || streak > streakLeader.streak)) streakLeader = { name: row.name, streak };
  }
  if (streakLeader) {
    highlights.push({
      id: "streak",
      emoji: "🔥",
      title: "Hot streak",
      text: `${streakLeader.name} has beaten the league median ${streakLeader.streak} weeks in a row.`,
      link: LINKS.weeklyRanks,
    });
  }

  return {
    season,
    week,
    // League entries only: DK's count also includes the commissioner's own entry, which isn't in the league pool.
    entryCount: weekScores.length || summary?.participantCount || 0,
    commissionerNote: summary?.narrativeOverride?.trim() || null,
    highlights,
    tip: TIPS[(week + season) % TIPS.length],
    availableWeeks,
  };
}
