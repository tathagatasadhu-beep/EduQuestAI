import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import type { QuestionFilter } from "@/lib/api";
import { getStudentToken } from "@/lib/session";
import QuizRunner from "./QuizRunner";
import PracticeSessionRunner from "@/components/PracticeSessionRunner";
import ReferenceMaterials from "@/components/ReferenceMaterials";

const VALID_FILTERS: QuestionFilter[] = ["all", "missed_1st", "missed_2nd"];

export default async function QuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string; topicId: string }>;
  searchParams: Promise<{ mode?: string; filter?: string }>;
}) {
  const { studentId, topicId } = await params;
  const { mode, filter } = await searchParams;
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

  // "mode=session" (set by the Practice tab's Subject/Topic/Filter selector)
  // gets the fixed-list session UI with a question sidebar; any other entry
  // point (e.g. a ProgressTrail topic card) keeps the original one-question-
  // at-a-time adaptive QuizRunner, unchanged.
  const isSession = mode === "session";
  const sessionFilter: QuestionFilter = VALID_FILTERS.includes(filter as QuestionFilter)
    ? (filter as QuestionFilter)
    : "all";

  return (
    <div className={`mx-auto px-6 py-10 ${isSession ? "max-w-5xl" : "max-w-3xl"}`}>
      <Link
        href={`/student/${studentId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-sky-500 hover:text-sky-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to quests
      </Link>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          {isSession ? (
            <PracticeSessionRunner
              studentId={studentId}
              topicId={topicId}
              filter={sessionFilter}
              initialXpTotal={me.xp_total}
              initialStreakDays={me.streak_days}
            />
          ) : (
            <QuizRunner
              studentId={studentId}
              topicId={topicId}
              initialXpTotal={me.xp_total}
              initialStreakDays={me.streak_days}
            />
          )}
        </div>
        <aside className="w-full shrink-0 lg:w-72">
          <ReferenceMaterials topicId={topicId} />
        </aside>
      </div>
    </div>
  );
}
