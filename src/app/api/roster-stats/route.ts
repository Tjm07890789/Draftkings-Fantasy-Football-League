import { NextResponse } from "next/server";
import { fetchRosterTendencies, fetchPlayerExposure } from "@/lib/roster-stats";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season");
  if (!season) {
    return NextResponse.json({ error: "season is required" }, { status: 400 });
  }

  try {
    const [tendencies, exposure] = await Promise.all([
      fetchRosterTendencies(Number(season)),
      fetchPlayerExposure(Number(season)),
    ]);
    return NextResponse.json({ tendencies, exposure }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ tendencies: [], exposure: [], error: String(error) }, { status: 200 });
  }
}
