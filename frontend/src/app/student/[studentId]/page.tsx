import { Compass, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { getStudentToken } from "@/lib/session";
import LogoutButton from "@/components/LogoutButton";
import ProgressTrail from "@/components/ProgressTrail";
import StreakBadge from "@/components/StreakBadge";
import XPBar from "@/components/XPBar";

export default async function StudentDashboardPage({
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

  const [mastery, subjects] = await Promise.all([api.getMyMastery(token), api.listSubjects()]);

  const attempted = mastery.filter((m) => m.total_first_attempts > 0);
  const weakest = attempted.length
    ? attempted.reduce((min, m) => (m.accuracy_rate < min.accuracy_rate ? m : min))
    : null;
  const greeting = weakest ? `Let's work on ${weakest.topic_name} today!` : "Ready to start your first quest?";

  const masteryByTopic = new Map(mastery.map((m) => [m.topic_id, m]));

  const subjectsWithTopics = await Promise.all(
    subjects.map(async (s) => ({ subject: s, topics: await api.listTopics(s.id) }))
  );

  return (
    <div className="min-h-full bg-gradient-to-b from-purple-50 via-pink-50/40 to-white">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-800">
              Hi, {me.display_name}! <span aria-hidden>👋</span>
            </h1>
            <p className="flex items-center gap-1.5 font-medium text-purple-500">
              <Sparkles className="h-4 w-4" strokeWidth={2.2} />
              {greeting}
            </p>
          </div>
          <LogoutButton />
        </div>

        <div className="mb-8 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-purple-100">
          <div className="flex-1">
            <XPBar xpTotal={me.xp_total} />
          </div>
          <StreakBadge streakDays={me.streak_days} />
        </div>

        {subjectsWithTopics.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/60 px-6 py-12 text-center ring-1 ring-purple-100">
            <Compass className="h-8 w-8 text-purple-300" strokeWidth={1.75} />
            <p className="text-zinc-400">No quests yet — ask a parent to upload a worksheet!</p>
          </div>
        )}

        {subjectsWithTopics.map(({ subject, topics }) => (
          <section key={subject.id} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-purple-400 uppercase">{subject.name}</h2>
            <ProgressTrail studentId={me.id} topics={topics} masteryByTopic={masteryByTopic} />
          </section>
        ))}
      </div>
    </div>
  );
}
