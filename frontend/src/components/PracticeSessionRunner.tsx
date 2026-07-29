"use client";

import { useEffect, useState } from "react";
import { Loader2, PartyPopper } from "lucide-react";
import LearningTools from "@/components/LearningTools";
import QuestionCard from "@/components/QuestionCard";
import QuestionNavigator, { type NavigatorItem } from "@/components/QuestionNavigator";
import StreakBadge from "@/components/StreakBadge";
import XPBar from "@/components/XPBar";
import { revealAnswer, submitAnswer, useQuizProgress } from "@/lib/useQuizProgress";
import type { AttemptResult, QuestionFilter, QuestionOut } from "@/lib/api";

const FILTER_LABEL: Record<QuestionFilter, string> = {
  all: "All questions",
  missed_1st: "Missed on 1st attempt",
  missed_2nd: "Missed on 2nd attempt",
};

export default function PracticeSessionRunner({
  studentId,
  topicId,
  filter,
  initialXpTotal,
  initialStreakDays,
}: {
  studentId: string;
  topicId: string;
  filter: QuestionFilter;
  initialXpTotal: number;
  initialStreakDays: number;
}) {
  const [questions, setQuestions] = useState<QuestionOut[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answeredMap, setAnsweredMap] = useState<Record<string, boolean>>({});
  const { xpTotal, streakDays, celebrating, applyResult } = useQuizProgress(initialXpTotal, initialStreakDays);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on mount/topic/filter change is intentional
    setLoading(true);
    setError(null);
    fetch(`/api/quiz/questions?topic_id=${topicId}&filter=${filter}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't load questions for this topic.");
        return data as QuestionOut[];
      })
      .then((data) => {
        setQuestions(data);
        setCurrentIndex(0);
        setAnsweredMap({});
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load questions for this topic."))
      .finally(() => setLoading(false));
  }, [topicId, filter]);

  const question = questions && currentIndex < questions.length ? questions[currentIndex] : null;
  const correctCount = Object.values(answeredMap).filter(Boolean).length;
  const answeredCount = Object.keys(answeredMap).length;

  async function handleSubmit(answer: string, selfReportedCorrect?: boolean, isRetry?: boolean): Promise<AttemptResult> {
    const result = await submitAnswer(studentId, question!.id, answer, selfReportedCorrect, isRetry);
    applyResult(result);
    if (!result.can_retry) {
      setAnsweredMap((prev) => ({ ...prev, [question!.id]: result.is_correct }));
    }
    return result;
  }

  function handleNext() {
    setCurrentIndex((i) => i + 1);
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-sky-100">
        <div className="flex-1">
          <XPBar xpTotal={xpTotal} celebrate={celebrating} />
        </div>
        <StreakBadge streakDays={streakDays} />
      </div>

      {loading && (
        <p className="flex items-center justify-center gap-2 text-center text-sky-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading questions...
        </p>
      )}
      {error && <p className="text-center text-rose-500">{error}</p>}

      {questions && questions.length === 0 && (
        <p className="text-center text-sky-400">
          No questions match &ldquo;{FILTER_LABEL[filter]}&rdquo; for this topic right now.
        </p>
      )}

      {questions && questions.length > 0 && (
        <div className="flex flex-col gap-5 lg:flex-row">
          <QuestionNavigator
            items={questions.map((q, i): NavigatorItem => ({
              id: q.id,
              label: String(i + 1),
              state: q.id in answeredMap ? (answeredMap[q.id] ? "correct" : "incorrect") : "unanswered",
            }))}
            correctCount={correctCount}
            totalCount={questions.length}
            currentIndex={currentIndex}
            onSelect={setCurrentIndex}
          />

          <div className="min-w-0 flex-1">
            {question && (
              <>
                <QuestionCard
                  key={question.id}
                  question={question}
                  onSubmit={handleSubmit}
                  onReveal={() => revealAnswer(question.id)}
                  onNext={handleNext}
                />
                <LearningTools topicId={topicId} subjectId={question.subject_id} subjectName={question.subject_name} />
              </>
            )}
            {!question && (
              <div className="flex flex-col items-center gap-2 rounded-3xl bg-white p-10 text-center shadow-lg ring-1 ring-sky-100">
                <PartyPopper className="h-8 w-8 text-amber-500" strokeWidth={2} />
                <p className="font-semibold text-zinc-800">Session complete!</p>
                <p className="text-sm text-zinc-500">
                  {correctCount} / {answeredCount} correct this session.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
