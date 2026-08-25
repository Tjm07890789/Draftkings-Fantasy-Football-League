import { fetchPublishedNews } from "@/lib/dfs-news";
import type { DfsNewsPost } from "@/lib/dfs-news";
import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "Draft";
  return `${new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  })} EST`;
}

function getLatestPublishedAt(posts: DfsNewsPost[]) {
  return posts.reduce<string | null>((latest, post) => {
    const candidate = post.updatedAt || post.publishedAt;
    if (!candidate) return latest;
    if (!latest) return candidate;
    return new Date(candidate).getTime() > new Date(latest).getTime() ? candidate : latest;
  }, null);
}

export async function NewsLanding() {
  let posts: DfsNewsPost[] = [];

  try {
    posts = await fetchPublishedNews();
  } catch (error) {
    console.error("DFS news fetch failed:", error);
  }

  const latestPublishedAt = getLatestPublishedAt(posts);

  return (
    <div className="gridiron-bg h-screen overflow-y-auto text-white">
      <header className="fixed top-0 right-0 left-0 z-40 flex h-20 w-full items-center justify-between gap-4 border-b border-white/25 bg-green-950/85 px-4 backdrop-blur-sm md:px-6">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <Image
            src="/dfs-league-logo.png"
            alt="DFS League logo"
            width={64}
            height={64}
            className="h-12 w-12 rounded-xl object-contain md:h-14 md:w-14"
            priority
          />
          <h1 className="truncate text-lg font-bold tracking-wide md:text-2xl">DFS League</h1>
        </div>

        <nav className="hidden items-center gap-2 md:flex">
          <Link
            href="/"
            className="rounded-md border border-emerald-300 bg-emerald-400/20 px-3 py-2 text-sm font-semibold text-emerald-100 transition"
          >
            DFS League News
          </Link>
          <Link
            href="/league"
            className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-green-50 transition hover:bg-white/20"
          >
            Enter League Site
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-10 pt-26 md:px-6">
        <section className="rounded-2xl border border-white/20 bg-green-950/70 p-6 shadow-xl shadow-black/30">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-200/80">League Bulletin</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-wide text-white md:text-5xl">DFS League News</h2>
              <p className="mt-3 max-w-3xl text-sm text-green-100/80 md:text-base">
                Updates, announcements, rule clarifications, and league notes published from the DFS admin dashboard.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/league"
                  className="rounded-xl border border-emerald-300 bg-emerald-400/20 px-4 py-3 text-center text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400/30"
                >
                  Open League Dashboard
                </Link>
                <Link
                  href="/league?view=mobile"
                  className="rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-green-50 transition hover:bg-white/20"
                >
                  Open Mobile View
                </Link>
              </div>
            </div>
            <div className="self-start rounded-2xl border border-white/15 bg-black/15 px-3 py-2 shadow-lg shadow-black/20">
              <div className="flex items-center gap-2">
                <p className="text-[0.56rem] font-semibold uppercase tracking-[0.16em] text-green-100/65">Powered by</p>
                <img src="/tjm-dev-logo.png" alt="TJM Dev logo" className="h-4 w-auto object-contain md:h-[1.1rem]" />
              </div>
            </div>
          </div>
        </section>

        {posts.length ? (
          posts.map((post) => (
            <article
              key={post.id}
              className="rounded-2xl border border-white/20 bg-green-950/65 p-5 shadow-lg shadow-black/20"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-2xl font-bold text-white">{post.title}</h3>
                <div className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#ffd700]">
                  Last Updated {formatDate(post.updatedAt || post.publishedAt)}
                </div>
              </div>
              {post.summary ? <p className="mt-3 text-base text-green-100">{post.summary}</p> : null}
              <div className="mt-4 space-y-4 text-sm leading-7 text-green-50/95 md:text-base">
                {post.body.split(/\n{2,}/).map((paragraph, index) => (
                  <p key={`${post.id}-paragraph-${index}`}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))
        ) : (
          <section className="rounded-2xl border border-white/20 bg-green-950/65 p-8 text-center shadow-lg shadow-black/20">
            <h3 className="text-2xl font-bold text-white">No News Yet</h3>
            <p className="mt-3 text-sm text-green-100/80 md:text-base">
              Published posts from the dashboard will appear here automatically.
            </p>
          </section>
        )}

        <div className="text-right text-xs font-semibold uppercase tracking-[0.18em] text-green-100/60">
          Last News Update: {latestPublishedAt ? formatDate(latestPublishedAt) : "No published posts yet"}
        </div>
      </main>
    </div>
  );
}
