import { BookOpen, ChevronRight, Compass } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { getStudentToken } from "@/lib/session";

export default async function MySubjectsPage({
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

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-zinc-800">
        <BookOpen className="h-6 w-6 text-sky-500" strokeWidth={2.2} />
        My Subjects
      </h1>
      <p className="mb-6 text-sm text-zinc-500">Pick a subject to get help understanding it, then practice.</p>

      {subjects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/60 px-6 py-12 text-center ring-1 ring-sky-100">
          <Compass className="h-8 w-8 text-sky-300" strokeWidth={1.75} />
          <p className="text-zinc-400">No subjects assigned yet — ask a parent to assign one!</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {subjects.map((s) => (
            <li key={s.id}>
              <Link
                href={`/student/${studentId}/subjects/${s.id}`}
                className="flex items-center gap-4 rounded-2xl border-2 border-sky-100 bg-white px-4 py-4 shadow-sm transition hover:scale-[1.01] hover:border-sky-200 hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                  <BookOpen className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="flex-1">
                  <span className="block font-semibold text-zinc-800">{s.name}</span>
                  <span className="text-xs text-zinc-400">
                    {s.grade_level && `Grade ${s.grade_level} · `}
                    {s.topics.length} topic{s.topics.length === 1 ? "" : "s"}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 text-sky-400" strokeWidth={2.2} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
