import { NextResponse } from "next/server";
import { fetchNameToAliasMap } from "@/lib/roster-crosswalk";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const map = await fetchNameToAliasMap();
    return NextResponse.json({ aliases: Object.fromEntries(map) }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ aliases: {}, error: String(error) }, { status: 200 });
  }
}
