import { Compass, Dumbbell } from "lucide-react";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { getStudentToken } from "@/lib/session";
import PracticeSelector from "@/components/PracticeSelector";

export default async function PracticePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const token = await getStudentToken();
  if (!token) redirect("/student/login");

  let subjects: Awaited<ReturnType<typeof api.getMyAssignedSubjects>>;
  try {
    subjects = await api.getMyAssignedSubjects(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/student/login");
    throw err;
  }

  const subjectsWithTopics = subjects.filter((s) => s.topics.length > 0);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-zinc-800">
        <Dumbbell className="h-6 w-6 text-sky-500" strokeWidth={2.2} />
        Practice
      </h1>
      <p className="mb-6 text-sm text-zinc-500">Pick a subject and topic, then start practicing.</p>

      {subjectsWithTopics.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/60 px-6 py-12 text-center ring-1 ring-sky-100">
          <Compass className="h-8 w-8 text-sky-300" strokeWidth={1.75} />
          <p className="text-zinc-400">No topics to practice yet — ask a parent to assign a subject!</p>
        </div>
      ) : (
        <PracticeSelector studentId={studentId} subjects={subjectsWithTopics} />
      )}
    </div>
  );
}
