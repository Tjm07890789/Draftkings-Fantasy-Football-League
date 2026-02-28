"use client";

import * as React from "react";
import Image from "next/image";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type View = "welcome" | "current" | "previous";

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

const NAV_COOKIE = "dfs_v1_last_nav";
const SEASON_COOKIE = "dfs_v1_last_season";

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
  type StatsSubview = "insights" | "weekly-ranks";
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
    </section>
  );
}

function SeasonGrid({ title, rows, seasonLabel }: { title: string; rows: SeasonRow[]; seasonLabel: string }) {
  type SeasonPanel = "grid" | "statistics";
  type DisplayMode = "points" | "rank";
  const totalGridColumns = 23;
  const longestNameChars = React.useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.name.length), 0),
    [rows],
  );
  const rankColWidth = "44px";
  const nameColWidth = `${Math.max((longestNameChars + 2) * 8, 150)}px`;
  const dataColWidth = "68px";

  const [sortColumn, setSortColumn] = React.useState<SortColumn>("total");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [seasonPanel, setSeasonPanel] = React.useState<SeasonPanel>("grid");
  const [displayMode, setDisplayMode] = React.useState<DisplayMode>("points");

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
      const total = rows.reduce((sum, row) => sum + (row.weeks[index] ?? 0), 0);
      return total / rows.length;
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
      className="m-0 w-full max-w-full overflow-hidden rounded-xl border border-white/30 bg-green-950/65 p-0 shadow-xl shadow-black/25 md:h-full"
      style={
        {
          ["--rank-col-width" as string]: rankColWidth,
          ["--name-col-width" as string]: nameColWidth,
          ["--data-col-width" as string]: dataColWidth,
        } as React.CSSProperties
      }
    >
      <div className="sticky top-20 z-30 flex flex-wrap items-center justify-end gap-2 border-b border-white/20 bg-green-950/90 px-3 py-2 backdrop-blur-sm">
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
      <div className="m-0 max-w-full overflow-auto p-0 md:h-[calc(100%-3.5rem)] md:overflow-hidden">
        <Table className="table-fixed w-max min-w-full max-w-none overflow-hidden text-[0.78rem]">
          <TableHeader>
            <TableRow className="h-5 bg-emerald-900/55 py-0 text-[0.82rem]">
              <TableHead colSpan={totalGridColumns} className="h-5 px-2 py-1 text-left text-[0.82rem] font-bold text-white">
                {title}
              </TableHead>
            </TableRow>
            <TableRow className="h-7 py-0 text-[0.8rem]">
              <TableHead
                className="sticky top-0 z-20 h-7 bg-green-950/95 px-2 py-1 text-left text-[0.78rem]"
                style={{ width: "var(--rank-col-width)", minWidth: "var(--rank-col-width)" }}
              >
                <span className="pl-1">#</span>
              </TableHead>
              <TableHead
                className="sticky top-0 z-20 h-7 border-r border-white/25 bg-green-950/95 px-2 py-1 text-[0.78rem]"
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
                  className={`sticky top-0 z-20 h-7 bg-green-950/95 py-1 text-center text-[0.8rem] ${index === 0 ? "pl-[2px]" : "px-[1px]"}`}
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
                className="sticky top-0 z-20 h-7 bg-green-950/95 px-[1px] py-1 text-center text-[0.78rem]"
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
                className="sticky top-0 z-20 h-7 bg-green-950/95 px-[1px] py-1 text-center text-[0.78rem]"
                style={{ width: "var(--data-col-width)", minWidth: "var(--data-col-width)" }}
              >
                <button
                  type="button"
                  onClick={() => handleSort("avgWeekly")}
                  className="w-full cursor-pointer text-center font-semibold text-amber-300"
                >
                  Avg Weekly{renderSortLabel("avgWeekly")}
                </button>
              </TableHead>
              <TableHead
                className="sticky top-0 z-20 h-7 bg-green-950/95 px-[1px] py-1 text-center text-[0.78rem]"
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
                  <span className="block max-w-full whitespace-nowrap pl-1">{row.name}</span>
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
        <div className="px-3 pb-2 text-[0.6rem] text-green-100/80">
          Sorted by {getColumnLabel(sortColumn)} ({sortDirection})
        </div>
      )}
      {seasonPanel === "statistics" && (
        <div className="p-3">
          <StatisticsView rows={rows} seasonLabel={seasonLabel} />
        </div>
      )}
    </section>
  );
}

export function DFSApp({ data }: { data: LeagueData }) {
  const [view, setView] = React.useState<View>("welcome");
  const [selectedYear, setSelectedYear] = React.useState<string | null>(null);
  const currentRows = data.currentSeasonYear ? data.seasons[data.currentSeasonYear] ?? [] : [];
  const previousRows = selectedYear ? data.seasons[selectedYear] ?? [] : [];
  const participantCount = view === "previous" ? previousRows.length : currentRows.length;
  const leagueParticipantCount = currentRows.length;
  const duesPerParticipantRaw = Number.parseFloat(process.env.NEXT_PUBLIC_DUES_PER_PARTICIPANT ?? "0");
  const duesPerParticipant = Number.isFinite(duesPerParticipantRaw) && duesPerParticipantRaw > 0 ? duesPerParticipantRaw : 0;
  const poolTotal = leagueParticipantCount * duesPerParticipant;
  const poolLabel =
    duesPerParticipant > 0
      ? `${formatCurrency(poolTotal)} pool (${formatCurrency(duesPerParticipant)} dues)`
      : "Pool TBD (set NEXT_PUBLIC_DUES_PER_PARTICIPANT)";
  React.useEffect(() => {
    const savedView = getCookie(NAV_COOKIE);
    const savedSeason = getCookie(SEASON_COOKIE);

    if (savedView === "current" || savedView === "previous") {
      setView(savedView);
    }

    if (savedSeason && data.previousYears.includes(savedSeason)) {
      setSelectedYear(savedSeason);
    }
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
    <div className="gridiron-bg m-0 h-screen overflow-auto p-0 text-white md:overflow-hidden">
      <header className="fixed top-0 right-0 left-0 z-40 flex h-20 w-full items-center justify-between gap-4 border-b border-white/25 bg-green-950/85 px-4 backdrop-blur-sm md:px-6">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <Image
            src="https://upload.wikimedia.org/wikipedia/en/a/a2/National_Football_League_logo.svg"
            alt="NFL logo"
            width={44}
            height={54}
            className="h-10 w-auto md:h-12"
          />
          <h1 className="truncate text-lg font-bold tracking-wide md:text-2xl">DFS Football League</h1>
        </div>

        <nav className="hidden items-center gap-2 lg:flex">
          <button
            type="button"
            onClick={() => setView("current")}
            className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-green-50 transition hover:bg-white/20"
          >
            Current Year
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

        <div className="text-right text-xs font-semibold text-green-100 md:text-sm">
          <div>{data.currentSeasonYear ?? "Season"} | {participantCount} participants</div>
          <div>{poolLabel}</div>
        </div>
      </header>

      <div className="relative m-0 p-0 pt-20 md:h-[calc(100vh-5rem)]">
        <aside className="w-full border-b border-white/25 bg-green-950/60 px-3 py-3 lg:hidden">
          <nav className="space-y-5">
            <button
              type="button"
              onClick={() => setView("current")}
              className="w-full rounded-md bg-white/10 px-3 py-2 text-left text-sm font-semibold text-green-50 transition hover:bg-white/20"
            >
              Current Year
            </button>

            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-green-100">Previous Seasons</h2>
              <Accordion>
                <AccordionItem value="previous-seasons">
                  <AccordionTrigger value="previous-seasons">Choose Year</AccordionTrigger>
                  <AccordionContent value="previous-seasons" className="space-y-2">
                    {data.previousYears.map((year) => (
                      <button
                        key={year}
                        type="button"
                        onClick={() => {
                          setSelectedYear(year);
                          setView("previous");
                        }}
                        className="block w-full rounded-md bg-white/5 px-3 py-2 text-left text-sm text-green-100 transition hover:bg-white/15"
                      >
                        {year}
                      </button>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

          </nav>
        </aside>

        <main className="m-0 w-full overflow-auto px-[5px] md:flex md:h-[calc(100vh-5rem)] md:w-full md:items-center md:justify-start md:overflow-hidden md:px-[5px]">
          {view === "welcome" && (
            <div className="text-center">
              <h2 className="text-4xl font-extrabold tracking-wide text-white">Welcome to DFS Football League</h2>
              <p className="mt-3 text-lg text-green-100">Select a section from the left navigation to begin.</p>
            </div>
          )}

          {view === "current" && (
            <SeasonGrid
              title={`Current Weekly Season Grid (${data.currentSeasonYear ?? ""})`}
              rows={currentRows}
              seasonLabel={data.currentSeasonYear ?? "Current Season"}
            />
          )}

          {view === "previous" && selectedYear && (
            <SeasonGrid
              title={`Previous Season Grid (${selectedYear})`}
              rows={previousRows}
              seasonLabel={selectedYear}
            />
          )}
        </main>
      </div>
    </div>
  );
}
