"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import LearningTools from "@/components/LearningTools";
import QuestionCard from "@/components/QuestionCard";
import QuestionNavigator, { type NavigatorItem, type NavigatorItemState } from "@/components/QuestionNavigator";
import StreakBadge from "@/components/StreakBadge";
import XPBar from "@/components/XPBar";
import { revealAnswer, submitAnswer, useQuizProgress } from "@/lib/useQuizProgress";
import type { AttemptResult, QuestionOut } from "@/lib/api";

export default function QuizRunner({
  studentId,
  topicId,
  initialXpTotal,
  initialStreakDays,
}: {
  studentId: string;
  topicId: string;
  initialXpTotal: number;
  initialStreakDays: number;
}) {
  // The adaptive engine only knows what's next once asked — unlike
  // PracticeSessionRunner's pre-known fixed list, this sidebar grows one
  // pill at a time as next-question is called, rather than showing the
  // whole topic up front.
  const [served, setServed] = useState<QuestionOut[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, NavigatorItemState>>({});
  const [viewingIndex, setViewingIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { xpTotal, streakDays, celebrating, applyResult } = useQuizProgress(initialXpTotal, initialStreakDays);

  const question = viewingIndex >= 0 ? served[viewingIndex] : null;
  const correctCount = Object.values(statusMap).filter((s) => s === "correct").length;

  async function loadNext() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/quiz/next-question?topic_id=${topicId}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "No more questions available in this topic right now.");
      return;
    }
    const newQuestion = data as QuestionOut;
    setServed((prev) => {
      // Once every question in a topic is mastered, next-question's "stalest
      // practiced" fallback can legitimately re-serve one already in this
      // sitting's served list — append a duplicate array entry for the same
      // question.id and React's keyed lists (sidebar pills, QuestionCard's
      // own key) collide. Jump to the existing entry instead of duplicating it.
      const existingIndex = prev.findIndex((q) => q.id === newQuestion.id);
      if (existingIndex !== -1) {
        setViewingIndex(existingIndex);
        return prev;
      }
      setViewingIndex(prev.length);
      return [...prev, newQuestion];
    });
    setStatusMap((prev) => (newQuestion.id in prev ? prev : { ...prev, [newQuestion.id]: "unanswered" }));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on mount/topic change is intentional
    setServed([]);
    setStatusMap({});
    setViewingIndex(-1);
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  // After finishing whichever question is currently shown: if it's the most
  // recently served one, fetch a fresh one; if the student navigated back to
  // an earlier skipped question, return to the frontier instead of fetching
  // (it may still be unresolved, or may already be done).
  function advance() {
    const frontier = served.length - 1;
    if (viewingIndex >= frontier) {
      loadNext();
    } else {
      setViewingIndex(frontier);
    }
  }

  async function handleSubmit(answer: string, selfReportedCorrect?: boolean, isRetry?: boolean): Promise<AttemptResult> {
    const result = await submitAnswer(studentId, question!.id, answer, selfReportedCorrect, isRetry);
    applyResult(result);
    if (!result.can_retry) {
      setStatusMap((prev) => ({ ...prev, [question!.id]: result.is_correct ? "correct" : "incorrect" }));
    }
    return result;
  }

  function handleSkip() {
    setStatusMap((prev) => ({ ...prev, [question!.id]: "skipped" }));
    advance();
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-sky-100">
        <div className="flex-1">
          <XPBar xpTotal={xpTotal} celebrate={celebrating} />
        </div>
        <StreakBadge streakDays={streakDays} />
      </div>

      {loading && served.length === 0 && (
        <p className="flex items-center justify-center gap-2 text-center text-sky-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading question...
        </p>
      )}
      {error && !question && <p className="text-center text-rose-500">{error}</p>}

      {question && (
        <div className="flex flex-col gap-5 lg:flex-row">
          <QuestionNavigator
            items={served.map((q, i): NavigatorItem => ({
              id: q.id,
              label: String(i + 1),
              state: statusMap[q.id] ?? "unanswered",
            }))}
            correctCount={correctCount}
            totalCount={served.length}
            currentIndex={viewingIndex}
            onSelect={setViewingIndex}
          />
          <div className="min-w-0 flex-1">
            <p className="mb-3 text-center text-sm font-medium text-sky-400">Question {viewingIndex + 1}</p>
            <QuestionCard
              key={question.id}
              question={question}
              onSubmit={handleSubmit}
              onReveal={() => revealAnswer(question.id)}
              onNext={advance}
              onSkip={viewingIndex === served.length - 1 ? handleSkip : undefined}
            />
            <LearningTools topicId={topicId} subjectId={question.subject_id} subjectName={question.subject_name} />
          </div>
        </div>
      )}
    </div>
  );
}
