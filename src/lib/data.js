import { spawnSync } from "node:child_process";

const WORKBOOK_PATH =
  "/Users/tjmmacmini/Email Attachment Downloads/message-19c92d6941f23515/01-DFS 2024.xlsx";
const TOTAL_WEEKS = 18;

let cachedData = null;

function formatNumber(value) {
  return Number.parseFloat(value.toFixed(2));
}

function getTopWeekIndexes(weeks) {
  return weeks
    .map((score, index) => ({ score, index }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.index - b.index;
    })
    .slice(0, 10)
    .map((entry) => entry.index);
}

function parseWorkbookWithPython() {
  const pythonScript = `
import json
import sys
from openpyxl import load_workbook

path = sys.argv[1]
wb = load_workbook(path, data_only=True)
payload = {}

for ws in wb.worksheets:
    rows = []
    for r in range(1, ws.max_row + 1):
        name = ws.cell(row=r, column=1).value
        if not isinstance(name, str) or not name.strip():
            continue

        weeks = []
        has_numeric_week = False
        for c in range(4, 22):
            value = ws.cell(row=r, column=c).value
            if isinstance(value, (int, float)):
                weeks.append(float(value))
                has_numeric_week = True
            elif value in (None, ""):
                weeks.append(None)
            else:
                try:
                    weeks.append(float(value))
                    has_numeric_week = True
                except Exception:
                    weeks.append(None)

        if has_numeric_week:
            rows.append({"name": name.strip(), "weeks": weeks})

    payload[ws.title] = rows

print(json.dumps(payload))
`;

  const result = spawnSync("python3", ["-c", pythonScript, WORKBOOK_PATH], {
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || "Unable to parse workbook");
  }

  return JSON.parse(result.stdout);
}

function buildLeagueData(rawSheets) {
  const years = Object.keys(rawSheets).sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
  const currentSeasonYear = years.includes("2025") ? "2025" : years[0] ?? null;

  const seasons = {};

  for (const year of years) {
    const rows = rawSheets[year] ?? [];
    const currentWeek = rows.reduce((maxWeek, row) => {
      for (let index = TOTAL_WEEKS - 1; index >= 0; index -= 1) {
        if (typeof row.weeks[index] === "number") {
          return Math.max(maxWeek, index + 1);
        }
      }
      return maxWeek;
    }, 0);

    seasons[year] = rows.map((row) => {
      const normalizedWeeks = row.weeks.map((score) => (typeof score === "number" ? score : 0));
      const playedWeeks = row.weeks.filter((score) => typeof score === "number");
      const playedTotal = playedWeeks.reduce((sum, score) => sum + score, 0);
      const total = normalizedWeeks.reduce((sum, score) => sum + score, 0);
      const avgWeekly = playedWeeks.length > 0 ? playedTotal / playedWeeks.length : 0;
      const top10Scores = [...normalizedWeeks].sort((a, b) => b - a).slice(0, 10);
      const computedTop10Avg =
        top10Scores.length > 0 ? top10Scores.reduce((sum, score) => sum + score, 0) / top10Scores.length : 0;
      const top10Avg = currentWeek <= 11 ? avgWeekly : computedTop10Avg;

      return {
        name: row.name,
        weeks: normalizedWeeks.map((score) => formatNumber(score)),
        top10WeekIndexes: getTopWeekIndexes(normalizedWeeks),
        total: formatNumber(total),
        avgWeekly: formatNumber(avgWeekly),
        top10Avg: formatNumber(top10Avg),
      };
    });
  }

  return {
    years,
    currentSeasonYear,
    previousYears: years.filter((year) => year !== currentSeasonYear),
    seasons,
  };
}

export function getLeagueData() {
  if (cachedData) {
    return cachedData;
  }

  try {
    const rawSheets = parseWorkbookWithPython();
    cachedData = buildLeagueData(rawSheets);
  } catch (error) {
    console.error("DFS workbook parse failed:", error);
    cachedData = {
      years: [],
      currentSeasonYear: null,
      previousYears: [],
      seasons: {},
    };
  }

  return cachedData;
}