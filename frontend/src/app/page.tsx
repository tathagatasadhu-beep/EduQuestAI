import { GraduationCap, Sparkles, Users } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-navy-950 px-6 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_15%,rgba(61,90,254,0.35),transparent_45%),radial-gradient(circle_at_15%_80%,rgba(61,90,254,0.12),transparent_40%)]"
      />

      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg shadow-brand-600/40">
        <Sparkles className="h-7 w-7" strokeWidth={2.2} />
      </div>

      <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
        Edu<span className="text-brand-400">Quest</span>AI
      </h1>
      <p className="mb-12 max-w-md text-center text-lg text-slate-300">
        Where worksheets become quests.
      </p>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <Link
          href="/parent/login"
          className="group flex items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-4 text-center font-semibold text-white shadow-md shadow-brand-600/40 transition hover:bg-brand-600 hover:shadow-lg"
        >
          <Users className="h-5 w-5" strokeWidth={2.2} />
          I&apos;m a Parent
        </Link>
        <Link
          href="/student/login"
          className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-teal-500 px-6 py-4 text-center font-bold text-white shadow-md shadow-teal-500/30 transition hover:opacity-90 hover:shadow-lg"
        >
          <GraduationCap className="h-5 w-5" strokeWidth={2.2} />
          I&apos;m a Student
        </Link>
      </div>
    </div>
  );
}
