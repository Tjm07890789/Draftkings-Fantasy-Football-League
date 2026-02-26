"use client";

import * as React from "react";
import Image from "next/image";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type View = "welcome" | "current" | "previous" | "statistics";

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

function SeasonGrid({ title, rows }: { title: string; rows: SeasonRow[] }) {
  const [sortColumn, setSortColumn] = React.useState<SortColumn>("total");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");

  const sortedRows = React.useMemo(() => {
    const nextRows = [...rows];
    nextRows.sort((a, b) => {
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
  }, [rows, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection(column === "name" ? "asc" : "desc");
  };

  const renderSortLabel = (column: SortColumn) => {
    const isActive = sortColumn === column;
    if (!isActive) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  };

  return (
    <section className="m-0 w-full max-w-full overflow-hidden rounded-xl border border-white/30 bg-green-950/65 p-0 shadow-xl shadow-black/25 md:h-full">
      <h2 className="px-3 py-2 text-lg font-bold text-white">{title}</h2>
      <div className="m-0 max-w-full overflow-auto p-0 md:h-[calc(100%-3rem)] md:overflow-hidden">
        <Table className="table-fixed w-full max-w-full overflow-hidden text-[0.5rem]">
          <TableHeader>
            <TableRow className="h-3 py-0 text-[0.5rem]">
              <TableHead className="sticky top-0 z-20 h-3 w-[12vw] bg-green-950/95 px-1 py-0 text-xs">
                <button type="button" onClick={() => handleSort("name")} className="w-full cursor-pointer text-left">
                  Name{renderSortLabel("name")}
                </button>
              </TableHead>
              {Array.from({ length: 18 }, (_, index) => (
                <TableHead
                  key={`week-head-${index + 1}`}
                  className="sticky top-0 z-20 h-3 w-[2.5vw] bg-green-950/95 px-0 py-0 text-center text-[0.3rem]"
                >
                  <button
                    type="button"
                    onClick={() => handleSort(`week-${index}`)}
                    className="w-full cursor-pointer text-center"
                  >
                    W{index + 1}
                    {renderSortLabel(`week-${index}`)}
                  </button>
                </TableHead>
              ))}
              <TableHead className="sticky top-0 z-20 h-3 w-[8vw] bg-green-950/95 px-1 py-0 text-xs">
                <button type="button" onClick={() => handleSort("total")} className="w-full cursor-pointer text-left">
                  Total{renderSortLabel("total")}
                </button>
              </TableHead>
              <TableHead className="sticky top-0 z-20 h-3 w-[8vw] bg-green-950/95 px-1 py-0 text-xs">
                <button type="button" onClick={() => handleSort("avgWeekly")} className="w-full cursor-pointer text-left">
                  Avg Weekly{renderSortLabel("avgWeekly")}
                </button>
              </TableHead>
              <TableHead className="sticky top-0 z-20 h-3 w-[8vw] bg-green-950/95 px-1 py-0 text-xs">
                <button type="button" onClick={() => handleSort("top10Avg")} className="w-full cursor-pointer text-left">
                  Top10 Avg{renderSortLabel("top10Avg")}
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow key={row.name} className="h-3 py-0 text-[0.5rem]">
                <TableCell className="h-3 w-[12vw] px-1 py-0 text-xs font-semibold whitespace-nowrap">{row.name}</TableCell>
                {row.weeks.map((score, index) => (
                  <TableCell
                    key={`${row.name}-week-${index + 1}`}
                    className={`${row.top10WeekIndexes.includes(index) ? "bg-emerald-400/15 " : ""}h-3 w-[2.5vw] px-0 py-0 text-center text-[0.5rem]`}
                  >
                    {formatCell(score)}
                  </TableCell>
                ))}
                <TableCell className="h-3 w-[8vw] px-1 py-0 text-xs font-semibold">{formatCell(row.total)}</TableCell>
                <TableCell className="h-3 w-[8vw] px-1 py-0 text-xs">{formatCell(row.avgWeekly)}</TableCell>
                <TableCell className="h-3 w-[8vw] px-1 py-0 text-xs">{formatCell(row.top10Avg)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="px-3 pb-2 text-[0.6rem] text-green-100/80">
        Sorted by {getColumnLabel(sortColumn)} ({sortDirection})
      </div>
    </section>
  );
}

export function DFSApp({ data }: { data: LeagueData }) {
  const [view, setView] = React.useState<View>("welcome");
  const [selectedYear, setSelectedYear] = React.useState<string | null>(null);
  const currentRows = data.currentSeasonYear ? data.seasons[data.currentSeasonYear] ?? [] : [];
  const previousRows = selectedYear ? data.seasons[selectedYear] ?? [] : [];

  React.useEffect(() => {
    const savedView = getCookie(NAV_COOKIE);
    const savedSeason = getCookie(SEASON_COOKIE);

    if (savedView === "current" || savedView === "previous" || savedView === "statistics") {
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
      <header className="fixed top-0 right-0 left-0 z-40 flex h-20 w-full items-center justify-between border-b border-white/25 bg-green-950/80 px-6 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Image
            src="https://upload.wikimedia.org/wikipedia/en/a/a2/National_Football_League_logo.svg"
            alt="NFL logo"
            width={48}
            height={59}
            className="h-12 w-auto"
          />
          <h1 className="text-2xl font-bold tracking-wide">DFS Football League</h1>
        </div>
        <div className="text-sm font-semibold text-green-100">2025 | 19 participants | $10k pool</div>
      </header>

      <div className="relative m-0 p-0 pt-20 md:flex md:h-[calc(100vh-5rem)] md:overflow-hidden">
        <aside className="top-20 left-0 w-full border-b border-white/25 bg-green-950/60 px-[5px] py-4 md:fixed md:h-[calc(100vh-5rem)] md:w-[10%] md:border-r md:border-b-0">
          <nav className="space-y-5">
            <button
              type="button"
              onClick={() => setView("current")}
              className="w-full rounded-md bg-white/10 px-3 py-2 text-left text-sm font-semibold text-green-50 transition hover:bg-white/20"
            >
              Current Weekly Season Grid
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

            <button
              type="button"
              onClick={() => setView("statistics")}
              className="w-full rounded-md bg-white/10 px-3 py-2 text-left text-sm font-semibold text-green-50 transition hover:bg-white/20"
            >
              Statistics
            </button>
          </nav>
        </aside>

        <main className="m-0 w-full overflow-auto px-[5px] md:ml-[10%] md:flex md:h-[calc(100vh-5rem)] md:w-[90%] md:items-center md:justify-center md:overflow-hidden md:px-[5px]">
          {view === "welcome" && (
            <div className="text-center">
              <h2 className="text-4xl font-extrabold tracking-wide text-white">Welcome to DFS Football League</h2>
              <p className="mt-3 text-lg text-green-100">Select a section from the left navigation to begin.</p>
            </div>
          )}

          {view === "current" && <SeasonGrid title={`Current Weekly Season Grid (${data.currentSeasonYear ?? ""})`} rows={currentRows} />}

          {view === "previous" && selectedYear && (
            <SeasonGrid title={`Previous Season Grid (${selectedYear})`} rows={previousRows} />
          )}

          {view === "statistics" && (
            <div className="text-center">
              <h2 className="text-4xl font-extrabold tracking-wide text-white">Statistics</h2>
              <p className="mt-3 text-lg text-green-100">Coming Soon</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
