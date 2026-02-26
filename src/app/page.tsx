import { DFSApp } from "@/components/dfs-app";
import { getLeagueData } from "@/lib/data";

export default function Home() {
  const leagueData = getLeagueData();
  return <DFSApp data={leagueData} />;
}
