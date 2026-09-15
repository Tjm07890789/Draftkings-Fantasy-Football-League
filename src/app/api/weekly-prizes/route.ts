import { NextResponse } from "next/server";
import { fetchSeasonPrizeSummary, fetchAllTimePrizeSummary, fetchOwnerSeasonPrizes, fetchOwnerAllTimePrizes } from "@/lib/prizes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season");
  const scope = searchParams.get("scope");
  const owner = searchParams.get("owner");

  try {
    if (owner && scope === "all-time") {
      const weeks = await fetchOwnerAllTimePrizes(owner);
      return NextResponse.json({ weeks }, { status: 200 });
    }
    if (owner && season) {
      const weeks = await fetchOwnerSeasonPrizes(Number(season), owner);
      return NextResponse.json({ weeks }, { status: 200 });
    }
    if (scope === "all-time") {
      const summary = await fetchAllTimePrizeSummary();
      return NextResponse.json({ summary }, { status: 200 });
    }
    if (season) {
      const summary = await fetchSeasonPrizeSummary(Number(season));
      return NextResponse.json({ summary }, { status: 200 });
    }
    return NextResponse.json({ error: "season or scope=all-time is required" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ summary: [], weeks: [], error: String(error) }, { status: 200 });
  }
}
