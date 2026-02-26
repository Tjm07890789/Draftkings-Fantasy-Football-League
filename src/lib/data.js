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
    const rawSheets = require('./static-data.json');
    cachedData = buildLeagueData(rawSheets);
  } catch (error) {
    console.error("DFS data load failed:", error);
    cachedData = {
      years: [],
      currentSeasonYear: null,
      previousYears: [],
      seasons: {},
    };
  }

  return cachedData;
}