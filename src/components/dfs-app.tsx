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

function SeasonGrid({ title, rows }: { title: string; rows: SeasonRow[] }) {
  return (
    <section className="w-full max-w-[calc(100vw-22rem)] rounded-xl border border-white/30 bg-green-950/65 p-4 shadow-xl shadow-black/25">
      <h2 className="mb-4 text-xl font-bold text-white">{title}</h2>
      <div className="max-h-[calc(100vh-13rem)] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky top-0 z-20 bg-green-950/95">Name</TableHead>
              {Array.from({ length: 18 }, (_, index) => (
                <TableHead key={`week-head-${index + 1}`} className="sticky top-0 z-20 bg-green-950/95">
                  W{index + 1}
                </TableHead>
              ))}
              <TableHead className="sticky top-0 z-20 bg-green-950/95">Total</TableHead>
              <TableHead className="sticky top-0 z-20 bg-green-950/95">Avg Weekly</TableHead>
              <TableHead className="sticky top-0 z-20 bg-green-950/95">Top10 Avg</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="font-semibold whitespace-nowrap">{row.name}</TableCell>
                {row.weeks.map((score, index) => (
                  <TableCell
                    key={`${row.name}-week-${index + 1}`}
                    className={row.top10WeekIndexes.includes(index) ? "bg-emerald-400/15" : undefined}
                  >
                    {formatCell(score)}
                  </TableCell>
                ))}
                <TableCell className="font-semibold">{formatCell(row.total)}</TableCell>
                <TableCell>{formatCell(row.avgWeekly)}</TableCell>
                <TableCell>{formatCell(row.top10Avg)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
    <div className="gridiron-bg h-screen overflow-hidden text-white">
      <header className="flex h-20 w-full items-center justify-between border-b border-white/25 bg-green-950/80 px-6 backdrop-blur-sm">
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
        <div className="text-sm font-semibold text-green-100">2026 | 12 participants | $10k pool</div>
      </header>

      <div className="relative flex h-[calc(100vh-5rem)]">
        <aside className="fixed top-20 left-0 h-[calc(100vh-5rem)] w-[15%] border-r border-white/25 bg-green-950/60 p-4">
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

        <main className="ml-[15%] flex h-full w-[85%] items-center justify-center p-6">
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