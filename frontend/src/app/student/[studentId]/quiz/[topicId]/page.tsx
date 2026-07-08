import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { getStudentToken } from "@/lib/session";
import QuizRunner from "./QuizRunner";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ studentId: string; topicId: string }>;
}) {
  const { studentId, topicId } = await params;
  const token = await getStudentToken();
  if (!token) redirect("/student/login");

  let me: Awaited<ReturnType<typeof api.getMyProfile>>;
  try {
    me = await api.getMyProfile(token);
    if (me.id !== studentId) redirect(`/student/${me.id}/quiz/${topicId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/student/login");
    throw err;
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <Link
        href={`/student/${studentId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-purple-500 hover:text-purple-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to quests
      </Link>
      <QuizRunner
        studentId={studentId}
        topicId={topicId}
        initialXpTotal={me.xp_total}
        initialStreakDays={me.streak_days}
      />
    </div>
  );
}
