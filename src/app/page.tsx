import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center py-32 px-16 bg-white dark:bg-black">
        <h1 className="text-4xl font-bold mb-4 text-black dark:text-zinc-50">Draftkings Fantasy Football League</h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400">Application under construction</p>
      </main>
    </div>
  );
}
