import { Compass, Dumbbell } from "lucide-react";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { getStudentToken } from "@/lib/session";
import ProgressTrail from "@/components/ProgressTrail";

export default async function PracticePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const token = await getStudentToken();
  if (!token) redirect("/student/login");

  let subjects: Awaited<ReturnType<typeof api.getMyAssignedSubjects>>;
  let mastery: Awaited<ReturnType<typeof api.getMyMastery>>;
  try {
    [subjects, mastery] = await Promise.all([api.getMyAssignedSubjects(token), api.getMyMastery(token)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/student/login");
    throw err;
  }

  const masteryByTopic = new Map(mastery.map((m) => [m.topic_id, m]));
  const subjectsWithTopics = subjects.filter((s) => s.topics.length > 0);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-zinc-800">
        <Dumbbell className="h-6 w-6 text-purple-500" strokeWidth={2.2} />
        Practice
      </h1>
      <p className="mb-6 text-sm text-zinc-500">Jump straight into any topic you&apos;ve been assigned.</p>

      {subjectsWithTopics.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/60 px-6 py-12 text-center ring-1 ring-purple-100">
          <Compass className="h-8 w-8 text-purple-300" strokeWidth={1.75} />
          <p className="text-zinc-400">No topics to practice yet — ask a parent to assign a subject!</p>
        </div>
      ) : (
        subjectsWithTopics.map((subject) => (
          <section key={subject.id} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-purple-400 uppercase">{subject.name}</h2>
            <ProgressTrail
              studentId={studentId}
              topics={subject.topics.map((t) => ({ ...t, subject_id: subject.id }))}
              masteryByTopic={masteryByTopic}
            />
          </section>
        ))
      )}
    </div>
  );
}
