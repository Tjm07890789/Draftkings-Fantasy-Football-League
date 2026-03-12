import { NextResponse } from 'next/server';

const SHEET_ID = '1BhF9CJSN3CQO_9IpSmdvxWXvoDgXvukk_h1pfv9JcQc';

export async function GET() {
  try {
    const seasons: Record<string, any[]> = {};
    
    // Fetch 2024
    const resp2024 = await fetch(
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=2024`
    );
    const csv2024 = await resp2024.text();
    seasons['2024'] = parseCSV(csv2024);
    
    // Fetch 2025
    const resp2025 = await fetch(
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=2025`
    );
    const csv2025 = await resp2025.text();
    seasons['2025'] = parseCSV(csv2025);
    
    return NextResponse.json(seasons);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

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
