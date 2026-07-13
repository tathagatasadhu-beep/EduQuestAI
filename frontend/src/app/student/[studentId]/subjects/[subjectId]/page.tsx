import { ArrowLeft, Dumbbell } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { getStudentToken } from "@/lib/session";
import ProgressTrail from "@/components/ProgressTrail";
import TutorChat from "@/components/TutorChat";

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ studentId: string; subjectId: string }>;
}) {
  const { studentId, subjectId } = await params;
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

  const subject = subjects.find((s) => s.id === subjectId);
  if (!subject) notFound();

  const masteryByTopic = new Map(mastery.map((m) => [m.topic_id, m]));
  const topicsWithSubjectId = subject.topics.map((t) => ({ ...t, subject_id: subject.id }));

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href={`/student/${studentId}/subjects`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-purple-500 hover:text-purple-700"
      >
        <ArrowLeft className="h-4 w-4" />
        My Subjects
      </Link>

      <h1 className="mb-1 text-2xl font-bold text-zinc-800">{subject.name}</h1>
      {subject.grade_level && <p className="mb-5 text-sm text-zinc-400">Grade {subject.grade_level}</p>}

      <section className="mb-8">
        <TutorChat subjectId={subject.id} subjectName={subject.name} />
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-purple-400 uppercase">
          <Dumbbell className="h-4 w-4" strokeWidth={2.2} />
          Practice
        </h2>
        <ProgressTrail studentId={studentId} topics={topicsWithSubjectId} masteryByTopic={masteryByTopic} />
      </section>
    </div>
  );
}
