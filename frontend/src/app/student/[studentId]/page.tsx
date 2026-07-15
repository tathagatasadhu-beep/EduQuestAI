import { Award, ChevronRight, Compass, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { getStudentToken } from "@/lib/session";
import StreakBadge from "@/components/StreakBadge";
import XPBar from "@/components/XPBar";

export default async function StudentHomePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const token = await getStudentToken();
  if (!token) redirect("/student/login");

  let me: Awaited<ReturnType<typeof api.getMyProfile>>;
  try {
    me = await api.getMyProfile(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/student/login");
    throw err;
  }

  if (me.id !== studentId) {
    redirect(`/student/${me.id}`);
  }

  const [mastery, assignedSubjects, badges] = await Promise.all([
    api.getMyMastery(token),
    api.getMyAssignedSubjects(token),
    api.getMyBadges(token),
  ]);

  const attempted = mastery.filter((m) => m.total_first_attempts > 0);
  const weakest = attempted.length
    ? attempted.reduce((min, m) => (m.accuracy_rate < min.accuracy_rate ? m : min))
    : null;
  const weakestSubject = weakest
    ? assignedSubjects.find((s) => s.topics.some((t) => t.id === weakest.topic_id))
    : null;

  const earnedBadges = badges.filter((b) => b.earned);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-800">
          Hi, {me.display_name}! <span aria-hidden>👋</span>
        </h1>
      </div>

      <div className="mb-6 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-sky-100">
        <div className="flex-1">
          <XPBar xpTotal={me.xp_total} />
        </div>
        <StreakBadge streakDays={me.streak_days} />
      </div>

      {weakest && weakestSubject ? (
        <Link
          href={`/student/${me.id}/subjects/${weakestSubject.id}`}
          className="mb-6 flex items-center gap-3 rounded-2xl bg-sky-600 p-5 text-white shadow-sm transition hover:shadow-md"
        >
          <Sparkles className="h-6 w-6 shrink-0" strokeWidth={2} />
          <div className="flex-1">
            <p className="font-semibold">Let&apos;s work on {weakest.topic_name} today!</p>
            <p className="text-sm text-sky-100">Jump back in with a quick review and some practice.</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0" strokeWidth={2.2} />
        </Link>
      ) : assignedSubjects.length > 0 ? (
        <Link
          href={`/student/${me.id}/subjects`}
          className="mb-6 flex items-center gap-3 rounded-2xl bg-sky-600 p-5 text-white shadow-sm transition hover:shadow-md"
        >
          <Compass className="h-6 w-6 shrink-0" strokeWidth={2} />
          <div className="flex-1">
            <p className="font-semibold">Ready to start your first quest?</p>
            <p className="text-sm text-sky-100">See what your subjects have in store.</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0" strokeWidth={2.2} />
        </Link>
      ) : (
        <div className="mb-6 flex flex-col items-center gap-3 rounded-2xl bg-white/60 px-6 py-10 text-center ring-1 ring-sky-100">
          <Compass className="h-8 w-8 text-sky-300" strokeWidth={1.75} />
          <p className="text-zinc-400">No quests yet — ask a parent to assign a subject!</p>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-sky-400 uppercase">
            <Award className="h-4 w-4" strokeWidth={2.2} />
            Badges
          </h2>
          <Link href={`/student/${me.id}/badges`} className="text-xs font-medium text-sky-500 hover:text-sky-700">
            See all →
          </Link>
        </div>
        {earnedBadges.length === 0 ? (
          <p className="text-sm text-sky-400 italic">No badges yet — start practicing to earn your first one!</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {earnedBadges.map((b) => (
              <span
                key={b.id}
                className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200"
              >
                🏅 {b.name}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
