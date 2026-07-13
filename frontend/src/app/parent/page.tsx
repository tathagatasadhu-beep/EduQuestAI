import { BookOpen, Sparkles, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, api, type MasteryStat } from "@/lib/api";
import { getParentToken } from "@/lib/session";
import AddStudentForm from "./AddStudentForm";
import StudentSettings from "./StudentSettings";
import LogoutButton from "@/components/LogoutButton";
import StreakBadge from "@/components/StreakBadge";
import XPBar from "@/components/XPBar";

const AVATAR_COLORS = [
  "bg-brand-500",
  "bg-pink-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-purple-500",
];

function avatarColor(name: string) {
  const sum = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export default async function ParentDashboardPage() {
  const token = await getParentToken();
  if (!token) redirect("/parent/login");

  let students: Awaited<ReturnType<typeof api.listStudents>>;
  let subjects: Awaited<ReturnType<typeof api.listSubjects>>;
  try {
    [students, subjects] = await Promise.all([api.listStudents(token), api.listSubjects()]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/parent/login");
    throw err;
  }

  const masteryEntries = await Promise.all(
    students.map(async (s) => {
      try {
        return [s.id, await api.getMastery(token, s.id)] as const;
      } catch {
        return [s.id, [] as MasteryStat[]] as const;
      }
    })
  );
  const masteryByStudent = new Map(masteryEntries);

  const topicEntries = await Promise.all(
    subjects.map(async (s) => [s.id, await api.listTopics(s.id)] as const)
  );
  const topicsBySubject = Object.fromEntries(topicEntries);

  const assignmentEntries = await Promise.all(
    students.map(async (s) => {
      try {
        return [s.id, await api.listAssignments(token, s.id)] as const;
      } catch {
        return [s.id, [] as Awaited<ReturnType<typeof api.listAssignments>>] as const;
      }
    })
  );
  const assignmentsByStudent = new Map(assignmentEntries);

  return (
    <div className="min-h-full bg-parent-bg">
      <header className="sticky top-0 z-10 border-b border-brand-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-500" strokeWidth={2.2} />
            <span className="font-bold text-navy-900">EduQuestAI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/parent/library" className="text-sm font-medium text-zinc-500 hover:text-zinc-800">
              Library
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-8 text-2xl font-bold text-navy-900">Parent Dashboard</h1>

        <section className="mb-10">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-navy-600 uppercase">
            <Users className="h-4 w-4" strokeWidth={2.2} />
            Students
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {students.map((s) => {
              const mastery = masteryByStudent.get(s.id) ?? [];
              const overallAccuracy = mastery.length
                ? Math.round(mastery.reduce((sum, m) => sum + m.accuracy_rate, 0) / mastery.length)
                : null;
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColor(s.display_name)}`}
                      >
                        {s.display_name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <p className="font-semibold text-zinc-800">{s.display_name}</p>
                        {s.grade_level && <p className="text-xs text-zinc-400">Grade {s.grade_level}</p>}
                      </div>
                    </div>
                    <StreakBadge streakDays={s.streak_days} />
                  </div>
                  <XPBar xpTotal={s.xp_total} />
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-zinc-500">
                    <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} />
                    {overallAccuracy === null ? "No practice yet" : `${overallAccuracy}% overall accuracy`}
                  </p>
                  <StudentSettings
                    student={s}
                    subjects={subjects}
                    topicsBySubject={topicsBySubject}
                    initialAssignments={assignmentsByStudent.get(s.id) ?? []}
                  />
                </div>
              );
            })}
            <AddStudentForm />
          </div>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-navy-600 uppercase">
            <BookOpen className="h-4 w-4" strokeWidth={2.2} />
            Worksheet Library
          </h2>
          <Link
            href="/parent/library"
            className="flex items-center justify-between rounded-2xl border border-brand-100 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <div>
              <p className="font-semibold text-zinc-800">
                {subjects.length} subject{subjects.length === 1 ? "" : "s"}
              </p>
              <p className="text-sm text-zinc-500">Upload worksheets, organize by grade, and manage what&apos;s assigned to each student.</p>
            </div>
            <span className="text-sm font-medium text-brand-600">Manage library →</span>
          </Link>
        </section>
      </div>
    </div>
  );
}
