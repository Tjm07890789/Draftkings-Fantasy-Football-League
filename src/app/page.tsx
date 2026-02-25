import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-green-900 font-sans">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-16 py-32 bg-green-800/85">
        <img
          src="https://upload.wikimedia.org/wikipedia/en/a/a2/National_Football_League_logo.svg"
          alt="NFL logo"
          className="h-28 w-auto"
        />
        <h1 className="text-center text-5xl font-extrabold tracking-wide text-white drop-shadow-[0_3px_8px_rgba(0,0,0,0.45)]">
          DraftKings Fantasy Football League
        </h1>
        <p className="text-xl text-green-100">Application under construction (Updated: Feb 25, 2026)</p>
      </main>
    </div>
  );
}
