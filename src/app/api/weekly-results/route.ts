import { NextResponse } from "next/server";
import { listFootballResultWeeks, fetchWeeklyResultsSummary, fetchEntryLineup } from "@/lib/weekly-results";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season");
  const week = searchParams.get("week");
  const entryName = searchParams.get("entry");

  try {
    if (season && week && entryName) {
      const lineup = await fetchEntryLineup(Number(season), Number(week), entryName);
      return NextResponse.json({ lineup }, { status: 200 });
    }

    if (season && week) {
      const summary = await fetchWeeklyResultsSummary(Number(season), Number(week));
      return NextResponse.json({ summary }, { status: 200 });
    }

    const weeks = await listFootballResultWeeks(season ? Number(season) : undefined);
    return NextResponse.json({ weeks }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ weeks: [], summary: null, lineup: [], error: String(error) }, { status: 200 });
  }
}
