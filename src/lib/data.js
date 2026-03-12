const TOTAL_WEEKS = 18;

let cachedData = null;
let sheetCacheTime = 0;
const SHEET_CACHE_TTL = 60 * 1000; // 60 seconds

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
  // For now, fall back to static data - will be replaced with API fetch
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

// Server-side function to fetch from Google Sheets
export async function fetchLeagueDataFromSheet() {
  const now = Date.now();
  
  // Use cached data if fresh enough
  if (cachedData && (now - sheetCacheTime) < SHEET_CACHE_TTL) {
    return cachedData;
  }
  
  try {
    // Try to fetch from Google Sheets directly
    const SHEET_ID = '1BhF9CJSN3CQO_9IpSmdvxWXvoDgXvukk_h1pfv9JcQc';
    
    const [resp2024, resp2025] = await Promise.all([
      fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=2024`),
      fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=2025`)
    ]);
    
    const csv2024 = await resp2024.text();
    const csv2025 = await resp2025.text();
    
    const rawSheets = {
      2024: parseSheetCSV(csv2024),
      2025: parseSheetCSV(csv2025)
    };
    
    cachedData = buildLeagueData(rawSheets);
    sheetCacheTime = now;
    return cachedData;
  } catch (error) {
    console.error("Sheet fetch failed:", error);
    // Fall back to static data
    return getLeagueData();
  }
}

function parseSheetCSV(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
  const players = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.replace(/"/g, ''));
    const nameIdx = headers.findIndex(h => h.toLowerCase().includes('name') || h.toLowerCase().includes('player'));
    if (nameIdx === -1) continue;
    
    const name = values[nameIdx];
    if (!name) continue;
    
    const weeks = [];
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j].toLowerCase();
      if (h.includes('week') || h === 'w1' || h === 'w1 ') {
        const val = parseFloat(values[j]) || 0;
        weeks.push(val);
      }
    }
    
    if (weeks.length > 0) {
      players.push({ name, weeks });
    }
  }
  
  return players;
}