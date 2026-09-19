"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type View = "current" | "previous" | "career";

type SeasonRow = {
  name: string;
  weeks: number[];
  total: number;
  avgWeekly: number;
  top10Avg: number;
  top10WeekIndexes: number[];
};

type LeagueData = {
  years: string[];
  currentSeasonYear: string | null;
  previousYears: string[];
  seasons: Record<string, SeasonRow[]>;
};

type SortDirection = "asc" | "desc";
type SortColumn = "name" | "total" | "avgWeekly" | "top10Avg" | `week-${number}`;
type LayoutPreference = "auto" | "mobile" | "desktop";
type MobileTab = "home" | "stats" | "standings" | "more";

const LAYOUT_PREF_KEY = "dfs_v1_layout_pref";
const BANNERS_COLLAPSED_KEY = "dfs_v1_banners_collapsed";

const NAV_COOKIE = "dfs_v1_last_nav";
const SEASON_COOKIE = "dfs_v1_last_season";
const AVG_WEEKLY_HELP = "Avg Weekly = total points divided by the number of season weeks where at least one player recorded a score.";

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

function getCookie(name: string): string | null {
  const key = `${name}=`;
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(key))
    ?.slice(key.length);
  return cookie ? decodeURIComponent(cookie) : null;
}

function formatCell(value: number) {
  return value.toFixed(2);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getColumnLabel(column: SortColumn) {
  if (column.startsWith("week-")) {
    const week = Number.parseInt(column.replace("week-", ""), 10);
    return `W${week + 1}`;
  }
  if (column === "avgWeekly") return "Avg Weekly";
  if (column === "top10Avg") return "Top10 Avg";
  return column.charAt(0).toUpperCase() + column.slice(1);
}

function getSortValue(row: SeasonRow, column: SortColumn): string | number {
  if (column === "name") return row.name.toLowerCase();
  if (column === "total") return row.total;
  if (column === "avgWeekly") return row.avgWeekly;
  if (column === "top10Avg") return row.top10Avg;
  const weekIndex = Number.parseInt(column.replace("week-", ""), 10);
  return row.weeks[weekIndex] ?? 0;
}

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function formatSigned(value: number) {
  const rounded = Number.parseFloat(value.toFixed(2));
  if (rounded > 0) return `+${rounded.toFixed(2)}`;
  return rounded.toFixed(2);
}

function StatisticsView({ rows, seasonLabel }: { rows: SeasonRow[]; seasonLabel: string }) {
  type StatsSubview = "insights" | "weekly-ranks" | "prizes" | "roster-tendencies" | "player-exposure";
  type RankSortColumn = "name" | "avgRank" | `week-${number}`;
  type RankSortDirection = "asc" | "desc";

  const [statsSubview, setStatsSubview] = React.useState<StatsSubview>("insights");
  const [rankSortColumn, setRankSortColumn] = React.useState<RankSortColumn>("avgRank");
  const [rankSortDirection, setRankSortDirection] = React.useState<RankSortDirection>("asc");
  const [jumpWeek, setJumpWeek] = React.useState<string>("avg");
  const weeklyRankContainerRef = React.useRef<HTMLDivElement | null>(null);

  const playedWeekCount = React.useMemo(() => {
    return rows.reduce((max, row) => {
      const played = row.weeks.filter((score) => score > 0).length;
      return Math.max(max, played);
    }, 0);
  }, [rows]);

  const activeWeeks = React.useMemo(() => {
    return Array.from({ length: playedWeekCount }, (_, index) => index);
  }, [playedWeekCount]);

  const weeklyMedians = React.useMemo(() => {
    return activeWeeks.map((weekIndex) => {
      const weekScores = rows
        .map((row) => row.weeks[weekIndex] ?? 0)
        .filter((score) => score > 0)
        .sort((a, b) => a - b);
      if (!weekScores.length) return 0;
      const middle = Math.floor(weekScores.length / 2);
      if (weekScores.length % 2 === 1) return weekScores[middle];
      return (weekScores[middle - 1] + weekScores[middle]) / 2;
    });
  }, [activeWeeks, rows]);

  const teamMetrics = React.useMemo(() => {
    return rows.map((row) => {
      const played = row.weeks.slice(0, playedWeekCount).filter((score) => score > 0);
      const recentWindow = played.slice(-4);
      const previousWindow = played.slice(-8, -4);
      const recentAvg = mean(recentWindow);
      const previousAvg = mean(previousWindow.length ? previousWindow : recentWindow);
      const momentum = recentAvg - previousAvg;
      const variability = stdDev(played);
      const medianWins = played.reduce((wins, score, weekIndex) => {
        return wins + (score > (weeklyMedians[weekIndex] ?? 0) ? 1 : 0);
      }, 0);
      const powerScore = row.avgWeekly * 0.55 + recentAvg * 0.3 + row.top10Avg * 0.15 - variability * 0.08;

      return {
        ...row,
        recentAvg,
        momentum,
        variability,
        medianWins,
        projectedRecord: `${medianWins}-${Math.max(played.length - medianWins, 0)}`,
        powerScore,
        bestWeek: played.length ? Math.max(...played) : 0,
      };
    });
  }, [playedWeekCount, rows, weeklyMedians]);

  const trendRows = React.useMemo(
    () => [...teamMetrics].sort((a, b) => b.recentAvg - a.recentAvg),
    [teamMetrics],
  );

  const powerRows = React.useMemo(
    () => [...teamMetrics].sort((a, b) => b.powerScore - a.powerScore),
    [teamMetrics],
  );

  const totalRank = React.useMemo(() => {
    const sorted = [...teamMetrics].sort((a, b) => b.total - a.total);
    return new Map(sorted.map((row, index) => [row.name, index + 1]));
  }, [teamMetrics]);

  const medianWinsRank = React.useMemo(() => {
    const sorted = [...teamMetrics].sort((a, b) => b.medianWins - a.medianWins);
    return new Map(sorted.map((row, index) => [row.name, index + 1]));
  }, [teamMetrics]);

  const insightRows = React.useMemo(() => {
    return [...teamMetrics]
      .map((row) => {
        const luckIndex = (totalRank.get(row.name) ?? 0) - (medianWinsRank.get(row.name) ?? 0);
        return { ...row, luckIndex };
      })
      .sort((a, b) => a.luckIndex - b.luckIndex);
  }, [medianWinsRank, teamMetrics, totalRank]);

  const weeklyRankMaps = React.useMemo(() => {
    return activeWeeks.map((weekIndex) => {
      const weekRankMap = new Map<string, number>();
      const ranked = rows
        .map((row) => ({ name: row.name, score: row.weeks[weekIndex] ?? 0 }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.name.localeCompare(b.name);
        });

      ranked.forEach((entry, index) => {
        weekRankMap.set(entry.name, index + 1);
      });
      return weekRankMap;
    });
  }, [activeWeeks, rows]);

  const weeklyRankRows = React.useMemo(() => {
    const baseRows = rows.map((row) => {
      const weekRanks = activeWeeks.map((_, weekArrayIndex) => weeklyRankMaps[weekArrayIndex].get(row.name) ?? null);
      const playedRanks = weekRanks.filter((rank): rank is number => rank !== null);
      return {
        name: row.name,
        weekRanks,
        avgRank: playedRanks.length ? mean(playedRanks) : 0,
      };
    });

    return [...baseRows].sort((a, b) => {
      const direction = rankSortDirection === "asc" ? 1 : -1;
      if (rankSortColumn === "name") return a.name.localeCompare(b.name) * direction;
      if (rankSortColumn === "avgRank") return (a.avgRank - b.avgRank) * direction;

      const weekIndex = Number.parseInt(rankSortColumn.replace("week-", ""), 10);
      const aRank = a.weekRanks[weekIndex] ?? 999;
      const bRank = b.weekRanks[weekIndex] ?? 999;
      return (aRank - bRank) * direction;
    });
  }, [activeWeeks, rankSortColumn, rankSortDirection, rows, weeklyRankMaps]);

  const handleRankSort = (column: RankSortColumn) => {
    if (column === rankSortColumn) {
      setRankSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setRankSortColumn(column);
    setRankSortDirection(column === "name" ? "asc" : "asc");
  };

  const rankSortLabel = (column: RankSortColumn) => {
    if (column !== rankSortColumn) return "";
    return rankSortDirection === "asc" ? " ↑" : " ↓";
  };

  const scrollWeeklyRanksTo = (target: string) => {
    const container = weeklyRankContainerRef.current;
    if (!container) return;
    if (target === "team") {
      container.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }
    if (target === "avg") {
      container.scrollTo({ left: container.scrollWidth, behavior: "smooth" });
      return;
    }
    const targetWeek = Number.parseInt(target, 10);
    if (!Number.isFinite(targetWeek) || targetWeek < 1) return;
    const col = container.querySelector<HTMLElement>(`#rank-col-w${targetWeek}`);
    if (!col) return;
    const leftPadding = 120;
    container.scrollTo({ left: Math.max(col.offsetLeft - leftPadding, 0), behavior: "smooth" });
  };

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-white/25 bg-green-950/65 p-8 text-center">
        <h2 className="text-3xl font-extrabold tracking-wide text-white">Statistics</h2>
        <p className="mt-3 text-lg text-green-100">No season data available yet.</p>
      </div>
    );
  }

  return (
    <section className="w-full space-y-4 rounded-xl border border-white/30 bg-green-950/65 p-4 shadow-xl shadow-black/25 md:max-h-[calc(100vh-7rem)] md:overflow-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-extrabold tracking-wide text-white">Statistics</h2>
          <p className="text-sm text-green-100">
            {seasonLabel} | through week {playedWeekCount}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStatsSubview("insights")}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${statsSubview === "insights" ? "border-emerald-300 bg-emerald-400/20 text-emerald-100" : "border-white/20 bg-white/10 text-green-100 hover:bg-white/20"}`}
          >
            Insights
          </button>
          <button
            type="button"
            onClick={() => setStatsSubview("weekly-ranks")}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${statsSubview === "weekly-ranks" ? "border-emerald-300 bg-emerald-400/20 text-emerald-100" : "border-white/20 bg-white/10 text-green-100 hover:bg-white/20"}`}
          >
            Weekly Rank Grid
          </button>
          <button
            type="button"
            onClick={() => setStatsSubview("prizes")}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${statsSubview === "prizes" ? "border-emerald-300 bg-emerald-400/20 text-emerald-100" : "border-white/20 bg-white/10 text-green-100 hover:bg-white/20"}`}
          >
            Prize Tracker
          </button>
          <button
            type="button"
            onClick={() => setStatsSubview("roster-tendencies")}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${statsSubview === "roster-tendencies" ? "border-emerald-300 bg-emerald-400/20 text-emerald-100" : "border-white/20 bg-white/10 text-green-100 hover:bg-white/20"}`}
          >
            Roster Tendencies
          </button>
          <button
            type="button"
            onClick={() => setStatsSubview("player-exposure")}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${statsSubview === "player-exposure" ? "border-emerald-300 bg-emerald-400/20 text-emerald-100" : "border-white/20 bg-white/10 text-green-100 hover:bg-white/20"}`}
          >
            Player Exposure
          </button>
        </div>
      </div>

      {statsSubview === "insights" && (
      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        <article className="min-h-0 rounded-lg border border-white/20 bg-black/20 p-3">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-green-100">Team Trends</h3>
          <div className="max-h-[42vh] overflow-auto lg:max-h-[56vh]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/20 text-left text-green-100">
                  <th className="py-1">Team</th>
                  <th className="py-1 text-right">Recent 4</th>
                  <th className="py-1 text-right">Momentum</th>
                  <th className="py-1 text-right">Best Wk</th>
                </tr>
              </thead>
              <tbody>
                {trendRows.map((row) => (
                  <tr key={`trend-${row.name}`} className="border-b border-white/10">
                    <td className="py-1 font-semibold">{row.name}</td>
                    <td className="py-1 text-right">{formatCell(row.recentAvg)}</td>
                    <td className={`py-1 text-right ${row.momentum >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {formatSigned(row.momentum)}
                    </td>
                    <td className="py-1 text-right">{formatCell(row.bestWeek)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="min-h-0 rounded-lg border border-white/20 bg-black/20 p-3">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-green-100">Power Rankings</h3>
          <div className="max-h-[42vh] overflow-auto lg:max-h-[56vh]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/20 text-left text-green-100">
                  <th className="w-10 py-1 text-right tabular-nums">#</th>
                  <th className="py-1 pl-3">Team</th>
                  <th className="py-1 text-right">Power</th>
                  <th className="py-1 text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {powerRows.map((row, index) => (
                  <tr key={`power-${row.name}`} className="border-b border-white/10">
                    <td className="w-10 py-1 pr-1 text-right font-semibold tabular-nums">{index + 1}</td>
                    <td className="py-1 pl-3 font-semibold">{row.name}</td>
                    <td className="py-1 text-right">{formatCell(row.powerScore)}</td>
                    <td className="py-1 text-right">{formatCell(row.variability)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="min-h-0 rounded-lg border border-white/20 bg-black/20 p-3">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-green-100">Matchup Insights</h3>
          <div className="max-h-[42vh] overflow-auto lg:max-h-[56vh]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/20 text-left text-green-100">
                  <th className="py-1">Team</th>
                  <th className="py-1 text-right">Vs Median</th>
                  <th className="py-1 text-right">Luck Index</th>
                </tr>
              </thead>
              <tbody>
                {insightRows.map((row) => (
                  <tr key={`insight-${row.name}`} className="border-b border-white/10">
                    <td className="py-1 font-semibold">{row.name}</td>
                    <td className="py-1 text-right">{row.projectedRecord}</td>
                    <td className={`py-1 text-right ${row.luckIndex <= 0 ? "text-emerald-300" : "text-amber-200"}`}>
                      {formatSigned(row.luckIndex)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
      )}

      {statsSubview === "weekly-ranks" && (
        <article className="min-h-0 rounded-lg border border-white/20 bg-black/20 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-green-100">Weekly Rank Grid</h3>
            <div className="flex items-center gap-2">
              <label htmlFor="jump-week" className="text-[11px] font-semibold uppercase tracking-wide text-green-100">
                Jump to
              </label>
              <select
                id="jump-week"
                value={jumpWeek}
                onChange={(event) => {
                  const next = event.target.value;
                  setJumpWeek(next);
                  scrollWeeklyRanksTo(next);
                }}
                className="rounded-md border border-white/25 bg-green-950/90 px-2 py-1 text-xs text-green-100"
              >
                <option value="team">Team</option>
                {activeWeeks.map((weekIndex) => (
                  <option key={`jump-week-${weekIndex + 1}`} value={String(weekIndex + 1)}>
                    Week {weekIndex + 1}
                  </option>
                ))}
                <option value="avg">Avg Rank</option>
              </select>
            </div>
          </div>
          <div ref={weeklyRankContainerRef} className="max-h-[62vh] overflow-auto">
            <table className="w-full min-w-[980px] text-xs">
              <thead>
                <tr className="border-b border-white/20 text-left text-green-100">
                  <th className="sticky top-0 bg-green-950/95 py-1">
                    <button type="button" className="w-full text-left" onClick={() => handleRankSort("name")}>
                      Team{rankSortLabel("name")}
                    </button>
                  </th>
                  {activeWeeks.map((weekIndex) => (
                    <th
                      id={`rank-col-w${weekIndex + 1}`}
                      key={`rank-head-${weekIndex + 1}`}
                      className="sticky top-0 bg-green-950/95 py-1 text-right tabular-nums"
                    >
                      <button type="button" className="w-full text-right" onClick={() => handleRankSort(`week-${weekIndex}`)}>
                        W{weekIndex + 1}{rankSortLabel(`week-${weekIndex}`)}
                      </button>
                    </th>
                  ))}
                  <th className="sticky top-0 bg-green-950/95 py-1 text-right">
                    <button type="button" className="w-full text-right" onClick={() => handleRankSort("avgRank")}>
                      Avg Rank{rankSortLabel("avgRank")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {weeklyRankRows.map((row) => (
                  <tr key={`rank-row-${row.name}`} className="border-b border-white/10">
                    <td className="py-1 font-semibold">{row.name}</td>
                    {row.weekRanks.map((rank, index) => (
                      <td key={`rank-${row.name}-${index + 1}`} className="py-1 text-right tabular-nums">
                        {rank ?? "-"}
                      </td>
                    ))}
                    <td className="py-1 text-right font-semibold tabular-nums">{formatCell(row.avgRank)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {statsSubview === "prizes" && <PrizeTrackerPanel rows={rows} seasonLabel={seasonLabel} />}
      {statsSubview === "roster-tendencies" && <RosterTendenciesPanel seasonLabel={seasonLabel} />}
      {statsSubview === "player-exposure" && <PlayerExposurePanel seasonLabel={seasonLabel} />}
    </section>
  );
}

const WEEKLY_DK_ENTRY_FEE = 5;

type PrizeTrackerSortColumn = "name" | "weeklyWins" | "totalWon" | "entryFees" | "netEarnings" | "standing";

function PrizeTrackerPanel({ rows, seasonLabel }: { rows: SeasonRow[]; seasonLabel: string }) {
  const [prizeSummary, setPrizeSummary] = React.useState<OwnerPrizeSummary[] | null>(null);
  const [sortColumn, setSortColumn] = React.useState<PrizeTrackerSortColumn>("netEarnings");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const numericSeason = Number(seasonLabel);

  React.useEffect(() => {
    if (!Number.isFinite(numericSeason)) {
      setPrizeSummary([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/weekly-prizes?season=${numericSeason}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setPrizeSummary(data.summary ?? []);
      })
      .catch(() => {
        if (!cancelled) setPrizeSummary([]);
      });
    return () => {
      cancelled = true;
    };
  }, [numericSeason]);

  const seasonPrizeStandingRank = React.useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.top10Avg - a.top10Avg);
    return new Map(sorted.map((row, index) => [row.name, index + 1]));
  }, [rows]);

  const tableRows = React.useMemo(() => {
    const byName = new Map((prizeSummary ?? []).map((p) => [p.winnerName, p]));
    const direction = sortDirection === "asc" ? 1 : -1;
    return rows
      .map((row) => {
        const prize = byName.get(row.name);
        const weeksEntered = row.weeks.filter((score) => score > 0).length;
        const totalWon = prize?.totalWon ?? 0;
        const entryFees = weeksEntered * WEEKLY_DK_ENTRY_FEE;
        return {
          name: row.name,
          weeklyWins: prize?.weeklyWins ?? 0,
          totalWon,
          entryFees,
          netEarnings: Number((totalWon - entryFees).toFixed(2)),
          standing: seasonPrizeStandingRank.get(row.name) ?? null,
        };
      })
      .sort((a, b) => {
        if (sortColumn === "name") return a.name.localeCompare(b.name) * direction;
        if (sortColumn === "standing") return ((a.standing ?? 0) - (b.standing ?? 0)) * direction;
        return (a[sortColumn] - b[sortColumn]) * direction;
      });
  }, [rows, prizeSummary, seasonPrizeStandingRank, sortColumn, sortDirection]);

  const handleSort = (column: PrizeTrackerSortColumn) => {
    if (column === sortColumn) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection(column === "name" ? "asc" : "desc");
  };

  const sortLabel = (column: PrizeTrackerSortColumn) => (column === sortColumn ? (sortDirection === "asc" ? " ↑" : " ↓") : "");

  if (prizeSummary === null) {
    return <div className="rounded-lg border border-white/20 bg-black/20 p-4 text-center text-xs text-green-100/70">Loading prize tracker...</div>;
  }

  return (
    <article className="min-h-0 rounded-lg border border-white/20 bg-black/20 p-3">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-green-100">Prize Tracker</h3>
      <p className="mb-3 text-[11px] text-green-100/70">
        Weekly high-score winners as posted by the admin, net earnings after the ${WEEKLY_DK_ENTRY_FEE}/week DK entry fee, plus
        each owner&apos;s current Top-10-Week-Avg standing toward the season-long prize.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-xs">
          <thead>
            <tr className="border-b border-white/20 text-left text-green-100">
              <th className="py-1 pr-2"><button type="button" onClick={() => handleSort("name")}>Owner{sortLabel("name")}</button></th>
              <th className="py-1 pr-2 text-right"><button type="button" onClick={() => handleSort("weeklyWins")}>Weekly Wins{sortLabel("weeklyWins")}</button></th>
              <th className="py-1 pr-2 text-right"><button type="button" onClick={() => handleSort("totalWon")}>Total $ Won{sortLabel("totalWon")}</button></th>
              <th className="py-1 pr-2 text-right"><button type="button" onClick={() => handleSort("entryFees")}>Entry Fees{sortLabel("entryFees")}</button></th>
              <th className="py-1 pr-2 text-right"><button type="button" onClick={() => handleSort("netEarnings")}>Net Earnings{sortLabel("netEarnings")}</button></th>
              <th className="py-1 text-right"><button type="button" onClick={() => handleSort("standing")}>Season-Prize Standing{sortLabel("standing")}</button></th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr key={row.name} className="border-b border-white/10">
                <td className="py-1 pr-2 font-semibold text-white">{row.name}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{row.weeklyWins}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{row.totalWon > 0 ? `$${row.totalWon.toFixed(2)}` : "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{row.entryFees > 0 ? `$${row.entryFees.toFixed(2)}` : "—"}</td>
                <td className={`py-1 pr-2 text-right font-semibold tabular-nums ${row.netEarnings > 0 ? "text-emerald-300" : row.netEarnings < 0 ? "text-rose-300" : ""}`}>
                  {row.entryFees > 0 || row.totalWon > 0 ? `${row.netEarnings < 0 ? "-" : ""}$${Math.abs(row.netEarnings).toFixed(2)}` : "—"}
                </td>
                <td className="py-1 text-right tabular-nums">{row.standing != null ? `#${row.standing} (Top10 Avg)` : "—"}</td>
              </tr>
            ))}
            {!tableRows.length && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-green-100/70">
                  No season data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

type RosterTendencyRow = {
  ownerName: string;
  avgFieldOwnership: number | null;
  uniquePlayersUsed: number;
  mostUsedPlayer: { name: string; count: number } | null;
  bestWinningStreak: number;
};

/** Roster-construction tendencies per owner -- needs a real DK results import for the
 *  season (Phase 2, 10 Sep 2026 plan). Modeled on the golf site's "Player Strategy
 *  Tendencies" Advanced Stats section, adapted for football (no "made cut" concept, so
 *  streak is tied to posted weekly wins instead). */
function RosterTendenciesPanel({ seasonLabel }: { seasonLabel: string }) {
  const [rows, setRows] = React.useState<RosterTendencyRow[] | null>(null);
  const numericSeason = Number(seasonLabel);

  React.useEffect(() => {
    if (!Number.isFinite(numericSeason)) {
      setRows([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/roster-stats?season=${numericSeason}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setRows(data.tendencies ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [numericSeason]);

  if (rows === null) {
    return <div className="rounded-lg border border-white/20 bg-black/20 p-4 text-center text-xs text-green-100/70">Loading roster tendencies...</div>;
  }

  if (!rows.length) {
    return (
      <div className="rounded-lg border border-white/20 bg-black/20 p-4 text-center text-xs text-green-100/70">
        No DK results imported for this season yet -- once you import a week&apos;s contest-standings CSV, roster-construction
        tendencies (field ownership, most-used players, winning streaks) will show up here.
      </div>
    );
  }

  return (
    <article className="min-h-0 rounded-lg border border-white/20 bg-black/20 p-3">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-green-100">Roster Tendencies</h3>
      <p className="mb-3 text-[11px] text-green-100/70">
        How each owner builds their roster this season -- lower avg field ownership means more contrarian picks.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="border-b border-white/20 text-left text-green-100">
              <th className="py-1 pr-2">Owner</th>
              <th className="py-1 pr-2 text-right">Avg Field Ownership</th>
              <th className="py-1 pr-2 text-right">Unique Players Used</th>
              <th className="py-1 pr-2 text-right">Most Used Player</th>
              <th className="py-1 text-right">Best Winning Streak</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ownerName} className="border-b border-white/10">
                <td className="py-1 pr-2 font-semibold text-white">{row.ownerName}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{row.avgFieldOwnership != null ? `${row.avgFieldOwnership.toFixed(1)}%` : "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{row.uniquePlayersUsed}</td>
                <td className="py-1 pr-2 text-right">
                  {row.mostUsedPlayer ? `${row.mostUsedPlayer.name} (${row.mostUsedPlayer.count})` : "—"}
                </td>
                <td className="py-1 text-right tabular-nums">{row.bestWinningStreak > 0 ? `${row.bestWinningStreak} wk` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

type PlayerExposureRow = {
  playerName: string;
  appearances: number;
  avgPoints: number | null;
  bestWeek: number | null;
  avgFieldRostered: number | null;
  usedBy: Array<{ ownerName: string; count: number }>;
};

/** League-wide per-NFL-player exposure/trends for the season -- same Phase 2 DK-results
 *  dependency as RosterTendenciesPanel. Modeled on the golf site's "Golfer Exposure and
 *  Trends" Advanced Stats section. */
function PlayerExposurePanel({ seasonLabel }: { seasonLabel: string }) {
  const [rows, setRows] = React.useState<PlayerExposureRow[] | null>(null);
  const numericSeason = Number(seasonLabel);

  React.useEffect(() => {
    if (!Number.isFinite(numericSeason)) {
      setRows([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/roster-stats?season=${numericSeason}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setRows(data.exposure ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [numericSeason]);

  if (rows === null) {
    return <div className="rounded-lg border border-white/20 bg-black/20 p-4 text-center text-xs text-green-100/70">Loading player exposure...</div>;
  }

  if (!rows.length) {
    return (
      <div className="rounded-lg border border-white/20 bg-black/20 p-4 text-center text-xs text-green-100/70">
        No DK results imported for this season yet -- once you import a week&apos;s contest-standings CSV, player exposure
        (appearances, avg points, who used them) will show up here.
      </div>
    );
  }

  return (
    <article className="min-h-0 rounded-lg border border-white/20 bg-black/20 p-3">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-green-100">Player Exposure &amp; Trends</h3>
      <p className="mb-3 text-[11px] text-green-100/70">
        Season-long NFL player usage across every submitted lineup -- higher exposure usually means the league trusted that
        player repeatedly.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="border-b border-white/20 text-left text-green-100">
              <th className="py-1 pr-2">Player</th>
              <th className="py-1 pr-2 text-right">Appearances</th>
              <th className="py-1 pr-2 text-right">Avg Pts</th>
              <th className="py-1 pr-2 text-right">Best Week</th>
              <th className="py-1 pr-2 text-right">Avg Field Rostered</th>
              <th className="py-1 text-right">Used By</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 40).map((row) => (
              <tr key={row.playerName} className="border-b border-white/10">
                <td className="py-1 pr-2 font-semibold text-white">{row.playerName}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{row.appearances}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{row.avgPoints ?? "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{row.bestWeek ?? "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{row.avgFieldRostered != null ? `${row.avgFieldRostered.toFixed(1)}%` : "—"}</td>
                <td className="py-1 text-right text-green-100/80">
                  {row.usedBy.map((u) => `${u.ownerName} (${u.count})`).join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

type CareerPlayerStats = {
  name: string;
  seasonsPlayed: number;
  weeksPlayed: number;
  careerTotal: number;
  careerAvg: number;
  bestSeasonYear: string | null;
  bestSeasonAvg: number;
  bestWeekScore: number;
  bestWeekYear: string | null;
  bestWeekNumber: number | null;
  consistency: number;
  trend: "up" | "down" | "flat" | "new";
  trendDelta: number;
};

function computeCareerStats(allSeasons: Record<string, SeasonRow[]>): CareerPlayerStats[] {
  const years = Object.keys(allSeasons).sort((a, b) => Number(b) - Number(a));
  const careerEntries = new Map<string, { year: string; score: number; week: number }[]>();
  const seasonAvgByName = new Map<string, Map<string, number>>();

  for (const year of years) {
    for (const row of allSeasons[year] ?? []) {
      const played = row.weeks
        .map((score, weekIndex) => ({ score, week: weekIndex + 1 }))
        .filter((entry) => entry.score > 0);
      if (!played.length) continue;

      if (!careerEntries.has(row.name)) careerEntries.set(row.name, []);
      const list = careerEntries.get(row.name)!;
      played.forEach((entry) => list.push({ year, score: entry.score, week: entry.week }));

      if (!seasonAvgByName.has(row.name)) seasonAvgByName.set(row.name, new Map());
      seasonAvgByName.get(row.name)!.set(year, mean(played.map((entry) => entry.score)));
    }
  }

  const results: CareerPlayerStats[] = [];
  for (const [name, entries] of careerEntries) {
    const scores = entries.map((entry) => entry.score);
    const seasonAvgs = seasonAvgByName.get(name)!;
    const playedYears = years.filter((year) => seasonAvgs.has(year));

    let bestSeasonYear: string | null = null;
    let bestSeasonAvg = -Infinity;
    for (const [year, avg] of seasonAvgs) {
      if (avg > bestSeasonAvg) {
        bestSeasonAvg = avg;
        bestSeasonYear = year;
      }
    }

    let bestWeekScore = 0;
    let bestWeekYear: string | null = null;
    let bestWeekNumber: number | null = null;
    for (const entry of entries) {
      if (entry.score > bestWeekScore) {
        bestWeekScore = entry.score;
        bestWeekYear = entry.year;
        bestWeekNumber = entry.week;
      }
    }

    let trend: CareerPlayerStats["trend"] = "new";
    let trendDelta = 0;
    if (playedYears.length >= 2) {
      const mostRecent = seasonAvgs.get(playedYears[0])!;
      const prior = seasonAvgs.get(playedYears[1])!;
      trendDelta = mostRecent - prior;
      trend = Math.abs(trendDelta) < 2 ? "flat" : trendDelta > 0 ? "up" : "down";
    }

    results.push({
      name,
      seasonsPlayed: playedYears.length,
      weeksPlayed: scores.length,
      careerTotal: Number.parseFloat(scores.reduce((sum, score) => sum + score, 0).toFixed(2)),
      careerAvg: Number.parseFloat(mean(scores).toFixed(2)),
      bestSeasonYear,
      bestSeasonAvg: Number.parseFloat((bestSeasonAvg === -Infinity ? 0 : bestSeasonAvg).toFixed(2)),
      bestWeekScore: Number.parseFloat(bestWeekScore.toFixed(2)),
      bestWeekYear,
      bestWeekNumber,
      consistency: Number.parseFloat(stdDev(scores).toFixed(2)),
      trend,
      trendDelta: Number.parseFloat(trendDelta.toFixed(2)),
    });
  }
  return results;
}

function computeHeadToHead(allSeasons: Record<string, SeasonRow[]>, playerA: string, playerB: string) {
  let winsA = 0;
  let winsB = 0;
  let ties = 0;
  let sharedWeeks = 0;
  let bestMarginA = { value: 0, year: "", week: 0 };
  let bestMarginB = { value: 0, year: "", week: 0 };
  const scoresA: number[] = [];
  const scoresB: number[] = [];

  for (const [year, rows] of Object.entries(allSeasons)) {
    const rowA = rows.find((row) => row.name === playerA);
    const rowB = rows.find((row) => row.name === playerB);
    if (!rowA || !rowB) continue;
    const weekCount = Math.max(rowA.weeks.length, rowB.weeks.length);
    for (let week = 0; week < weekCount; week++) {
      const scoreA = rowA.weeks[week] ?? 0;
      const scoreB = rowB.weeks[week] ?? 0;
      if (scoreA <= 0 || scoreB <= 0) continue;
      sharedWeeks += 1;
      scoresA.push(scoreA);
      scoresB.push(scoreB);
      const margin = scoreA - scoreB;
      if (margin > 0) {
        winsA += 1;
        if (margin > bestMarginA.value) bestMarginA = { value: margin, year, week: week + 1 };
      } else if (margin < 0) {
        winsB += 1;
        if (-margin > bestMarginB.value) bestMarginB = { value: -margin, year, week: week + 1 };
      } else {
        ties += 1;
      }
    }
  }

  return {
    winsA,
    winsB,
    ties,
    sharedWeeks,
    bestMarginA,
    bestMarginB,
    avgA: mean(scoresA),
    avgB: mean(scoresB),
  };
}

function trendGlyph(trend: CareerPlayerStats["trend"]) {
  if (trend === "up") return { icon: "↑", className: "text-emerald-300" };
  if (trend === "down") return { icon: "↓", className: "text-rose-300" };
  if (trend === "flat") return { icon: "→", className: "text-green-100/70" };
  return { icon: "✦", className: "text-amber-200" };
}

/** Per-owner career detail panel -- career totals (reuses the already-computed
 *  CareerPlayerStats, no re-fetch needed), all-time Weekly Wins/$ Won (Phase 1 prize data),
 *  and a season-by-season Top-10-Avg standing history. Reached by clicking a name on the
 *  All-Time Leaderboard (10 Sep 2026 plan). */
function PlayerDetailPanel({
  ownerName,
  allSeasons,
  careerStat,
  onClose,
  onCompare,
}: {
  ownerName: string;
  allSeasons: Record<string, SeasonRow[]>;
  careerStat: CareerPlayerStats | null;
  onClose: () => void;
  onCompare: () => void;
}) {
  const [allTimePrizes, setAllTimePrizes] = React.useState<OwnerPrizeSummary | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setAllTimePrizes(null);
    fetch(`/api/weekly-prizes?scope=all-time&owner=${encodeURIComponent(ownerName)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const weeks: Array<{ amount: number | null }> = data.weeks ?? [];
        setAllTimePrizes({
          winnerName: ownerName,
          weeklyWins: weeks.length,
          totalWon: weeks.reduce((sum, w) => sum + (w.amount ?? 0), 0),
        });
      })
      .catch(() => {
        if (!cancelled) setAllTimePrizes({ winnerName: ownerName, weeklyWins: 0, totalWon: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [ownerName]);

  const seasonHistory = React.useMemo(() => {
    return Object.entries(allSeasons)
      .filter(([, rows]) => rows.some((row) => row.name === ownerName && row.weeks.some((score) => score > 0)))
      .map(([year, rows]) => {
        const sorted = [...rows].sort((a, b) => b.top10Avg - a.top10Avg);
        const standing = sorted.findIndex((row) => row.name === ownerName) + 1;
        const row = rows.find((r) => r.name === ownerName)!;
        return { year, standing, fieldSize: rows.length, top10Avg: row.top10Avg, avgWeekly: row.avgWeekly };
      })
      .sort((a, b) => b.year.localeCompare(a.year));
  }, [allSeasons, ownerName]);

  if (!careerStat) return null;

  return (
    <div className="rounded-xl border border-emerald-300/40 bg-black/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-200">{ownerName} — Career Profile</h3>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCompare} className="text-xs text-emerald-300 hover:text-emerald-100">
            Compare in Head-to-Head →
          </button>
          <button type="button" onClick={onClose} className="text-xs text-green-100/70 hover:text-white">
            Close ✕
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-md bg-white/5 p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-green-100/70">Career Avg</div>
          <div className="font-bold text-white">{formatCell(careerStat.careerAvg)}</div>
          <div className="text-[11px] text-green-100/70">{careerStat.seasonsPlayed} season(s), {careerStat.weeksPlayed} weeks</div>
        </div>
        <div className="rounded-md bg-white/5 p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-green-100/70">Best Season</div>
          <div className="font-bold text-white">{formatCell(careerStat.bestSeasonAvg)}</div>
          <div className="text-[11px] text-green-100/70">{careerStat.bestSeasonYear}</div>
        </div>
        <div className="rounded-md bg-white/5 p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-green-100/70">Best Week Ever</div>
          <div className="font-bold text-white">{formatCell(careerStat.bestWeekScore)}</div>
          <div className="text-[11px] text-green-100/70">{careerStat.bestWeekYear} Wk {careerStat.bestWeekNumber}</div>
        </div>
        <div className="rounded-md bg-white/5 p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-green-100/70">All-Time Prizes</div>
          {allTimePrizes === null ? (
            <div className="text-[11px] text-green-100/70">Loading...</div>
          ) : (
            <>
              <div className="font-bold text-white">{allTimePrizes.weeklyWins} weekly win{allTimePrizes.weeklyWins === 1 ? "" : "s"}</div>
              <div className="text-[11px] text-green-100/70">{allTimePrizes.totalWon > 0 ? `$${allTimePrizes.totalWon.toFixed(2)} won` : "$0 won"}</div>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[360px] text-xs">
          <thead>
            <tr className="border-b border-white/20 text-left text-green-100">
              <th className="py-1 pr-2">Season</th>
              <th className="py-1 pr-2 text-right">Season-Prize Standing</th>
              <th className="py-1 pr-2 text-right">Top10 Avg</th>
              <th className="py-1 text-right">Avg/Week</th>
            </tr>
          </thead>
          <tbody>
            {seasonHistory.map((entry) => (
              <tr key={entry.year} className="border-b border-white/10">
                <td className="py-1 pr-2 font-semibold text-white">{entry.year}</td>
                <td className="py-1 pr-2 text-right tabular-nums">#{entry.standing} of {entry.fieldSize}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{formatCell(entry.top10Avg)}</td>
                <td className="py-1 text-right tabular-nums">{formatCell(entry.avgWeekly)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CareerStatsView({ allSeasons }: { allSeasons: Record<string, SeasonRow[]> }) {
  type CareerSubview = "leaderboard" | "head-to-head";
  type CareerSortColumn = "name" | "seasonsPlayed" | "weeksPlayed" | "careerTotal" | "careerAvg" | "bestSeasonAvg" | "bestWeekScore" | "consistency";

  const [subview, setSubview] = React.useState<CareerSubview>("leaderboard");
  const [sortColumn, setSortColumn] = React.useState<CareerSortColumn>("careerAvg");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [playerA, setPlayerA] = React.useState("");
  const [playerB, setPlayerB] = React.useState("");
  const [selectedDetailOwner, setSelectedDetailOwner] = React.useState<string | null>(null);

  const careerStats = React.useMemo(() => computeCareerStats(allSeasons), [allSeasons]);

  const sortedStats = React.useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...careerStats].sort((a, b) => {
      if (sortColumn === "name") return a.name.localeCompare(b.name) * direction;
      return (a[sortColumn] - b[sortColumn]) * direction;
    });
  }, [careerStats, sortColumn, sortDirection]);

  const handleSort = (column: CareerSortColumn) => {
    if (column === sortColumn) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection(column === "name" ? "asc" : "desc");
  };

  const sortLabel = (column: CareerSortColumn) => (column === sortColumn ? (sortDirection === "asc" ? " ↑" : " ↓") : "");

  const qualified = careerStats.filter((stat) => stat.weeksPlayed >= 10);

  const hallOfFame = React.useMemo(() => {
    if (!careerStats.length) return null;
    const bestWeekEver = [...careerStats].sort((a, b) => b.bestWeekScore - a.bestWeekScore)[0];
    const bestCareerAvg = [...(qualified.length ? qualified : careerStats)].sort((a, b) => b.careerAvg - a.careerAvg)[0];
    const mostDurable = [...careerStats].sort((a, b) => b.weeksPlayed - a.weeksPlayed)[0];
    const mostConsistent = qualified.length ? [...qualified].sort((a, b) => a.consistency - b.consistency)[0] : null;
    const mostImproved = [...careerStats].filter((s) => s.trend === "up").sort((a, b) => b.trendDelta - a.trendDelta)[0] ?? null;
    return { bestWeekEver, bestCareerAvg, mostDurable, mostConsistent, mostImproved };
  }, [careerStats, qualified]);

  const allNames = React.useMemo(() => [...careerStats].map((stat) => stat.name).sort((a, b) => a.localeCompare(b)), [careerStats]);
  const h2h = playerA && playerB && playerA !== playerB ? computeHeadToHead(allSeasons, playerA, playerB) : null;

  if (!careerStats.length) {
    return (
      <div className="rounded-xl border border-white/25 bg-green-950/65 p-8 text-center">
        <h2 className="text-2xl font-extrabold text-white">No Career Data Yet</h2>
        <p className="mt-3 text-green-100">Once a season has real weekly scores, all-time stats will show up here.</p>
      </div>
    );
  }

  return (
    <section className="w-full space-y-4 rounded-xl border border-white/30 bg-green-950/65 p-4 shadow-xl shadow-black/25 md:max-h-[calc(100vh-7rem)] md:overflow-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-extrabold tracking-wide text-white">All-Time Stats</h2>
          <p className="text-sm text-green-100">Across every season in the books — {careerStats.length} players, {Object.keys(allSeasons).length} seasons tracked</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubview("leaderboard")}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${subview === "leaderboard" ? "border-emerald-300 bg-emerald-400/20 text-emerald-100" : "border-white/20 bg-white/10 text-green-100 hover:bg-white/20"}`}
          >
            Leaderboard
          </button>
          <button
            type="button"
            onClick={() => setSubview("head-to-head")}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${subview === "head-to-head" ? "border-emerald-300 bg-emerald-400/20 text-emerald-100" : "border-white/20 bg-white/10 text-green-100 hover:bg-white/20"}`}
          >
            Head-to-Head
          </button>
        </div>
      </div>

      {hallOfFame && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-green-100/70">Best Week Ever</div>
            <div className="font-bold text-white">{hallOfFame.bestWeekEver.name}</div>
            <div className="text-[11px] text-green-100/70">
              {formatCell(hallOfFame.bestWeekEver.bestWeekScore)} pts ({hallOfFame.bestWeekEver.bestWeekYear} Wk {hallOfFame.bestWeekEver.bestWeekNumber})
            </div>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-green-100/70">Best Career Avg</div>
            <div className="font-bold text-white">{hallOfFame.bestCareerAvg.name}</div>
            <div className="text-[11px] text-green-100/70">{formatCell(hallOfFame.bestCareerAvg.careerAvg)} pts/wk</div>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-green-100/70">Most Durable</div>
            <div className="font-bold text-white">{hallOfFame.mostDurable.name}</div>
            <div className="text-[11px] text-green-100/70">{hallOfFame.mostDurable.weeksPlayed} weeks played</div>
          </div>
          {hallOfFame.mostConsistent && (
            <div className="rounded-lg bg-white/5 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-green-100/70">Most Consistent</div>
              <div className="font-bold text-white">{hallOfFame.mostConsistent.name}</div>
              <div className="text-[11px] text-green-100/70">±{formatCell(hallOfFame.mostConsistent.consistency)} std dev</div>
            </div>
          )}
          {hallOfFame.mostImproved && (
            <div className="rounded-lg bg-white/5 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-green-100/70">Most Improved</div>
              <div className="font-bold text-white">{hallOfFame.mostImproved.name}</div>
              <div className="text-[11px] text-emerald-300">{formatSigned(hallOfFame.mostImproved.trendDelta)} pts/wk YoY</div>
            </div>
          )}
        </div>
      )}

      {subview === "leaderboard" && (
        <div className="overflow-x-auto rounded-lg border border-white/20 bg-black/20">
          <table className="w-full min-w-[860px] text-xs">
            <thead>
              <tr className="border-b border-white/20 text-left text-green-100">
                <th className="sticky top-0 bg-green-950/95 px-2 py-2">#</th>
                <th className="sticky top-0 bg-green-950/95 px-2 py-2">
                  <button type="button" onClick={() => handleSort("name")}>Player{sortLabel("name")}</button>
                </th>
                <th className="sticky top-0 bg-green-950/95 px-2 py-2 text-right">
                  <button type="button" onClick={() => handleSort("seasonsPlayed")}>Seasons{sortLabel("seasonsPlayed")}</button>
                </th>
                <th className="sticky top-0 bg-green-950/95 px-2 py-2 text-right">
                  <button type="button" onClick={() => handleSort("weeksPlayed")}>Weeks{sortLabel("weeksPlayed")}</button>
                </th>
                <th className="sticky top-0 bg-green-950/95 px-2 py-2 text-right">
                  <button type="button" onClick={() => handleSort("careerTotal")}>Career Total{sortLabel("careerTotal")}</button>
                </th>
                <th className="sticky top-0 bg-green-950/95 px-2 py-2 text-right">
                  <button type="button" onClick={() => handleSort("careerAvg")}>Career Avg{sortLabel("careerAvg")}</button>
                </th>
                <th className="sticky top-0 bg-green-950/95 px-2 py-2 text-right">
                  <button type="button" onClick={() => handleSort("bestSeasonAvg")}>Best Season{sortLabel("bestSeasonAvg")}</button>
                </th>
                <th className="sticky top-0 bg-green-950/95 px-2 py-2 text-right">
                  <button type="button" onClick={() => handleSort("bestWeekScore")}>Best Week{sortLabel("bestWeekScore")}</button>
                </th>
                <th className="sticky top-0 bg-green-950/95 px-2 py-2 text-right">
                  <button type="button" onClick={() => handleSort("consistency")}>Consistency{sortLabel("consistency")}</button>
                </th>
                <th className="sticky top-0 bg-green-950/95 px-2 py-2 text-right">Trend</th>
              </tr>
            </thead>
            <tbody>
              {sortedStats.map((stat, index) => {
                const glyph = trendGlyph(stat.trend);
                return (
                  <tr key={stat.name} className="border-b border-white/10">
                    <td className="px-2 py-1.5 text-right tabular-nums text-green-100/70">{index + 1}</td>
                    <td className="px-2 py-1.5 font-semibold text-white">
                      <button
                        type="button"
                        onClick={() => setSelectedDetailOwner((prev) => (prev === stat.name ? null : stat.name))}
                        className="underline decoration-dotted underline-offset-2 hover:text-emerald-200"
                      >
                        {stat.name}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{stat.seasonsPlayed}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{stat.weeksPlayed}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatCell(stat.careerTotal)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatCell(stat.careerAvg)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatCell(stat.bestSeasonAvg)} <span className="text-green-100/60">({stat.bestSeasonYear})</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatCell(stat.bestWeekScore)} <span className="text-green-100/60">({stat.bestWeekYear} Wk {stat.bestWeekNumber})</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">±{formatCell(stat.consistency)}</td>
                    <td className={`px-2 py-1.5 text-right font-bold ${glyph.className}`}>{glyph.icon}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {subview === "leaderboard" && selectedDetailOwner && (
        <PlayerDetailPanel
          ownerName={selectedDetailOwner}
          allSeasons={allSeasons}
          careerStat={careerStats.find((s) => s.name === selectedDetailOwner) ?? null}
          onClose={() => setSelectedDetailOwner(null)}
          onCompare={() => {
            setPlayerA(selectedDetailOwner);
            setPlayerB("");
            setSelectedDetailOwner(null);
            setSubview("head-to-head");
          }}
        />
      )}

      {subview === "head-to-head" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/20 bg-black/20 p-3">
            <select
              value={playerA}
              onChange={(event) => setPlayerA(event.target.value)}
              className="rounded-md border border-white/25 bg-green-950/90 px-2 py-1.5 text-sm text-green-100"
            >
              <option value="">Player A...</option>
              {allNames.map((name) => (
                <option key={`a-${name}`} value={name} disabled={name === playerB}>{name}</option>
              ))}
            </select>
            <span className="font-bold text-green-100/70">vs</span>
            <select
              value={playerB}
              onChange={(event) => setPlayerB(event.target.value)}
              className="rounded-md border border-white/25 bg-green-950/90 px-2 py-1.5 text-sm text-green-100"
            >
              <option value="">Player B...</option>
              {allNames.map((name) => (
                <option key={`b-${name}`} value={name} disabled={name === playerA}>{name}</option>
              ))}
            </select>
          </div>

          {h2h && (
            <div className="rounded-lg border border-white/20 bg-black/20 p-4">
              {h2h.sharedWeeks === 0 ? (
                <p className="text-green-100">{playerA} and {playerB} have never played the same week in a shared season.</p>
              ) : (
                <>
                  <div className="mb-3 text-center">
                    <div className="text-xs uppercase tracking-wide text-green-100/70">Simulated Record (higher score wins the week)</div>
                    <div className="text-2xl font-extrabold text-white">
                      {playerA} {h2h.winsA} — {h2h.winsB} {playerB}
                      {h2h.ties > 0 && <span className="text-green-100/60 text-base"> ({h2h.ties} tied)</span>}
                    </div>
                    <div className="text-xs text-green-100/70">{h2h.sharedWeeks} shared weeks</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md bg-white/5 p-3 text-center">
                      <div className="font-bold text-white">{playerA}</div>
                      <div className="text-xs text-green-100/70">Avg in shared weeks: {formatCell(h2h.avgA)}</div>
                      {h2h.bestMarginA.value > 0 && (
                        <div className="text-xs text-emerald-300">
                          Biggest win: +{formatCell(h2h.bestMarginA.value)} ({h2h.bestMarginA.year} Wk {h2h.bestMarginA.week})
                        </div>
                      )}
                    </div>
                    <div className="rounded-md bg-white/5 p-3 text-center">
                      <div className="font-bold text-white">{playerB}</div>
                      <div className="text-xs text-green-100/70">Avg in shared weeks: {formatCell(h2h.avgB)}</div>
                      {h2h.bestMarginB.value > 0 && (
                        <div className="text-xs text-emerald-300">
                          Biggest win: +{formatCell(h2h.bestMarginB.value)} ({h2h.bestMarginB.year} Wk {h2h.bestMarginB.week})
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-green-100/60">
        Built from season weekly-total scores. Once weekly DK results start importing this season, this page can grow
        roster-level analytics too (chalk vs. contrarian tendency, most-used players, ROI) — matching the golf site&apos;s
        Advanced Stats page.
      </p>
    </section>
  );
}

type WeeklyResultsListItem = { season: number; week: number; participantCount: number; totalPrizes: number | null };
type WeeklyResultTile = { playerName: string; value: number } | null;
type WeeklyResultEntry = { rank: number | null; entryName: string; ownerName: string; points: number | null; prize: number | null };
type WeeklyPrizeWinner = { winnerName: string; amount: number | null };
type OwnerPrizeSummary = { winnerName: string; weeklyWins: number; totalWon: number };

type WeeklyResultsSummary = {
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
type WeeklyResultLineupPlayer = {
  rosterPosition: string | null;
  playerName: string;
  fieldPoints: number | null;
  draftedPct: number | null;
  fpProjection: number | null;
  fpEcrRank: number | null;
  injuryStatus: string | null;
  probabilityOfPlaying: number | null;
};

function injuryTagColor(status: string | null): string {
  if (!status || status === "HEALTHY" || status === "PROBABLE") return "text-green-100/70";
  if (status === "OUT" || status === "IR") return "text-rose-300";
  if (status === "DOUBTFUL") return "text-amber-300";
  return "text-yellow-200";
}

function EntryLineupPanel({ season, week, entryName }: { season: number; week: number; entryName: string }) {
  const [lineup, setLineup] = React.useState<WeeklyResultLineupPlayer[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/weekly-results?season=${season}&week=${week}&entry=${encodeURIComponent(entryName)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setLineup(data.lineup ?? []);
      })
      .catch(() => {
        if (!cancelled) setLineup([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [season, week, entryName]);

  if (loading) return <div className="p-3 text-xs text-green-100/70">Loading lineup...</div>;
  if (!lineup?.length) return <div className="p-3 text-xs text-green-100/70">No lineup data found for this entry.</div>;

  return (
    <div className="overflow-x-auto rounded-lg border border-white/15 bg-black/25 p-3">
      <table className="w-full min-w-[560px] text-xs">
        <thead>
          <tr className="border-b border-white/20 text-left text-green-100">
            <th className="py-1 pr-2">Slot</th>
            <th className="py-1 pr-2">Player</th>
            <th className="py-1 pr-2 text-right">Points</th>
            <th className="py-1 pr-2 text-right">Rostered</th>
            <th className="py-1 pr-2 text-right">FP Proj</th>
            <th className="py-1 pr-2 text-right">FP Rank</th>
            <th className="py-1 text-right">Injury</th>
          </tr>
        </thead>
        <tbody>
          {lineup.map((player, index) => (
            <tr key={`${player.playerName}-${index}`} className="border-b border-white/10">
              <td className="py-1 pr-2 font-semibold text-green-100">{player.rosterPosition ?? "-"}</td>
              <td className="py-1 pr-2 font-semibold text-white">{player.playerName}</td>
              <td className="py-1 pr-2 text-right">{player.fieldPoints ?? "—"}</td>
              <td className="py-1 pr-2 text-right">{player.draftedPct != null ? `${player.draftedPct.toFixed(1)}%` : "—"}</td>
              <td className="py-1 pr-2 text-right">{player.fpProjection ?? "—"}</td>
              <td className="py-1 pr-2 text-right">{player.fpEcrRank ?? "—"}</td>
              <td className={`py-1 text-right ${injuryTagColor(player.injuryStatus)}`}>{player.injuryStatus ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeekResultCard({ season, week, participantCount, rows }: { season: number; week: number; participantCount: number; rows: SeasonRow[] }) {
  const [expanded, setExpanded] = React.useState(false);
  const [summary, setSummary] = React.useState<WeeklyResultsSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [openEntry, setOpenEntry] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/weekly-results?season=${season}&week=${week}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSummary(data.summary ?? null);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [season, week]);

  // Recap paragraph fetches eagerly (not gated behind Expand) since it's meant to be
  // readable at a glance -- Expand still gates the heavier entries/lineup drill-down below.
  const storylines = React.useMemo(() => computeWeekStorylines(rows, week - 1), [rows, week]);
  const recapText = summary?.narrativeOverride?.trim() || buildWeeklyRecapText(storylines, summary);

  return (
    <article className="rounded-lg border border-white/20 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-bold text-white">Week {week}</div>
          <div className="text-xs text-green-100/70">{participantCount} entries</div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="rounded-md border border-amber-300/50 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200 hover:bg-amber-400/20"
        >
          {expanded ? "Hide Details" : "Expand"}
        </button>
      </div>

      {summary && summary.prizes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {summary.prizes.map((prize, index) => (
            <span
              key={`${prize.winnerName}-${index}`}
              className="rounded-full border border-amber-300/50 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200"
            >
              🏆 {prize.winnerName}
              {prize.amount != null ? ` — $${prize.amount.toFixed(2)}` : ""}
            </span>
          ))}
        </div>
      )}

      {loading && <div className="mt-2 text-xs text-green-100/70">Loading recap...</div>}
      {!loading && recapText && <p className="mt-2 text-xs italic leading-relaxed text-green-50/90">{recapText}</p>}

      {expanded && loading && <div className="mt-3 text-xs text-green-100/70">Loading week...</div>}

      {expanded && !loading && summary && !summary.hasDkResults && (
        <p className="mt-3 text-xs text-green-100/70">
          No DK results imported for this week yet — once you do, entries, lineups, and player-level highlights will show up here.
        </p>
      )}

      {expanded && summary?.hasDkResults && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {summary.mostRostered && (
              <div className="rounded-md bg-white/5 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-green-100/70">Most Rostered</div>
                <div className="font-semibold text-white">{summary.mostRostered.playerName}</div>
                <div className="text-[11px] text-green-100/70">{summary.mostRostered.value.toFixed(1)}% rostered</div>
              </div>
            )}
            {summary.highestFieldScore && (
              <div className="rounded-md bg-white/5 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-green-100/70">Highest Field Score</div>
                <div className="font-semibold text-white">{summary.highestFieldScore.playerName}</div>
                <div className="text-[11px] text-green-100/70">{summary.highestFieldScore.value.toFixed(1)} pts</div>
              </div>
            )}
            {summary.winningLineupEdge && (
              <div className="rounded-md bg-white/5 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-green-100/70">Winning Lineup Edge</div>
                <div className="font-semibold text-white">{summary.winningLineupEdge.playerName}</div>
                <div className="text-[11px] text-green-100/70">{summary.winningLineupEdge.value.toFixed(1)} pts</div>
              </div>
            )}
            {summary.chalk && (
              <div className="rounded-md bg-white/5 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-green-100/70">Field Chalk</div>
                <div className="font-semibold text-white">{summary.chalk.playerName}</div>
                <div className="text-[11px] text-green-100/70">{summary.chalk.value.toFixed(1)}% rostered</div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-xs">
              <thead>
                <tr className="border-b border-white/20 text-left text-green-100">
                  <th className="py-1 pr-2">Rank</th>
                  <th className="py-1 pr-2">Entry</th>
                  <th className="py-1 pr-2 text-right">Points</th>
                  <th className="py-1 pr-2 text-right">Prize</th>
                  <th className="py-1 text-right">Lineup</th>
                </tr>
              </thead>
              <tbody>
                {summary.entries.map((entry) => (
                  <React.Fragment key={entry.entryName}>
                    <tr className="border-b border-white/10">
                      <td className="py-1 pr-2 font-semibold text-white">{entry.rank ?? "-"}</td>
                      <td className="py-1 pr-2 font-semibold text-green-50">{entry.ownerName}</td>
                      <td className="py-1 pr-2 text-right">{entry.points?.toFixed(2) ?? "—"}</td>
                      <td className="py-1 pr-2 text-right">{entry.prize != null && entry.prize > 0 ? `$${entry.prize.toFixed(2)}` : "—"}</td>
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          onClick={() => setOpenEntry(openEntry === entry.entryName ? null : entry.entryName)}
                          className="rounded border border-white/25 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-green-100 hover:bg-white/20"
                        >
                          {openEntry === entry.entryName ? "Hide Team" : "View Team"}
                        </button>
                      </td>
                    </tr>
                    {openEntry === entry.entryName && (
                      <tr>
                        <td colSpan={5} className="py-2">
                          <EntryLineupPanel season={season} week={week} entryName={entry.entryName} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </article>
  );
}

function WeeklyResultsView({ seasonYear, rows }: { seasonYear: string; rows: SeasonRow[] }) {
  const [weeks, setWeeks] = React.useState<WeeklyResultsListItem[] | null>(null);
  const numericSeason = Number(seasonYear);
  const hasValidSeason = Number.isFinite(numericSeason);

  React.useEffect(() => {
    if (!hasValidSeason) {
      setWeeks([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/weekly-results?season=${numericSeason}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setWeeks(data.weeks ?? []);
      })
      .catch(() => {
        if (!cancelled) setWeeks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [hasValidSeason, numericSeason]);

  if (weeks === null) {
    return <div className="rounded-xl border border-white/25 bg-green-950/65 p-8 text-center text-green-100">Loading weekly results...</div>;
  }

  if (!weeks.length) {
    return (
      <div className="rounded-xl border border-white/25 bg-green-950/65 p-8 text-center">
        <h2 className="text-2xl font-extrabold text-white">No Weekly Results Yet</h2>
        <p className="mt-3 text-green-100">
          Weekly results for this season haven&apos;t been posted yet. Once they are, each week&apos;s entries and lineups will show
          up here — drill into any team to see the players they rostered, DK&apos;s field ownership, and (when available) the
          FantasyPros projection and injury status heading into that game.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {weeks.map((item) => (
        <WeekResultCard key={`${item.season}-${item.week}`} season={item.season} week={item.week} participantCount={item.participantCount} rows={rows} />
      ))}
    </div>
  );
}

/** Per-owner week-by-week log for one season -- Sheet data + posted prizes only, no DK
 *  import dependency (Phase 1, 10 Sep 2026 plan). Reached by clicking an owner's name on
 *  the season Grid. */
function PlayerWeeklyResultsPanel({ ownerName, season, rows, onClose }: { ownerName: string; season: number; rows: SeasonRow[]; onClose: () => void }) {
  const [ownerPrizes, setOwnerPrizes] = React.useState<Array<{ week: number; amount: number | null }> | null>(null);

  React.useEffect(() => {
    if (!Number.isFinite(season)) {
      setOwnerPrizes([]);
      return;
    }
    let cancelled = false;
    setOwnerPrizes(null);
    fetch(`/api/weekly-prizes?season=${season}&owner=${encodeURIComponent(ownerName)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setOwnerPrizes(data.weeks ?? []);
      })
      .catch(() => {
        if (!cancelled) setOwnerPrizes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [season, ownerName]);

  const row = rows.find((r) => r.name === ownerName);
  const prizesByWeek = React.useMemo(() => new Map((ownerPrizes ?? []).map((p) => [p.week, p.amount])), [ownerPrizes]);

  const weeklyEntries = React.useMemo(() => {
    if (!row) return [];
    return row.weeks
      .map((score, index) => ({ week: index + 1, score }))
      .filter((entry) => entry.score > 0)
      .map((entry) => {
        const fieldScores = rows.map((r) => r.weeks[entry.week - 1] ?? 0).filter((s) => s > 0).sort((a, b) => b - a);
        return { ...entry, rank: fieldScores.indexOf(entry.score) + 1, wonAmount: prizesByWeek.get(entry.week) ?? null, won: prizesByWeek.has(entry.week) };
      })
      .reverse();
  }, [row, rows, prizesByWeek]);

  if (!row) return null;

  return (
    <div className="rounded-xl border border-emerald-300/40 bg-black/30 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-200">
          {ownerName} — {season} Weekly Log
        </h3>
        <button type="button" onClick={onClose} className="text-xs text-green-100/70 hover:text-white">
          Close ✕
        </button>
      </div>
      {ownerPrizes === null && <div className="text-xs text-green-100/70">Loading...</div>}
      {ownerPrizes !== null && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-xs">
            <thead>
              <tr className="border-b border-white/20 text-left text-green-100">
                <th className="py-1 pr-2">Week</th>
                <th className="py-1 pr-2 text-right">Score</th>
                <th className="py-1 pr-2 text-right">Rank</th>
                <th className="py-1 text-right">Prize</th>
              </tr>
            </thead>
            <tbody>
              {weeklyEntries.map((entry) => (
                <tr key={entry.week} className="border-b border-white/10">
                  <td className="py-1 pr-2 font-semibold text-white">Week {entry.week}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{entry.score.toFixed(2)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">#{entry.rank}</td>
                  <td className="py-1 text-right">
                    {entry.won ? `🏆${entry.wonAmount != null ? ` $${entry.wonAmount.toFixed(2)}` : ""}` : "—"}
                  </td>
                </tr>
              ))}
              {!weeklyEntries.length && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-green-100/70">
                    No weeks played yet this season.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SeasonGrid({ title, rows, seasonLabel, initialPanel }: { title: string; rows: SeasonRow[]; seasonLabel: string; initialPanel?: "grid" | "statistics" | "results" }) {
  type SeasonPanel = "grid" | "statistics" | "results";
  type DisplayMode = "points" | "rank";
  const totalGridColumns = 23;
  const longestNameChars = React.useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.name.length), 0),
    [rows],
  );
  const rankColWidth = "44px";
  const nameColWidth = `${Math.max((longestNameChars + 2) * 10, 180)}px`;
  const dataColWidth = "36px";

  const [sortColumn, setSortColumn] = React.useState<SortColumn>("total");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [seasonPanel, setSeasonPanel] = React.useState<SeasonPanel>(initialPanel ?? "grid");
  // Belt-and-suspenders alongside the useState initializer above: this component can be
  // reachable via a parent state flip (e.g. "View Week 1 Results" from the preseason empty
  // state) where React's reconciliation doesn't always guarantee the initializer re-runs,
  // so explicitly sync whenever the caller's requested initial panel changes.
  React.useEffect(() => {
    if (initialPanel) setSeasonPanel(initialPanel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPanel]);
  const [selectedOwnerName, setSelectedOwnerName] = React.useState<string | null>(null);
  const [displayMode, setDisplayMode] = React.useState<DisplayMode>("points");
  // null = not checked yet (distinct from a confirmed "no"), so the auto-reset guard below
  // doesn't race the initialPanel="results" jump (fires synchronously on mount, before this
  // effect's fetch has had a chance to resolve).
  const [weeklyResultsAvailable, setWeeklyResultsAvailable] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const numericSeason = Number(seasonLabel);
    if (!Number.isFinite(numericSeason)) {
      setWeeklyResultsAvailable(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/weekly-results?season=${numericSeason}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setWeeklyResultsAvailable((data.weeks ?? []).length > 0);
      })
      .catch(() => {
        if (!cancelled) setWeeklyResultsAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seasonLabel]);

  React.useEffect(() => {
    if (weeklyResultsAvailable === false && seasonPanel === "results") {
      setSeasonPanel("grid");
    }
  }, [weeklyResultsAvailable, seasonPanel]);

  const weekRanksByName = React.useMemo(() => {
    const map = new Map<string, (number | null)[]>();
    rows.forEach((row) => map.set(row.name, Array.from({ length: 18 }, () => null)));

    for (let weekIndex = 0; weekIndex < 18; weekIndex += 1) {
      const ranked = rows
        .map((row) => ({ name: row.name, score: row.weeks[weekIndex] ?? 0 }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.name.localeCompare(b.name);
        });

      ranked.forEach((entry, rankIndex) => {
        const target = map.get(entry.name);
        if (target) target[weekIndex] = rankIndex + 1;
      });
    }

    return map;
  }, [rows]);

  const sortedRows = React.useMemo(() => {
    const nextRows = [...rows];
    nextRows.sort((a, b) => {
      if (sortColumn.startsWith("week-") && displayMode === "rank") {
        const weekIndex = Number.parseInt(sortColumn.replace("week-", ""), 10);
        const aRank = weekRanksByName.get(a.name)?.[weekIndex] ?? 999;
        const bRank = weekRanksByName.get(b.name)?.[weekIndex] ?? 999;
        const numeric = aRank - bRank;
        return sortDirection === "asc" ? numeric : numeric * -1;
      }
      const aValue = getSortValue(a, sortColumn);
      const bValue = getSortValue(b, sortColumn);
      if (typeof aValue === "string" && typeof bValue === "string") {
        const lexical = aValue.localeCompare(bValue);
        return sortDirection === "asc" ? lexical : lexical * -1;
      }
      const numeric = Number(aValue) - Number(bValue);
      return sortDirection === "asc" ? numeric : numeric * -1;
    });
    return nextRows;
  }, [displayMode, rows, sortColumn, sortDirection, weekRanksByName]);

  const weeklyAverages = React.useMemo(() => {
    if (!rows.length) return Array.from({ length: 18 }, () => 0);
    return Array.from({ length: 18 }, (_, index) => {
      // Get non-zero scores for this week
      const nonZeroScores = rows
        .map((row) => row.weeks[index] ?? 0)
        .filter((score) => score !== 0);
      
      // Only calculate average if there's at least one non-zero entry
      if (nonZeroScores.length === 0) return 0;
      
      const total = nonZeroScores.reduce((sum, score) => sum + score, 0);
      return total / nonZeroScores.length;
    });
  }, [rows]);

  const weeklyRankAverages = React.useMemo(() => {
    return Array.from({ length: 18 }, (_, weekIndex) => {
      const ranks = rows
        .map((row) => weekRanksByName.get(row.name)?.[weekIndex] ?? null)
        .filter((value): value is number => value !== null);
      return ranks.length ? mean(ranks) : 0;
    });
  }, [rows, weekRanksByName]);

  const averageTotal = React.useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((sum, row) => sum + row.total, 0) / rows.length;
  }, [rows]);

  const averageAvgWeekly = React.useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((sum, row) => sum + row.avgWeekly, 0) / rows.length;
  }, [rows]);

  const averageTop10Avg = React.useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((sum, row) => sum + row.top10Avg, 0) / rows.length;
  }, [rows]);

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    if (column === "name") {
      setSortDirection("asc");
      return;
    }
    if (column.startsWith("week-") && displayMode === "rank") {
      setSortDirection("asc");
      return;
    }
    setSortDirection("desc");
  };

  const renderSortLabel = (column: SortColumn) => {
    const isActive = sortColumn === column;
    if (!isActive) return " ↕";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  return (
    <section
      className="m-0 flex w-full max-w-full flex-col overflow-hidden rounded-xl border border-white/30 bg-green-950/65 p-0 shadow-xl shadow-black/25 md:h-full"
      style={
        {
          ["--rank-col-width" as string]: rankColWidth,
          ["--name-col-width" as string]: nameColWidth,
          ["--data-col-width" as string]: dataColWidth,
        } as React.CSSProperties
      }
    >
      <div className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/20 bg-green-950/90 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-white md:text-base">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSeasonPanel("grid")}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${seasonPanel === "grid" ? "border-emerald-300 bg-emerald-400/20 text-emerald-100" : "border-white/25 bg-white/10 text-green-100 hover:bg-white/20"}`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setSeasonPanel("statistics")}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${seasonPanel === "statistics" ? "border-emerald-300 bg-emerald-400/20 text-emerald-100" : "border-white/25 bg-white/10 text-green-100 hover:bg-white/20"}`}
          >
            Statistics
          </button>
          {weeklyResultsAvailable && (
            <button
              type="button"
              onClick={() => setSeasonPanel("results")}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${seasonPanel === "results" ? "border-emerald-300 bg-emerald-400/20 text-emerald-100" : "border-white/25 bg-white/10 text-green-100 hover:bg-white/20"}`}
            >
              Weekly Results
            </button>
          )}
          <div className="ml-2 flex items-center gap-1 rounded-md border border-white/25 bg-black/20 p-1">
            <button
              type="button"
              onClick={() => setDisplayMode("points")}
              className={`rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${displayMode === "points" ? "bg-emerald-400/20 text-emerald-100" : "text-green-100 hover:bg-white/15"}`}
            >
              Total Points
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("rank")}
              className={`rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${displayMode === "rank" ? "bg-emerald-400/20 text-emerald-100" : "text-green-100 hover:bg-white/15"}`}
            >
              Week Rank
            </button>
          </div>
          <span className="ml-1 text-sm font-semibold text-green-100">{rows.length} participants</span>
        </div>
      </div>
      {seasonPanel === "grid" && (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Table className="table-fixed w-full max-w-none text-[0.55rem]">
          <TableHeader>
            <TableRow className="h-7 border-b border-white/25 py-0 text-[0.8rem]">
              <TableHead
                className="sticky top-0 z-30 h-7 bg-green-950/95 px-2 py-1 text-left text-[0.78rem]"
                style={{ width: "var(--rank-col-width)", minWidth: "var(--rank-col-width)" }}
              >
                <span className="pl-1">#</span>
              </TableHead>
              <TableHead
                className="sticky top-0 z-30 h-7 border-r border-white/25 bg-green-950/95 px-2 py-1 text-[0.78rem]"
                style={{ width: "var(--name-col-width)", minWidth: "var(--name-col-width)" }}
              >
                <button
                  type="button"
                  onClick={() => handleSort("name")}
                  className="w-full cursor-pointer pl-1 text-left font-semibold text-green-100"
                >
                  Name{renderSortLabel("name")}
                </button>
              </TableHead>
              {Array.from({ length: 18 }, (_, index) => (
                <TableHead
                  key={`week-head-${index + 1}`}
                  className={`sticky top-0 z-30 h-7 bg-green-950/95 py-1 text-center text-[0.8rem] ${index === 0 ? "pl-[2px]" : "px-[1px]"}`}
                  style={{ width: "var(--data-col-width)", minWidth: "var(--data-col-width)" }}
                >
                  <button
                    type="button"
                    onClick={() => handleSort(`week-${index}`)}
                    className="w-full cursor-pointer text-center font-bold text-amber-300"
                  >
                    W{index + 1}
                    {renderSortLabel(`week-${index}`)}
                  </button>
                </TableHead>
              ))}
              <TableHead
                className="sticky top-0 z-30 h-7 bg-green-950/95 px-[1px] py-1 text-center text-[0.78rem]"
                style={{ width: "var(--data-col-width)", minWidth: "var(--data-col-width)" }}
              >
                <button
                  type="button"
                  onClick={() => handleSort("total")}
                  className="w-full cursor-pointer text-center font-semibold text-amber-300"
                >
                  Total{renderSortLabel("total")}
                </button>
              </TableHead>
              <TableHead
                className="sticky top-0 z-30 h-7 bg-green-950/95 px-[1px] py-1 text-center text-[0.78rem]"
                style={{ width: "var(--data-col-width)", minWidth: "var(--data-col-width)" }}
              >
                <button
                  type="button"
                  onClick={() => handleSort("avgWeekly")}
                  title={AVG_WEEKLY_HELP}
                  aria-label={`Avg Weekly. ${AVG_WEEKLY_HELP}`}
                  className="w-full cursor-pointer text-center font-semibold text-amber-300"
                >
                  Avg Weekly*{renderSortLabel("avgWeekly")}
                </button>
              </TableHead>
              <TableHead
                className="sticky top-0 z-30 h-7 bg-green-950/95 px-[1px] py-1 text-center text-[0.78rem]"
                style={{ width: "var(--data-col-width)", minWidth: "var(--data-col-width)" }}
              >
                <button
                  type="button"
                  onClick={() => handleSort("top10Avg")}
                  className="w-full cursor-pointer text-center font-semibold text-amber-300"
                >
                  Top10 Avg{renderSortLabel("top10Avg")}
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row, index) => (
              <TableRow key={row.name} className="h-4 py-0 text-[0.78rem]">
                <TableCell
                  className="h-4 px-2 py-0 text-left text-[0.78rem] font-semibold tabular-nums"
                  style={{ width: "var(--rank-col-width)", minWidth: "var(--rank-col-width)" }}
                >
                  <span className="pl-1">{index + 1}</span>
                </TableCell>
                <TableCell
                  className="h-4 overflow-hidden border-r border-white/20 px-2 py-0 pl-2 text-[0.78rem] font-semibold whitespace-nowrap"
                  style={{ width: "var(--name-col-width)", minWidth: "var(--name-col-width)" }}
                  title={row.name}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedOwnerName((prev) => (prev === row.name ? null : row.name))}
                    className="block max-w-full whitespace-nowrap pl-1 text-left underline decoration-dotted underline-offset-2 hover:text-emerald-200"
                  >
                    {row.name}
                  </button>
                </TableCell>
                {row.weeks.map((score, index) => (
                  <TableCell
                    key={`${row.name}-week-${index + 1}`}
                    className={`${row.top10WeekIndexes.includes(index) ? "bg-emerald-300/35 text-emerald-50 font-bold shadow-[inset_0_0_0_1px_rgba(16,185,129,0.55)] " : ""}h-4 py-0 text-center text-[0.78rem] ${index === 0 ? "pl-[2px]" : "px-[1px]"}`}
                    style={{ width: "var(--data-col-width)", minWidth: "var(--data-col-width)" }}
                  >
                    {displayMode === "points" ? formatCell(score) : (weekRanksByName.get(row.name)?.[index] ?? "-")}
                  </TableCell>
                ))}
                <TableCell className="h-4 px-[1px] py-0 text-center text-[0.78rem] font-semibold" style={{ width: "var(--data-col-width)", minWidth: "var(--data-col-width)" }}>
                  {formatCell(row.total)}
                </TableCell>
                <TableCell className="h-4 px-[1px] py-0 text-center text-[0.78rem]" style={{ width: "var(--data-col-width)", minWidth: "var(--data-col-width)" }}>
                  {formatCell(row.avgWeekly)}
                </TableCell>
                <TableCell className="h-4 px-[1px] py-0 text-center text-[0.78rem]" style={{ width: "var(--data-col-width)", minWidth: "var(--data-col-width)" }}>
                  {formatCell(row.top10Avg)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="h-4 bg-emerald-900/45 py-0 text-[0.78rem]">
              <TableCell
                className="h-4 px-2 py-0 text-left text-[0.78rem] font-bold tabular-nums"
                style={{ width: "var(--rank-col-width)", minWidth: "var(--rank-col-width)" }}
              >
                <span className="pl-1">-</span>
              </TableCell>
              <TableCell
                className="h-4 overflow-hidden border-r border-white/20 px-2 py-0 text-[0.78rem] font-bold whitespace-nowrap"
                style={{ width: "var(--name-col-width)", minWidth: "var(--name-col-width)" }}
              >
                <span className="block max-w-full whitespace-nowrap pl-1">
                  {displayMode === "points" ? "Weekly Avg" : "Weekly Avg Rank"}
                </span>
              </TableCell>
              {(displayMode === "points" ? weeklyAverages : weeklyRankAverages).map((score, index) => (
                <TableCell
                  key={`weekly-average-${index + 1}`}
                  className={`h-4 py-0 text-center text-[0.78rem] font-semibold ${index === 0 ? "pl-[2px]" : "px-[1px]"}`}
                  style={{ width: "var(--data-col-width)", minWidth: "var(--data-col-width)" }}
                >
                  {formatCell(score)}
                </TableCell>
              ))}
              <TableCell className="h-4 px-[1px] py-0 text-center text-[0.78rem] font-bold" style={{ width: "var(--data-col-width)", minWidth: "var(--data-col-width)" }}>
                {formatCell(averageTotal)}
              </TableCell>
              <TableCell className="h-4 px-[1px] py-0 text-center text-[0.78rem] font-bold" style={{ width: "var(--data-col-width)", minWidth: "var(--data-col-width)" }}>
                {formatCell(averageAvgWeekly)}
              </TableCell>
              <TableCell className="h-4 px-[1px] py-0 text-center text-[0.78rem] font-bold" style={{ width: "var(--data-col-width)", minWidth: "var(--data-col-width)" }}>
                {formatCell(averageTop10Avg)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      )}
      {seasonPanel === "grid" && (
        <div className="space-y-1 px-3 pb-2 text-[0.6rem] text-green-100/80">
          <div>Sorted by {getColumnLabel(sortColumn)} ({sortDirection})</div>
          <div>* {AVG_WEEKLY_HELP}</div>
        </div>
      )}
      {seasonPanel === "grid" && selectedOwnerName && (
        <div className="px-3 pb-3">
          <PlayerWeeklyResultsPanel
            ownerName={selectedOwnerName}
            season={Number(seasonLabel)}
            rows={rows}
            onClose={() => setSelectedOwnerName(null)}
          />
        </div>
      )}
      {seasonPanel === "statistics" && (
        <div className="p-3">
          <StatisticsView rows={rows} seasonLabel={seasonLabel} />
        </div>
      )}
      {seasonPanel === "results" && (
        <div className="max-h-[calc(100vh-7rem)] overflow-y-auto p-3">
          <WeeklyResultsView seasonYear={seasonLabel} rows={rows} />
        </div>
      )}
    </section>
  );
}

const MY_NAME_KEY = "dfs_v1_my_name";
const IDENTITY_DISMISSED_KEY = "dfs_v1_identity_dismissed";

function seasonHasStarted(rows: SeasonRow[]): boolean {
  return rows.some((row) => row.weeks.some((score) => score > 0));
}

function PreseasonEmptyState({
  currentSeasonYear,
  previousYear,
  onViewPrevious,
  onViewCareer,
  onViewResults,
}: {
  currentSeasonYear: string | null;
  previousYear: string | null;
  onViewPrevious: () => void;
  onViewCareer: () => void;
  onViewResults?: () => void;
}) {
  // The Grid/Statistics tabs are driven by the Google Sheet's weekly totals, which can lag
  // behind real DK results (e.g. a week imported before its Sheet score is entered) -- this
  // checks the independent Weekly Results data source so real, already-imported weeks
  // aren't hidden behind the "hasn't started" banner just because the Sheet isn't caught up.
  const [hasWeeklyResults, setHasWeeklyResults] = React.useState(false);

  React.useEffect(() => {
    if (!currentSeasonYear || !Number.isFinite(Number(currentSeasonYear))) return;
    let cancelled = false;
    fetch(`/api/weekly-results?season=${Number(currentSeasonYear)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setHasWeeklyResults((data.weeks ?? []).length > 0);
      })
      .catch(() => {
        if (!cancelled) setHasWeeklyResults(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentSeasonYear]);

  return (
    <div className="rounded-xl border border-white/25 bg-green-950/65 p-8 text-center">
      <h2 className="text-2xl font-extrabold text-white">{currentSeasonYear ?? "This"} Season Hasn&apos;t Started Yet</h2>
      <p className="mt-3 text-green-100">Scores will show up here once Week 1 games are played.</p>
      {hasWeeklyResults && (
        <p className="mt-2 text-sm text-emerald-200">
          Week 1 results are in, though — the season grid updates once the Google Sheet has this week&apos;s scores.
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {hasWeeklyResults && onViewResults && (
          <button
            type="button"
            onClick={onViewResults}
            className="rounded-md border border-emerald-300 bg-emerald-400/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/30"
          >
            View Week 1 Results
          </button>
        )}
        {previousYear && (
          <>
            <button
              type="button"
              onClick={onViewPrevious}
              className="rounded-md border border-emerald-300 bg-emerald-400/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/30"
            >
              View {previousYear} Instead
            </button>
            <button
              type="button"
              onClick={onViewCareer}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-green-100 transition hover:bg-white/20"
            >
              All-Time Stats
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function buildWeeklyRankMaps(rows: SeasonRow[], activeWeeks: number[]): Map<string, number>[] {
  return activeWeeks.map((weekIndex) => {
    const map = new Map<string, number>();
    const ranked = rows
      .map((row) => ({ name: row.name, score: row.weeks[weekIndex] ?? 0 }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.name.localeCompare(b.name)));
    ranked.forEach((entry, index) => map.set(entry.name, index + 1));
    return map;
  });
}

function buildWeeklyMedians(rows: SeasonRow[], activeWeeks: number[]): number[] {
  return activeWeeks.map((weekIndex) => {
    const scores = rows
      .map((row) => row.weeks[weekIndex] ?? 0)
      .filter((score) => score > 0)
      .sort((a, b) => a - b);
    if (!scores.length) return 0;
    const mid = Math.floor(scores.length / 2);
    return scores.length % 2 === 1 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2;
  });
}

/** Weeks finished in the top 10, and the current active streak of weeks beating the field
 *  median — cheap "badges" computed entirely from data already on the page. */
function computeBadges(rows: SeasonRow[], name: string): { weeksInTop10: number; streak: number } {
  const activeWeeks = Array.from(
    { length: rows.reduce((max, row) => Math.max(max, row.weeks.filter((s) => s > 0).length), 0) },
    (_, i) => i,
  );
  if (!activeWeeks.length) return { weeksInTop10: 0, streak: 0 };
  const rankMaps = buildWeeklyRankMaps(rows, activeWeeks);
  const medians = buildWeeklyMedians(rows, activeWeeks);
  const row = rows.find((r) => r.name === name);
  if (!row) return { weeksInTop10: 0, streak: 0 };

  const weeksInTop10 = activeWeeks.filter((weekIndex) => (rankMaps[weekIndex].get(name) ?? 999) <= 10).length;

  let streak = 0;
  for (let i = activeWeeks.length - 1; i >= 0; i -= 1) {
    const weekIndex = activeWeeks[i];
    const score = row.weeks[weekIndex] ?? 0;
    if (score <= 0) break;
    if (score > (medians[weekIndex] ?? 0)) {
      streak += 1;
    } else {
      break;
    }
  }

  return { weeksInTop10, streak };
}

function findBestWeekEver(seasons: Record<string, SeasonRow[]>, name: string): { year: string; week: number; score: number } | null {
  let best: { year: string; week: number; score: number } | null = null;
  for (const [year, rows] of Object.entries(seasons)) {
    const row = rows.find((r) => r.name === name);
    if (!row) continue;
    row.weeks.forEach((score, index) => {
      if (score > 0 && (!best || score > best.score)) {
        best = { year, week: index + 1, score };
      }
    });
  }
  return best;
}

function MyTeamBanner({
  currentRows,
  allSeasons,
  currentSeasonYear,
  myName,
  onSetName,
}: {
  currentRows: SeasonRow[];
  allSeasons: Record<string, SeasonRow[]>;
  currentSeasonYear: string | null;
  myName: string | null;
  onSetName: (name: string | null) => void;
}) {
  const [dismissed, setDismissed] = React.useState(true);
  const [picking, setPicking] = React.useState(false);

  React.useEffect(() => {
    setDismissed(window.localStorage.getItem(IDENTITY_DISMISSED_KEY) === "1");
  }, []);

  const allKnownNames = React.useMemo(() => {
    const names = new Set<string>();
    Object.values(allSeasons).forEach((rows) => rows.forEach((row) => names.add(row.name)));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allSeasons]);

  if (!myName) {
    if (dismissed && !picking) return null;
    return (
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300/40 bg-emerald-400/10 px-4 py-3">
        <span className="text-sm font-semibold text-emerald-100">👋 Which team is yours?</span>
        <select
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) onSetName(event.target.value);
          }}
          className="rounded-md border border-white/25 bg-green-950/90 px-2 py-1.5 text-sm text-green-100"
        >
          <option value="" disabled>
            Choose your name...
          </option>
          {allKnownNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            setPicking(false);
            window.localStorage.setItem(IDENTITY_DISMISSED_KEY, "1");
          }}
          className="ml-auto text-xs font-semibold text-green-100/70 hover:text-green-100"
        >
          Not now
        </button>
      </div>
    );
  }

  const hasStarted = seasonHasStarted(currentRows);
  const sorted = [...currentRows].sort((a, b) => b.total - a.total);
  const myIndex = sorted.findIndex((row) => row.name === myName);
  const bestWeek = findBestWeekEver(allSeasons, myName);
  const badges = computeBadges(currentRows, myName);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-emerald-300/40 bg-emerald-400/10 px-4 py-3 text-sm">
      <span className="font-bold text-white">👋 {myName}</span>
      {hasStarted && myIndex >= 0 ? (
        myIndex === 0 ? (
          <span className="font-semibold text-emerald-100">You&apos;re in 1st place! 🏆</span>
        ) : (
          <span className="font-semibold text-emerald-100">
            #{myIndex + 1} — {(sorted[myIndex - 1].total - sorted[myIndex].total).toFixed(2)} pts behind {sorted[myIndex - 1].name} for #{myIndex}
          </span>
        )
      ) : (
        <span className="text-green-100/80">
          {currentSeasonYear ?? "This"} season hasn&apos;t kicked off yet — check back once Week 1 scores are in.
        </span>
      )}
      {hasStarted && badges.streak >= 2 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-amber-200">🔥 {badges.streak}-week streak</span>}
      {hasStarted && badges.weeksInTop10 > 0 && (
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-amber-200">
          🏅 {badges.weeksInTop10} week{badges.weeksInTop10 === 1 ? "" : "s"} in Top 10
        </span>
      )}
      {bestWeek && (
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-green-100/80">
          Best week ever: {bestWeek.score.toFixed(2)} ({bestWeek.year} Wk {bestWeek.week})
        </span>
      )}
      <button type="button" onClick={() => onSetName(null)} className="ml-auto text-xs font-semibold text-green-100/70 hover:text-green-100">
        Not you?
      </button>
    </div>
  );
}

type WeekStorylines = {
  high: { name: string; score: number };
  low: { name: string; score: number };
  closestMargin: { a: string; b: string; gap: number } | null;
  mover: { name: string; delta: number } | null;
};

/** Owner-level highlights for one specific week (high/low score, closest margin between
 *  two owners, biggest rank riser/faller vs. the prior week) -- pure Sheet-data math, no DK
 *  import needed. Originally only ever computed for the latest week (WeeklyStorylines);
 *  generalized so the Weekly Results page's per-week recap can use it for any past week too. */
function computeWeekStorylines(rows: SeasonRow[], weekIndex: number): WeekStorylines | null {
  if (weekIndex < 0) return null;
  const played = rows
    .map((row) => ({ name: row.name, score: row.weeks[weekIndex] ?? 0 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!played.length) return null;

  const high = played[0];
  const low = played[played.length - 1];
  let closestMargin: { a: string; b: string; gap: number } | null = null;
  for (let i = 0; i < played.length - 1; i += 1) {
    const gap = played[i].score - played[i + 1].score;
    if (!closestMargin || gap < closestMargin.gap) {
      closestMargin = { a: played[i].name, b: played[i + 1].name, gap };
    }
  }

  const mover = ((): { name: string; delta: number } | null => {
    if (weekIndex <= 0) return null;
    const [prevRanks, curRanks] = buildWeeklyRankMaps(rows, [weekIndex - 1, weekIndex]);
    const candidates: Array<{ name: string; delta: number }> = [];
    curRanks.forEach((curRank, name) => {
      const prevRank = prevRanks.get(name);
      if (prevRank == null) return;
      candidates.push({ name, delta: prevRank - curRank }); // positive = moved up
    });
    if (!candidates.length) return null;
    return candidates.reduce((best, entry) => (entry.delta > best.delta ? entry : best));
  })();

  return { high, low, closestMargin, mover };
}

/** Assembles the Weekly Results page's small recap paragraph from whatever's available for
 *  that week -- owner-side facts (Sheet data, always there once the week's scores are in)
 *  and, once a DK results CSV has been imported for that week, impact-player facts too.
 *  Deterministic templates, no AI call, consistent with the rest of the site's stats. */
function buildWeeklyRecapText(storylines: WeekStorylines | null, summary: WeeklyResultsSummary | null): string | null {
  const sentences: string[] = [];

  if (storylines) {
    sentences.push(
      `${storylines.high.name} posted the week's top score at ${storylines.high.score.toFixed(2)}, while ${storylines.low.name} brought up the rear at ${storylines.low.score.toFixed(2)}.`,
    );
    if (storylines.closestMargin) {
      sentences.push(
        `${storylines.closestMargin.a} narrowly edged ${storylines.closestMargin.b} by just ${storylines.closestMargin.gap.toFixed(2)} points.`,
      );
    }
    if (storylines.mover && storylines.mover.delta !== 0) {
      const verb = storylines.mover.delta > 0 ? "jumped" : "dropped";
      const spots = Math.abs(storylines.mover.delta);
      sentences.push(`${storylines.mover.name} was the week's biggest mover, ${verb} ${spots} spot${spots === 1 ? "" : "s"} in the standings.`);
    }
  }

  if (summary?.hasDkResults) {
    if (summary.highestFieldScore) {
      sentences.push(`On the player side, ${summary.highestFieldScore.playerName} led all rosters with ${summary.highestFieldScore.value.toFixed(1)} points.`);
    }
    if (summary.differentiator && summary.differentiator.playerName !== summary.highestFieldScore?.playerName) {
      sentences.push(`${summary.differentiator.playerName} was the week's differentiator — a big game that few in the field had.`);
    }
    if (summary.mostRostered) {
      sentences.push(`${summary.mostRostered.playerName} was the most popular roster spot at ${summary.mostRostered.value.toFixed(1)}% owned.`);
    }
  }

  return sentences.length ? sentences.join(" ") : null;
}

function WeeklyStorylines({ rows, seasonLabel }: { rows: SeasonRow[]; seasonLabel: string }) {
  const activeWeeks = React.useMemo(
    () => Array.from({ length: rows.reduce((max, row) => Math.max(max, row.weeks.filter((s) => s > 0).length), 0) }, (_, i) => i),
    [rows],
  );
  const latestWeek = activeWeeks.length ? activeWeeks[activeWeeks.length - 1] : -1;

  const storylines = React.useMemo(() => computeWeekStorylines(rows, latestWeek), [latestWeek, rows]);

  if (!storylines) return null;

  return (
    <div className="mb-3 rounded-xl border border-white/20 bg-black/20 px-4 py-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-green-100">
        Week {latestWeek + 1} Storylines — {seasonLabel}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-green-50">
        <span>
          💰 High score: <strong className="text-white">{storylines.high.name}</strong> ({storylines.high.score.toFixed(2)})
        </span>
        <span>
          🥶 Low score: <strong className="text-white">{storylines.low.name}</strong> ({storylines.low.score.toFixed(2)})
        </span>
        {storylines.closestMargin && (
          <span>
            🤏 Closest margin: <strong className="text-white">{storylines.closestMargin.a}</strong> over{" "}
            <strong className="text-white">{storylines.closestMargin.b}</strong> by {storylines.closestMargin.gap.toFixed(2)}
          </span>
        )}
        {storylines.mover && storylines.mover.delta !== 0 && (
          <span>
            {storylines.mover.delta > 0 ? "🔥" : "📉"} Biggest {storylines.mover.delta > 0 ? "riser" : "faller"}:{" "}
            <strong className="text-white">{storylines.mover.name}</strong> ({formatSigned(storylines.mover.delta)} spots)
          </span>
        )}
      </div>
    </div>
  );
}

export function DFSApp({ data }: { data: LeagueData }) {
  const [view, setView] = React.useState<View>("current");
  const [selectedYear, setSelectedYear] = React.useState<string | null>(null);
  const [forceCurrentResults, setForceCurrentResults] = React.useState(false);
  
  // Mobile/Desktop layout state
  const [layoutPreference, setLayoutPreference] = React.useState<LayoutPreference>("auto");
  const [isDesktopByViewport, setIsDesktopByViewport] = React.useState<boolean | undefined>(undefined);
  const [mobileTab, setMobileTab] = React.useState<MobileTab>("home");
  const [mobileSelectedWeek, setMobileSelectedWeek] = React.useState<number>(-1); // -1 = latest week with data
  const [mounted, setMounted] = React.useState(false);
  const [myName, setMyNameState] = React.useState<string | null>(null);
  const [bannersCollapsed, setBannersCollapsedState] = React.useState(false);

  const setMyName = React.useCallback((name: string | null) => {
    setMyNameState(name);
    if (name) {
      window.localStorage.setItem(MY_NAME_KEY, name);
      window.localStorage.removeItem(IDENTITY_DISMISSED_KEY);
    } else {
      window.localStorage.removeItem(MY_NAME_KEY);
    }
  }, []);

  const setBannersCollapsed = React.useCallback((collapsed: boolean) => {
    setBannersCollapsedState(collapsed);
    window.localStorage.setItem(BANNERS_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, []);

  React.useEffect(() => {
    const saved = window.localStorage.getItem(MY_NAME_KEY);
    if (saved) setMyNameState(saved);
    setBannersCollapsedState(window.localStorage.getItem(BANNERS_COLLAPSED_KEY) === "1");
  }, []);

  // Detect viewport size and load saved preference
  React.useEffect(() => {
    setMounted(true);
    const saved = window.localStorage.getItem(LAYOUT_PREF_KEY);
    if (saved === "mobile" || saved === "desktop" || saved === "auto") {
      setLayoutPreference(saved);
    }
    
    const checkViewport = () => setIsDesktopByViewport(window.innerWidth >= 1024);
    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;
    const forcedView = new URLSearchParams(window.location.search).get("view");
    if (forcedView === "mobile" || forcedView === "desktop" || forcedView === "auto") {
      setLayoutPreference(forcedView);
    }
  }, [mounted]);

  React.useEffect(() => {
    window.localStorage.setItem(LAYOUT_PREF_KEY, layoutPreference);
  }, [layoutPreference]);

  // Only show desktop view after mount and when explicitly desktop
  const isDesktopView = mounted && (layoutPreference === "desktop" || (layoutPreference === "auto" && isDesktopByViewport === true));
  const isMobileView = !isDesktopView;

  const currentRows = data.currentSeasonYear ? data.seasons[data.currentSeasonYear] ?? [] : [];
  const previousRows = selectedYear ? data.seasons[selectedYear] ?? [] : [];
  
  const displayRows = view === "previous" ? previousRows : currentRows;
  const displaySeason = view === "previous" ? selectedYear : data.currentSeasonYear;
  const participantCount = displayRows.length;
  
  // Find latest week with any data for mobile leaderboard
  const latestWeekWithData = React.useMemo(() => {
    if (!displayRows.length) return 0;
    let latest = 0;
    for (const row of displayRows) {
      for (let w = 0; w < row.weeks.length; w++) {
        if (row.weeks[w] > 0) latest = Math.max(latest, w);
      }
    }
    return latest;
  }, [displayRows]);
  
  // Active week to display: user selected or latest with data
  const activeWeek = mobileSelectedWeek === -1 ? latestWeekWithData : mobileSelectedWeek;
  const duesPerParticipantRaw = Number.parseFloat(process.env.NEXT_PUBLIC_DUES_PER_PARTICIPANT ?? "0");
  const duesPerParticipant = Number.isFinite(duesPerParticipantRaw) && duesPerParticipantRaw > 0 ? duesPerParticipantRaw : 0;
  const poolTotal = participantCount * duesPerParticipant;
  const poolLabel =
    duesPerParticipant > 0
      ? `${formatCurrency(poolTotal)} pool (${formatCurrency(duesPerParticipant)} dues)`
      : "Pool TBD (set NEXT_PUBLIC_DUES_PER_PARTICIPANT)";
  React.useEffect(() => {
    const savedView = getCookie(NAV_COOKIE);
    const savedSeason = getCookie(SEASON_COOKIE);

    if (savedView === "current" || savedView === "previous") {
      setView(savedView);
      if (savedSeason && data.previousYears.includes(savedSeason)) {
        setSelectedYear(savedSeason);
      }
      return;
    }

    // No saved preference yet: if the current season has no real scores in it (preseason),
    // default to the most recent previous season's final standings instead of a wall of
    // zeros — same real data, much better first impression for a fresh visitor.
    if (!seasonHasStarted(currentRows) && data.previousYears.length) {
      setSelectedYear(data.previousYears[0]);
      setView("previous");
      return;
    }

    if (savedSeason && data.previousYears.includes(savedSeason)) {
      setSelectedYear(savedSeason);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.previousYears]);

  React.useEffect(() => {
    setCookie(NAV_COOKIE, view);
  }, [view]);

  React.useEffect(() => {
    if (selectedYear) {
      setCookie(SEASON_COOKIE, selectedYear);
    }
  }, [selectedYear]);

  return (
    <div className="gridiron-bg m-0 flex h-screen flex-col p-0 text-white md:overflow-hidden">
      <header className="fixed top-0 right-0 left-0 z-40 flex h-20 w-full items-center justify-between gap-4 border-b border-white/25 bg-green-950/85 px-4 backdrop-blur-sm md:px-6">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <Image
            src="/dfs-league-logo.png"
            alt="DFS League logo"
            width={64}
            height={64}
            className="h-12 w-12 rounded-xl object-contain md:h-14 md:w-14"
            priority
          />
          <h1 className="truncate text-lg font-bold tracking-wide md:text-2xl">DFS League</h1>
        </div>

        <nav className="hidden items-center gap-2 lg:flex">
          <Link
            href="/"
            className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-green-50 transition hover:bg-white/20"
          >
            DFS League News
          </Link>
          <button
            type="button"
            onClick={() => setView("current")}
            className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-green-50 transition hover:bg-white/20"
          >
            Current Year
          </button>
          <button
            type="button"
            onClick={() => setView("career")}
            className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${view === "career" ? "border-emerald-300 bg-emerald-400/20 text-emerald-100" : "border-white/25 bg-white/10 text-green-50 hover:bg-white/20"}`}
          >
            All-Time Stats
          </button>

          <details className="group relative">
            <summary className="cursor-pointer list-none rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-green-50 transition hover:bg-white/20 [&::-webkit-details-marker]:hidden">
              Previous Years
            </summary>
            <div className="absolute top-full left-0 mt-2 min-w-56 rounded-md border border-white/20 bg-green-950/95 p-2 shadow-xl">
              {data.currentSeasonYear && (
                <button
                  type="button"
                  onClick={(event) => {
                    setView("current");
                    const parent = event.currentTarget.closest("details");
                    if (parent) parent.removeAttribute("open");
                  }}
                  className="block w-full rounded px-3 py-2 text-left text-sm text-green-100 transition hover:bg-white/15"
                >
                  {data.currentSeasonYear} (Current)
                </button>
              )}
              {data.previousYears.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={(event) => {
                    setSelectedYear(year);
                    setView("previous");
                    const parent = event.currentTarget.closest("details");
                    if (parent) parent.removeAttribute("open");
                  }}
                  className="block w-full rounded px-3 py-2 text-left text-sm text-green-100 transition hover:bg-white/15"
                >
                  {year}
                </button>
              ))}
            </div>
          </details>
        </nav>

        {/* Mobile/Desktop Toggle Buttons - desktop only */}
        <div className="hidden lg:flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLayoutPreference("mobile")}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
              isMobileView 
                ? "border-green-400 bg-green-600 text-white" 
                : "border-white/25 bg-white/10 text-green-50 hover:bg-white/20"
            }`}
          >
            Mobile
          </button>
          <button
            type="button"
            onClick={() => setLayoutPreference("desktop")}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
              isDesktopView 
                ? "border-green-400 bg-green-600 text-white" 
                : "border-white/25 bg-white/10 text-green-50 hover:bg-white/20"
            }`}
          >
            Desktop
          </button>
        </div>

        <div className="text-right text-xs font-semibold text-green-100 md:text-sm">
          <div>{data.currentSeasonYear ?? "Season"} | {participantCount} participants</div>
          <div>{poolLabel}</div>
        </div>
      </header>

      <div className="relative m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-0 pt-20">

        {/* Desktop-only main content - hidden on mobile */}
        {!isMobileView && (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 md:p-3">
          {view === "previous" && !seasonHasStarted(currentRows) && selectedYear === data.previousYears[0] && (
            <div className="mb-3 rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-100">
              🏈 {data.currentSeasonYear} season hasn&apos;t kicked off yet — showing how {selectedYear} finished.{" "}
              <button type="button" onClick={() => setView("current")} className="underline hover:text-white">
                View {data.currentSeasonYear} grid instead
              </button>
            </div>
          )}

          {view !== "career" && (
            <button
              type="button"
              onClick={() => setBannersCollapsed(!bannersCollapsed)}
              className="mb-2 flex w-full items-center justify-between rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-green-100/70 transition hover:bg-white/10"
            >
              <span>{bannersCollapsed ? "Show Personalized Banners" : "Hide Personalized Banners"}</span>
              <span>{bannersCollapsed ? "▸" : "▾"}</span>
            </button>
          )}

          {view !== "career" && !bannersCollapsed && (
            <MyTeamBanner
              currentRows={currentRows}
              allSeasons={data.seasons}
              currentSeasonYear={data.currentSeasonYear}
              myName={myName}
              onSetName={setMyName}
            />
          )}

          {view === "current" && !seasonHasStarted(currentRows) && !forceCurrentResults && (
            <PreseasonEmptyState
              currentSeasonYear={data.currentSeasonYear}
              previousYear={data.previousYears[0] ?? null}
              onViewPrevious={() => { setSelectedYear(data.previousYears[0]); setView("previous"); }}
              onViewCareer={() => setView("career")}
              onViewResults={() => setForceCurrentResults(true)}
            />
          )}

          {view === "current" && (seasonHasStarted(currentRows) || forceCurrentResults) && (
            <>
              {!bannersCollapsed && seasonHasStarted(currentRows) && <WeeklyStorylines rows={currentRows} seasonLabel={data.currentSeasonYear ?? "Current Season"} />}
              <SeasonGrid
                title={`Current Weekly Season Grid (${data.currentSeasonYear ?? ""})`}
                rows={currentRows}
                seasonLabel={data.currentSeasonYear ?? "Current Season"}
                initialPanel={!seasonHasStarted(currentRows) && forceCurrentResults ? "results" : "grid"}
              />
            </>
          )}

          {view === "previous" && selectedYear && (
            <>
              {!bannersCollapsed && <WeeklyStorylines rows={previousRows} seasonLabel={selectedYear} />}
              <SeasonGrid
                title={`Previous Season Grid (${selectedYear})`}
                rows={previousRows}
                seasonLabel={selectedYear}
              />
            </>
          )}

          {view === "career" && <CareerStatsView allSeasons={data.seasons} />}
        </main>
        )}

        {/* Mobile Tab Content */}
        {isMobileView && (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-28 pt-4">
            {/* Season/Week Context Header - Left/Right tap for week nav */}
            <div className="mb-4 rounded-xl bg-green-800/50 p-2">
              {/* Year Selector */}
              <div className="mb-2 flex justify-center gap-2">
                {[data.currentSeasonYear, ...data.previousYears].map((year) => {
                  const isCurrentYear = view === "current" && year === data.currentSeasonYear;
                  const isSelectedPreviousYear = view === "previous" && selectedYear === year;
                  const isHighlighted = isCurrentYear || isSelectedPreviousYear;
                  
                  return (
                    <button
                      key={year}
                      type="button"
                      onClick={() => {
                        // When switching years, default to week 1
                        const weeksWithData: number[] = [];
                        for (let w = 0; w < 18; w++) {
                          if (year === data.currentSeasonYear ? 
                            currentRows.some(r => (r.weeks[w] || 0) > 0) :
                            previousRows.some(r => (r.weeks[w] || 0) > 0)) {
                            weeksWithData.push(w);
                          }
                        }
                        // Set to week 1 (index 0) if available, otherwise latest
                        const defaultWeek = weeksWithData.includes(0) ? 0 : (weeksWithData[0] ?? 0);
                        setMobileSelectedWeek(defaultWeek);
                        
                        if (year === data.currentSeasonYear) {
                          setView("current");
                        } else {
                          setSelectedYear(year);
                          setView("previous");
                        }
                      }}
                      className={`rounded-lg px-3 py-1 text-sm font-semibold transition ${
                        isHighlighted
                          ? "bg-green-500 text-white"
                          : "bg-white/10 text-green-200 hover:bg-white/20"
                      }`}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>
              
              {/* Week Nav - Left/Right taps */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    const weeksWithData: number[] = [];
                    for (let w = 0; w < 18; w++) {
                      if (displayRows.some(r => (r.weeks[w] || 0) > 0)) weeksWithData.push(w);
                    }
                    if (weeksWithData.length === 0) return;
                    const currentIdx = weeksWithData.indexOf(activeWeek);
                    const prevIdx = currentIdx <= 0 ? weeksWithData.length - 1 : currentIdx - 1;
                    setMobileSelectedWeek(weeksWithData[prevIdx]);
                  }}
                  className="flex-1 py-2 text-left text-green-200 hover:text-white"
                >
                  ← Prev
                </button>
                
                <div className="text-center">
                  <div className="text-lg font-bold text-white">Week {activeWeek + 1}</div>
                  <div className="text-xs text-green-200">{displaySeason} Season</div>
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    const weeksWithData: number[] = [];
                    for (let w = 0; w < 18; w++) {
                      if (displayRows.some(r => (r.weeks[w] || 0) > 0)) weeksWithData.push(w);
                    }
                    if (weeksWithData.length === 0) return;
                    const currentIdx = weeksWithData.indexOf(activeWeek);
                    const nextIdx = (currentIdx + 1) % weeksWithData.length;
                    setMobileSelectedWeek(weeksWithData[nextIdx]);
                  }}
                  className="flex-1 py-2 text-right text-green-200 hover:text-white"
                >
                  Next →
                </button>
              </div>
            </div>
            
            {/* Home Tab - Quick Stats & Leaderboard */}
            {mobileTab === "home" && (
              <div className="space-y-4">
                {view === "previous" && !seasonHasStarted(currentRows) && selectedYear === data.previousYears[0] && (
                  <div className="rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-100">
                    🏈 {data.currentSeasonYear} season hasn&apos;t kicked off yet — showing how {selectedYear} finished.
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setBannersCollapsed(!bannersCollapsed)}
                  className="flex w-full items-center justify-between rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-green-100/70 transition hover:bg-white/10"
                >
                  <span>{bannersCollapsed ? "Show Personalized Banners" : "Hide Personalized Banners"}</span>
                  <span>{bannersCollapsed ? "▸" : "▾"}</span>
                </button>
                {!bannersCollapsed && (
                  <MyTeamBanner
                    currentRows={currentRows}
                    allSeasons={data.seasons}
                    currentSeasonYear={data.currentSeasonYear}
                    myName={myName}
                    onSetName={setMyName}
                  />
                )}
                {view === "current" && !seasonHasStarted(currentRows) ? (
                  <PreseasonEmptyState
                    currentSeasonYear={data.currentSeasonYear}
                    previousYear={data.previousYears[0] ?? null}
                    onViewPrevious={() => { setSelectedYear(data.previousYears[0]); setView("previous"); }}
                    onViewCareer={() => { setView("career"); setMobileTab("stats"); }}
                  />
                ) : (
                  <>
                    {!bannersCollapsed && <WeeklyStorylines rows={displayRows} seasonLabel={displaySeason ?? "Season"} />}
                    <div className="rounded-xl bg-green-900/40 p-4">
                      <h3 className="mb-3 text-lg font-bold text-white">Week {activeWeek + 1} Leaders</h3>
                      <div className="space-y-2 pr-1">
                        {displayRows
                          .slice()
                          .sort((a, b) => (b.weeks[activeWeek] || 0) - (a.weeks[activeWeek] || 0))
                          .map((row, i) => (
                          <div key={row.name} className="flex items-center justify-between rounded-lg bg-white/5 p-2">
                            <div className="flex items-center gap-2">
                              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                i === 0 ? "bg-yellow-500 text-black" : i === 1 ? "bg-gray-400 text-black" : i === 2 ? "bg-orange-600 text-white" : "bg-white/20 text-white"
                              }`}>{i + 1}</span>
                              <span className="text-sm font-medium text-green-50">{row.name}</span>
                            </div>
                            <span className="font-mono text-sm font-bold text-green-400">{row.weeks[activeWeek] || 0} pts</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => { setMobileTab("stats"); }}
                      className="w-full rounded-xl bg-green-600 py-3 font-bold text-white transition hover:bg-green-500"
                    >
                      View Full Stats →
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Stats Tab - Card Grid */}
            {mobileTab === "stats" && view === "career" && (
              <CareerStatsView allSeasons={data.seasons} />
            )}

            {mobileTab === "stats" && view === "current" && !seasonHasStarted(currentRows) && (
              <PreseasonEmptyState
                currentSeasonYear={data.currentSeasonYear}
                previousYear={data.previousYears[0] ?? null}
                onViewPrevious={() => { setSelectedYear(data.previousYears[0]); setView("previous"); }}
                onViewCareer={() => setView("career")}
              />
            )}

            {mobileTab === "stats" && view !== "career" && !(view === "current" && !seasonHasStarted(currentRows)) && (
              <div className="space-y-3">
                <div className="mb-2 text-center text-sm text-green-200">{displaySeason} Season - Ranked by Total</div>
                <div className="rounded-lg bg-white/5 px-3 py-2 text-center text-xs text-green-100/85">
                  {AVG_WEEKLY_HELP}
                </div>
                {displayRows
                  .sort((a, b) => b.total - a.total)
                  .map((row, i) => (
                    <div key={row.name} className="rounded-xl bg-green-900/40 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">{i + 1}</span>
                          <span className="font-semibold text-white">{row.name}</span>
                        </div>
                        <span className="font-mono text-lg font-bold text-green-400">{row.total}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-white/5 p-2">
                          <div className="text-xs text-green-200">Avg Weekly*</div>
                          <div className="font-mono font-semibold text-white">{row.avgWeekly}</div>
                        </div>
                        <div className="rounded-lg bg-white/5 p-2">
                          <div className="text-xs text-green-200">Top 10 Avg</div>
                          <div className="font-mono font-semibold text-white">{row.top10Avg}</div>
                        </div>
                        <div className="rounded-lg bg-white/5 p-2">
                          <div className="text-xs text-green-200">Weeks</div>
                          <div className="font-mono font-semibold text-white">{row.weeks.filter(w => w > 0).length}</div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Standings Tab - Ranked List */}
            {mobileTab === "standings" && view === "current" && !seasonHasStarted(currentRows) && (
              <PreseasonEmptyState
                currentSeasonYear={data.currentSeasonYear}
                previousYear={data.previousYears[0] ?? null}
                onViewPrevious={() => { setSelectedYear(data.previousYears[0]); setView("previous"); }}
                onViewCareer={() => { setView("career"); setMobileTab("stats"); }}
              />
            )}

            {mobileTab === "standings" && !(view === "current" && !seasonHasStarted(currentRows)) && (
              <div className="space-y-2">
                <div className="mb-2 text-center text-sm text-green-200">{displaySeason} Season</div>
                {displayRows
                  .sort((a, b) => b.total - a.total)
                  .map((row, i) => (
                    <div key={row.name} className={`flex items-center justify-between rounded-xl p-3 ${
                      i < 3 ? "bg-yellow-500/20 border border-yellow-500/30" : "bg-green-900/40"
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                          i === 0 ? "bg-yellow-500 text-black" : i === 1 ? "bg-gray-400 text-black" : i === 2 ? "bg-orange-600 text-white" : "bg-white/20 text-white"
                        }`}>{i + 1}</span>
                        <span className="font-medium text-white">{row.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-green-400">{row.total}</div>
                        <div className="text-xs text-green-200">points</div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* More Tab - Year Selection */}
            {mobileTab === "more" && (
              <div className="space-y-4">
                <div className="rounded-xl bg-green-900/40 p-4">
                  <button
                    type="button"
                    onClick={() => { setView("career"); setMobileTab("stats"); }}
                    className="w-full rounded-lg bg-white/5 px-4 py-3 text-left font-medium text-green-50 transition hover:bg-white/15"
                  >
                    All-Time Stats
                  </button>
                </div>

                <div className="rounded-xl bg-green-900/40 p-4">
                  <h3 className="mb-3 font-bold text-white">Previous Seasons</h3>
                  <div className="space-y-2">
                    {Object.keys(data.seasons)
                      .filter(y => y !== data.currentSeasonYear)
                      .sort((a, b) => b.localeCompare(a))
                      .map(year => (
                        <button
                          key={year}
                          type="button"
                          onClick={() => { setSelectedYear(year); setView("previous"); setMobileTab("stats"); }}
                          className="w-full rounded-lg bg-white/5 px-4 py-3 text-left font-medium text-green-50 transition hover:bg-white/15"
                        >
                          {year} Season
                        </button>
                      ))}
                  </div>
                </div>
                
                <div className="rounded-xl bg-green-900/40 p-4">
                  <h3 className="mb-3 font-bold text-white">Settings</h3>
                  <Link
                    href="/"
                    className="mb-2 block w-full rounded-lg bg-white/5 px-4 py-3 text-left font-medium text-green-50 transition hover:bg-white/15"
                  >
                    Open DFS League News
                  </Link>
                  <button
                    type="button"
                    onClick={() => setLayoutPreference("desktop")}
                    className="mb-2 w-full rounded-lg bg-white/5 px-4 py-3 text-left font-medium text-green-50 transition hover:bg-white/15"
                  >
                    Switch to Desktop View
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutPreference("auto")}
                    className="w-full rounded-lg bg-white/5 px-4 py-3 text-left font-medium text-green-50 transition hover:bg-white/15"
                  >
                    Use Auto Device Layout
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mobile Bottom Tab Bar */}
        {isMobileView && (
          <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-white/25 bg-green-950/95 px-2 shadow-lg">
            <button
              type="button"
              onClick={() => setMobileTab("home")}
              className={`flex flex-col items-center justify-center rounded-lg px-4 py-2 ${mobileTab === "home" ? "text-green-400" : "text-green-100"}`}
            >
              <span className="text-sm font-semibold">Home</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("stats")}
              className={`flex flex-col items-center justify-center rounded-lg px-4 py-2 ${mobileTab === "stats" ? "text-green-400" : "text-green-100"}`}
            >
              <span className="text-sm font-semibold">Stats</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("standings")}
              className={`flex flex-col items-center justify-center rounded-lg px-4 py-2 ${mobileTab === "standings" ? "text-green-400" : "text-green-100"}`}
            >
              <span className="text-sm font-semibold">Standings</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("more")}
              className={`flex flex-col items-center justify-center rounded-lg px-4 py-2 ${mobileTab === "more" ? "text-green-400" : "text-green-100"}`}
            >
              <span className="text-sm font-semibold">More</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
