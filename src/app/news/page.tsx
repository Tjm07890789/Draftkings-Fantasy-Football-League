import { NewsLanding } from "@/components/news-landing";

export const dynamic = "force-dynamic";

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams;
  const raw = Array.isArray(params.recap) ? params.recap[0] : params.recap;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return <NewsLanding recapWeek={Number.isFinite(parsed) ? parsed : undefined} />;
}
