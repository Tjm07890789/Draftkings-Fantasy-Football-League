import { DFSApp } from "@/components/dfs-app";
import { fetchLeagueDataFromSheet } from "@/lib/data";

export default async function Home() {
  const leagueData = await fetchLeagueDataFromSheet();
  return <DFSApp data={leagueData} />;
}
