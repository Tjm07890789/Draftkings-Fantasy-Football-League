import { NextResponse } from "next/server";
import { fetchPublishedNews } from "@/lib/dfs-news";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const posts = await fetchPublishedNews();
    return NextResponse.json({ posts }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ posts: [], error: String(error) }, { status: 200 });
  }
}
