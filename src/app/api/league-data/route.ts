import { NextResponse } from 'next/server';

const SHEET_ID = '1BhF9CJSN3CQO_9IpSmdvxWXvoDgXvukk_h1pfv9JcQc';

const TOTAL_WEEKS = 18;

function parseCSV(csv: string) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
  const players: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.replace(/"/g, ''));
    const nameIdx = headers.findIndex(h => h.toLowerCase().includes('name') || h.toLowerCase().includes('player'));
    if (nameIdx === -1) continue;
    
    const name = values[nameIdx];
    if (!name) continue;
    
    const weeks: number[] = [];
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j].toLowerCase();
      if (h.startsWith('week') || h.startsWith('w')) {
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

function buildLeagueData(rawSheets: Record<string, any[]>) {
  const years = Object.keys(rawSheets).sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
  const currentSeasonYear = years[0] ?? null;
  const seasons: Record<string, any[]> = {};

  for (const year of years) {
    const rows = rawSheets[year] ?? [];
    
    seasons[year] = rows.map((row: any) => {
      const normalizedWeeks = row.weeks.map((score: number) => typeof score === "number" ? score : 0);
      const playedWeeks = row.weeks.filter((score: number) => typeof score === "number");
      const playedTotal = playedWeeks.reduce((sum: number, score: number) => sum + score, 0);
      const total = normalizedWeeks.reduce((sum: number, score: number) => sum + score, 0);
      const avgWeekly = playedWeeks.length > 0 ? playedTotal / playedWeeks.length : 0;
      const top10Scores = [...normalizedWeeks].sort((a: number, b: number) => b - a).slice(0, 10);
      const computedTop10Avg = top10Scores.length > 0 ? top10Scores.reduce((sum: number, score: number) => sum + score, 0) / top10Scores.length : 0;

      return {
        name: row.name,
        weeks: normalizedWeeks,
        total: Number.parseFloat(total.toFixed(2)),
        avgWeekly: Number.parseFloat(avgWeekly.toFixed(2)),
        top10Avg: Number.parseFloat(computedTop10Avg.toFixed(2)),
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

export async function GET() {
  try {
    const rawSheets: Record<string, any[]> = {};
    
    // Fetch 2024
    const resp2024 = await fetch(
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=2024`, { cache: 'no-store' }
    );
    const csv2024 = await resp2024.text();
    const data2024 = parseCSV(csv2024);
    if (data2024.length > 0) rawSheets['2024'] = data2024;
    
    // Fetch 2025
    const resp2025 = await fetch(
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=2025`, { cache: 'no-store' }
    );
    const csv2025 = await resp2025.text();
    const data2025 = parseCSV(csv2025);
    if (data2025.length > 0) rawSheets['2025'] = data2025;
    
    // Fetch 2026
    const resp2026 = await fetch(
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=2026`, { cache: 'no-store' }
    );
    const csv2026 = await resp2026.text();
    const data2026 = parseCSV(csv2026);
    if (data2026.length > 0) rawSheets['2026'] = data2026;
    
    const result = buildLeagueData(rawSheets);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
