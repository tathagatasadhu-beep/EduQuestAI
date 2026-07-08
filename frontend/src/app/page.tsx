import { GraduationCap, Sparkles, Users } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-white px-6 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.08),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(217,70,239,0.08),transparent_35%)]"
      />

      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
        <Sparkles className="h-7 w-7" strokeWidth={2.2} />
      </div>

      <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl">
        Edu<span className="text-indigo-600">Quest</span>AI
      </h1>
      <p className="mb-12 max-w-md text-center text-lg text-zinc-500">
        Turn your family&apos;s worksheets into an adaptive practice quest.
      </p>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <Link
          href="/parent/login"
          className="group flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-4 text-center font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 hover:shadow-lg"
        >
          <Users className="h-5 w-5" strokeWidth={2.2} />
          I&apos;m a Parent
        </Link>
        <Link
          href="/student/login"
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-pink-500 px-6 py-4 text-center font-bold text-white shadow-md shadow-pink-200 transition hover:opacity-90 hover:shadow-lg"
        >
          <GraduationCap className="h-5 w-5" strokeWidth={2.2} />
          I&apos;m a Student
        </Link>
      </div>
    </div>
  );
}
