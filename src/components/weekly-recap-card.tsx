import Link from "next/link";
import type { WeeklyRecap } from "@/lib/weekly-recap";

/** Server-rendered weekly recap for the News page. All text comes from lib/weekly-recap.ts. */
export function WeeklyRecapCard({ recap }: { recap: WeeklyRecap }) {
  const newestWeek = recap.availableWeeks[0];
  return (
    <section
      aria-labelledby="weekly-recap-heading"
      className="rounded-2xl border border-emerald-300/30 bg-green-950/70 p-5 shadow-xl shadow-black/30 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/80">Weekly Recap</p>
          <h2 id="weekly-recap-heading" className="mt-1 text-2xl font-extrabold text-white md:text-3xl">
            Week {recap.week} · {recap.season} Season
          </h2>
          <p className="mt-1 text-xs text-green-100/60">
            Generated from the league&apos;s own results{recap.entryCount ? ` · ${recap.entryCount} entries` : ""}
            {recap.week !== newestWeek ? " · an earlier week" : ""}
          </p>
        </div>
        {recap.availableWeeks.length > 1 && (
          <nav aria-label="Choose a week" className="flex flex-wrap items-center gap-1.5">
            {[...recap.availableWeeks].sort((a, b) => a - b).map((w) => (
              <Link
                key={w}
                href={w === newestWeek ? "/" : `/?recap=${w}`}
                aria-current={w === recap.week ? "page" : undefined}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                  w === recap.week
                    ? "border-emerald-300 bg-emerald-400/25 text-emerald-50"
                    : "border-white/20 bg-white/10 text-green-100 hover:bg-white/20"
                }`}
              >
                Wk {w}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {recap.commissionerNote && (
        <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-400/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">From the commissioner</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-amber-50/95">{recap.commissionerNote}</p>
        </div>
      )}

      {recap.highlights.length ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {recap.highlights.map((item) => (
            <li key={item.id} className="flex flex-col rounded-xl border border-white/15 bg-black/20 p-4">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="text-xl">{item.emoji}</span>
                <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-200">{item.title}</h3>
              </div>
              <p className="mt-2 flex-1 text-sm leading-6 text-green-50/95">{item.text}</p>
              {item.link && (
                <Link href={item.link.href} className="mt-3 text-xs font-semibold text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline">
                  Find it: {item.link.label} →
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-green-100/80">This week&apos;s numbers are still coming in. Check back once results are posted.</p>
      )}

      <div className="mt-4 flex flex-col gap-1 rounded-xl border border-sky-300/25 bg-sky-400/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-sky-50/95">
          <span aria-hidden="true" className="mr-1">{recap.tip.emoji}</span>
          <strong className="mr-1">{recap.tip.title}</strong>
          {recap.tip.text}
        </p>
        {recap.tip.link && (
          <Link href={recap.tip.link.href} className="shrink-0 text-xs font-semibold text-sky-200 underline-offset-2 hover:underline">
            Try it: {recap.tip.link.label} →
          </Link>
        )}
      </div>
    </section>
  );
}
