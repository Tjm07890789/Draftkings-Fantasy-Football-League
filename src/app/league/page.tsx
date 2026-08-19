import { DFSApp } from "@/components/dfs-app";
import { fetchLeagueDataFromSheet } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function LeaguePage() {
  const leagueData = await fetchLeagueDataFromSheet();
  return <DFSApp data={leagueData} />;
}
